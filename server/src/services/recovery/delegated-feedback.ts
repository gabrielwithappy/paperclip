import { executionBlockerPredicate } from "../execution-blocker.js";
import { systemNoticePresentation, keyValueRow } from "./notice-format.js";
import { and, asc, eq, gt, notInArray, sql } from "drizzle-orm";
import { issueComments, issueRecoveryActions, issueRelations, issues, type Db } from "@paperclipai/db";
import { issueService } from "../issues.js";
import { logActivity } from "../activity-log.js";
import { DELIVERY_QUEUES } from "../delivery-work-notifications.js";
import { registerScopedDeadlineWork } from "../scoped-deadline-work.js";
import type { createDeliveryWorkCoordinator } from "../delivery-work-coordinator.js";

// An incident, not repeated reconciliation attempts, owns delivery. A changed
// source run creates a different message; an evidence update does not.
function incidentKey() {
  return sql<string>`coalesce(${issueRecoveryActions.evidence}->>'runId', ${issueRecoveryActions.evidence}->>'sourceRunId', '')`;
}
function blockedIncident() {
  return and(executionBlockerPredicate(), sql`((${issueRecoveryActions.ownerType} = 'board'
    and ${issueRecoveryActions.status} in ('active', 'escalated'))
    or (${issueRecoveryActions.status} = 'resolved' and ${issueRecoveryActions.outcome} = 'blocked'))`)!;
}
function pending() {
  return sql`${blockedIncident()} and ${issueRecoveryActions.evidence}->>'delegatedFeedbackIncident' is distinct from ${incidentKey()}`;
}

/** Delivery records an explicit waiting path. It does not grant a blocked
 * caller permission to execute or turn structural ancestors into recipients. */
export async function deliverDelegatedRecoveryFeedback(db: Db, input: { companyId: string; id: string }) {
  return db.transaction(async transaction => {
    const tx = transaction as unknown as Db;
    await tx.execute(sql`select set_config('lock_timeout', '1000', true)`);
    const [candidate] = await tx.select({ sourceIssueId: issueRecoveryActions.sourceIssueId }).from(issueRecoveryActions)
      .where(and(eq(issueRecoveryActions.companyId, input.companyId), eq(issueRecoveryActions.id, input.id), pending()));
    if (!candidate) return;
    const [source] = await tx.select().from(issues).where(and(eq(issues.companyId, input.companyId),
      eq(issues.id, candidate.sourceIssueId))).for("update");
    if (!source) return;
    const recipients = [source];
    if (!["done", "cancelled"].includes(source.status)) {
      const dependents = await tx.select({ issue: issues }).from(issueRelations).innerJoin(issues,
        and(eq(issues.id, issueRelations.relatedIssueId), eq(issues.companyId, issueRelations.companyId)))
        .where(and(eq(issueRelations.companyId, input.companyId), eq(issueRelations.issueId, source.id),
          eq(issueRelations.type, "blocks"), notInArray(issues.status, ["done", "cancelled"]))).for("update", { of: issues });
      for (const { issue } of dependents) {
        // Never copy private task evidence into a broader audience. The private
        // source retains its notice and existing access-filtered blocker view.
        if (issue.id !== source.id && (!source.projectId || source.projectId === issue.projectId) && (source.visibility === "open" ||
          issue.visibility === "private" && (issue.privacyRootIssueId ?? issue.id) === (source.privacyRootIssueId ?? source.id))) recipients.push(issue);
      }
    }
    const [action] = await tx.select({ row: issueRecoveryActions, incident: incidentKey() }).from(issueRecoveryActions)
      .where(and(eq(issueRecoveryActions.companyId, input.companyId), eq(issueRecoveryActions.id, input.id), pending())).for("update");
    if (!action) return;
    for (const recipient of recipients) {
      if (["done", "cancelled"].includes(recipient.status)) continue;
      // Keep dedupe in immutable notices as well as the action cursor: existing
      // recovery writers may replace their evidence object on later attempts.
      const [existing] = await tx.select({ id: issueComments.id }).from(issueComments).where(and(
        eq(issueComments.companyId, input.companyId), eq(issueComments.issueId, recipient.id),
        eq(issueComments.authorType, "system"), sql`${issueComments.metadata}->'sections' @> ${JSON.stringify([{ title: 'Recovery', rows: [{ type: 'key_value', label: 'Recovery action', value: action.row.id }] }])}::jsonb`,
        sql`${issueComments.metadata}->>'sourceRunId' is not distinct from ${action.incident || null}`)).limit(1);
      if (existing) continue;
      const sourceNotice = recipient.id === source.id;
      const body = sourceNotice
        ? "Automatic recovery cannot continue safely. Saving a request does not mean execution has started. Paperclip is holding further execution because the previous execution has no verified safe continuation. The board owns the recovery decision; inspect the recovery action before retrying."
        : `Dependency ${source.identifier ?? source.id} cannot continue safely. Saving another request does not mean that task has started. This task is waiting for its recovery decision; do not repeat the delegation. The board owns the recovery decision on the dependency.`;
      // System comments use the existing notice UI and audit path. In particular,
      // they do not wake paused, cancelled, budget-held or approval-held callers.
      const comment = await issueService(tx).addComment(recipient.id, body, {}, {
        authorType: "system", presentation: systemNoticePresentation({ title: sourceNotice ? "Recovery needs attention" : "Dependency recovery needs attention", tone: "warning" }),
        metadata: { version: 1, sourceRunId: action.incident || null, recoveryResponsibility: "system", sections: [{ title: "Recovery", rows: [keyValueRow("Recovery action", action.row.id), keyValueRow("Next owner", "Board"), keyValueRow("Next action", "Inspect the dependency recovery action. Execution remains held until it is safe to continue.")] }] },
      }, tx);
      await logActivity(tx, { companyId: input.companyId, actorType: "system", actorId: "recovery", action: "issue.comment_added",
        entityType: "issue", entityId: recipient.id, details: { commentId: comment.id, recoveryActionId: action.row.id } });
    }
    await tx.update(issueRecoveryActions).set({ evidence: sql`${issueRecoveryActions.evidence} ||
      jsonb_build_object('delegatedFeedbackIncident', ${action.incident}::text)` })
      .where(and(eq(issueRecoveryActions.id, action.row.id), eq(issueRecoveryActions.companyId, input.companyId)));
  });
}

export function registerDelegatedRecoveryFeedback(db: Db, coordinator: ReturnType<typeof createDeliveryWorkCoordinator>, canRun: () => boolean) {
  const cursors = new Map<string, string>();
  return registerScopedDeadlineWork(coordinator, {
    queue: DELIVERY_QUEUES.delegatedRecoveryFeedback,
    decodeScope: (hint: string): { companyId: string } | undefined => hint === "*" ? undefined : JSON.parse(hint),
    matches: (entry: { id: string; companyId: string; dueAt: number }, scope?: { companyId: string }) => !scope || entry.companyId === scope.companyId,
    load: async scope => {
      const key = scope?.companyId ?? "*";
      const cursor = cursors.get(key);
      const rows = await db.select({ id: issueRecoveryActions.id, companyId: issueRecoveryActions.companyId }).from(issueRecoveryActions)
        .where(and(pending(), scope ? eq(issueRecoveryActions.companyId, scope.companyId) : undefined,
          cursor ? gt(issueRecoveryActions.id, cursor) : undefined)).orderBy(asc(issueRecoveryActions.id)).limit(100);
      const complete = rows.length < 100;
      if (complete) cursors.delete(key); else cursors.set(key, rows.at(-1)!.id);
      return { rows: rows.map(row => ({ ...row, dueAt: 0 })), complete };
    },
    check: async entry => { await deliverDelegatedRecoveryFeedback(db, entry); return null; },
  }, canRun);
}
