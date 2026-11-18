import { describe, expect, it, vi } from "vitest";
import type { Db } from "@paperclipai/db";
import { renderPaperclipWakePrompt } from "@paperclipai/adapter-utils/server-utils";
import { buildPaperclipWakePayload } from "./run-preparation.js";

// Exercises the production builder and renderer with persisted review state.
describe("legacy review recovery diagnostic reproduction", () => {
  it("restores only a current persisted reviewer and renders decision repair guidance", async () => {
    let persisted: unknown[] = [{status: "in_review", executionState: {status: "pending",currentStageId: "stage-test",currentStageType: "review",currentParticipant: {type: "agent",agentId: "reviewer-test"}}}];
    const query: any = { from: () => query, where: () => query, leftJoin: () => query,
      orderBy: () => query, limit: () => query,
      then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(persisted).then(resolve) };
    const db = { select: vi.fn(() => query) } as unknown as Db;
    const instruction = "Submit the review decision now, or mark the issue blocked with the exact unblock action.";
    const common = { db, companyId: "company-test", agentId: "reviewer-test", wakeCommentRows: [],
      issueSummary: { id: "issue-test", identifier: "TEST-1", title: "Review fixture", description: "Review saved work.",
        status: "in_review", priority: "medium", workMode: "standard" } };
    const recovery = await buildPaperclipWakePayload({ ...common, contextSnapshot: {
      issueId: "issue-test", wakeReason: "execution_review_participant_recovery",
      currentStageId: "stage-test", currentStageType: "review", reviewRecoveryInstruction: instruction,
    } });
    const normal = await buildPaperclipWakePayload({ ...common, contextSnapshot: {
      issueId: "issue-test", wakeReason: "execution_review_requested", executionStage: {
        stageId: "stage-test", stageType: "review", wakeRole: "reviewer",
        currentParticipant: { type: "agent", agentId: "reviewer-test", userId: null },
        allowedActions: ["approve", "request_changes"],
      },
    } });
    expect(renderPaperclipWakePrompt(normal)).toContain("active reviewer");
    expect(renderPaperclipWakePrompt(recovery)).toContain("without a saved decision");
    expect(renderPaperclipWakePrompt(recovery)).not.toContain(instruction);
    expect(renderPaperclipWakePrompt(recovery)).toContain("active reviewer");
    expect(recovery?.executionStage).toMatchObject({ wakeRole: "reviewer" });
    for (const agentId of ["other-agent", undefined]) {
      const stale = await buildPaperclipWakePayload({ ...common, agentId, contextSnapshot: {
        issueId: "issue-test", wakeReason: "execution_review_participant_recovery",
        reviewRecoveryInstruction: instruction,
      } });
      expect(renderPaperclipWakePrompt(stale)).not.toContain("active reviewer");
      expect(renderPaperclipWakePrompt(stale)).not.toContain("without a saved decision");
    }
    for (const rows of [[], [{status: "done"}], [{status: "in_review", executionState: {status: "completed"}}]]) {
      persisted = rows;
      const stale = await buildPaperclipWakePayload({...common, contextSnapshot: {
        issueId: "issue-test", wakeReason: "execution_review_participant_recovery",
        executionStage: {wakeRole: "reviewer", stageType: "review", allowedActions: ["approve"]},
      }});
      expect(renderPaperclipWakePrompt(stale)).not.toContain("active reviewer");
      expect(stale?.dispositionRepair).toBeNull();
    }
    persisted = [{status: "in_review", executionState: {status: "pending", currentStageId: "approval-test",
      currentStageType: "approval", currentParticipant: {type: "agent", agentId: "reviewer-test"}}}];
    const approval = await buildPaperclipWakePayload({...common, contextSnapshot: {
      issueId: "issue-test", wakeReason: "execution_review_participant_recovery",
    }});
    expect(renderPaperclipWakePrompt(approval)).toContain("active approver");
  });
});
