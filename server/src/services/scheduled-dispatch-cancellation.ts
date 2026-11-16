import { and, eq, sql } from "drizzle-orm";
import { agentWakeupRequests, environmentLeases, heartbeatRunEvents, heartbeatRuns, nativeRunFinalizations, type Db } from "@paperclipai/db";
import { PROCESS_IDENTITY_RECORDED, PROCESS_START_REQUESTED } from "./native-local-process-stop.js";

/** A scheduler placeholder has never owned execution. The producer evaluates
 * this while fencing the same run row that promotion/claim locks. Missing PIDs
 * alone, or a historical cancelled row, cannot manufacture this receipt. */
function noDispatchEvidence() {
  return sql`${heartbeatRuns.runtimeMode} = 'legacy'
    and ${heartbeatRuns.startedAt} is null and ${heartbeatRuns.runtimeModeResolvedAt} is null
    and ${heartbeatRuns.executionStage} is null and ${heartbeatRuns.controllerBootId} is null
    and ${heartbeatRuns.controllerLeaseExpiresAt} is null
    and ${heartbeatRuns.processPid} is null and ${heartbeatRuns.processGroupId} is null
    and ${heartbeatRuns.processStartedAt} is null and ${heartbeatRuns.sessionIdAfter} is null
    and ${heartbeatRuns.nativeIssueId} is null and ${heartbeatRuns.nativeSessionId} is null
    and not exists (select 1 from ${agentWakeupRequests}
      where ${agentWakeupRequests.id} = ${heartbeatRuns.wakeupRequestId} and ${agentWakeupRequests.claimedAt} is not null)
    and not exists (select 1 from ${environmentLeases} where ${environmentLeases.heartbeatRunId} = ${heartbeatRuns.id})
    and not exists (select 1 from ${nativeRunFinalizations} where ${nativeRunFinalizations.runId} = ${heartbeatRuns.id})
    and not exists (select 1 from ${heartbeatRunEvents} where ${heartbeatRunEvents.runId} = ${heartbeatRuns.id}
      and (${heartbeatRunEvents.sourceEventId} is not null or ${heartbeatRunEvents.eventType} in
        ('adapter.invoke', ${PROCESS_START_REQUESTED}, ${PROCESS_IDENTITY_RECORDED}, 'harness.ready',
         'session.started', 'session.resumed', 'session.updated', 'turn.started', 'provider.event',
         'provider.rpc_result', 'tool.execution.started')))`;
}

export function scheduledDispatchCancellationProof() {
  return sql`coalesce(${heartbeatRuns.status} = 'scheduled_retry' and ${noDispatchEvidence()}, false)`;
}

export async function isCancelledScheduledDispatch(db: Db, run: { id: string; companyId: string; status: string; resultJson: Record<string, unknown> | null }) {
  const receipt = run.resultJson?.startupCancellation as Record<string, unknown> | undefined;
  if (run.status !== "cancelled" || receipt?.beforeScheduledDispatch !== true) return false;
  const [proof] = await db.select({ id: heartbeatRuns.id }).from(heartbeatRuns).where(and(
    eq(heartbeatRuns.id, run.id), eq(heartbeatRuns.companyId, run.companyId), eq(heartbeatRuns.status, "cancelled"),
    sql`${heartbeatRuns.finishedAt} is not null`,
    sql`${heartbeatRuns.resultJson}->'startupCancellation'->'beforeScheduledDispatch' = 'true'::jsonb`,
    noDispatchEvidence(),
  )).limit(1);
  return Boolean(proof);
}

/** Used by terminal scheduler CAS writers as well as Stop's earlier fence. */
export function scheduledDispatchCancellationResult(now: Date) {
  return sql`coalesce(${heartbeatRuns.resultJson}, '{}'::jsonb) || jsonb_build_object('startupCancellation',
    coalesce(${heartbeatRuns.resultJson}->'startupCancellation', '{}'::jsonb) ||
    jsonb_build_object('requestedAt', ${now.toISOString()}::text, 'beforeScheduledDispatch', ${scheduledDispatchCancellationProof()}))`;
}
