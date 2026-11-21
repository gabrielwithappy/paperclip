---
status: complete
priority: high
updated: 2026-11-19
---

# Legacy review diagnosis

Outcome: explain GAB-146's missing review disposition and propose improvements using actual run evidence and a faithful review reproduction. Existing GAB-146 must remain unchanged. No credential values or private incident contents belong in public fixtures. Diagnosis and isolated tests are authorized; production behavior repair/rollout is a separate outcome.

## Verified evidence

- GAB-146 initial run had executionStage reviewer context; its recovery lacked that object. Both it and successful ordinary diagnostic GAB-149 used the same saved skill-version IDs and standard scope. This does not prove identical effective environment.
- GAB-149 showed token presence, a real PATCH and HTTP 200 plus persisted done. This proves that run's ordinary write capability only.
- recovery/service.ts creates review recovery with currentStageId/currentStageType/reviewRecoveryInstruction rather than executionStage. run-preparation.ts reads contextSnapshot.executionStage. The custom reviewRecoveryInstruction has no production consumer in wake prompt rendering.
- Executing the real renderPaperclipWakePrompt with that recovery payload produced instructionRendered=false, reviewerRoleRendered=false, promptChars=441. This establishes a recovery-input gap; it does not establish the cause of the original initial-turn omission.
- The previous logging edits remain in execute.ts, execute.test.ts and run-log-events.md. Latest installed build was restarted before GAB-149.

## Remaining acceptance

Reproduce through the real server wake-payload builder, compare the original reviewer context and recovery context, and verify whether the full prompt contains equivalent guidance elsewhere. Then run an isolated actual review with the exact provider configuration if authorized diagnostic access supports it; do not substitute a different free model or ordinary completion test. Report initial-turn uncertainty separately from proven recovery defects.

## Current state

The production builder/renderer characterization test passed: normal executionStage input renders the reviewer role, while review recovery input loses both the role and its decision instruction. Test: server/src/services/heartbeat/review-recovery-diagnostics.test.ts.

A normal authorized CLI board credential was available. Created isolated GAB-150 through the API (201), with the existing first PO reviewer policy and a simple saved sentence to review. Board-owned backlog then moved to in_review (200). The exact configured PO is executing run 57803542-2cf5-4de0-8ae2-0a0dc0bafe43. This is a simpler one-stage review, not a full GAB-146 equivalence test; handoff comment is Japanese and scope/criteria are Korean. No API method recipe was supplied. Existing GAB-146 unchanged.

The observed run and disposition are recorded below.


## Final diagnosis evidence

GAB-150 initial review run 57803542-2cf5-4de0-8ae2-0a0dc0bafe43 succeeded as an execution but left in_review and zero issue_execution_decisions. It searched the agent/file-sync directory and workspace using glob, never read the operational skill, called only get_issue_context, and claimed approval recorded in final prose. Preparation independently recorded restApiTokenProvided=true, restApiUrlProvided=true, restApiRunIdProvided=true and reviewRoleRendered=true. All 8 selected skill files were prepared. This reproduces the initial omission with the real configured PO and demonstrates that credential absence is unnecessary for this failure.

This is a simpler one-stage review with existing skill pins; it does not prove every historical environment fact or isolate a model-only defect. The observed causal chain is missing skill discovery -> no decision API recipe used -> prose substituted for mutation -> pending server decision. Recovery additionally loses its explicit instruction and reviewer stage context at the builder boundary. GAB-149's explicitly guided ordinary API success is a productive counterexample.

GAB-150 was cancelled through the normal board API (200) after evidence capture to prevent automatic test repeats. Original GAB-146 was not changed. No production behavior repair was made by this diagnosis.

Recommended correction: provide the exact operational skill entrypoint in trusted per-run guidance or verified native skill discovery; preserve reviewer identity and decision instruction in recovery; use the shared authorized status transition for an optional dedicated MCP tool; require decision receipts for completion reporting. Preserve all gates and bounded recovery. Validate with matched simple and original-like reviews; keep genuine denial and changes-requested cases.

## Completion

Diagnosis and improvement-direction report are complete. A production fix and live qualification of that fix remain separate implementation work. No further test execution is required for this report.

## Follow-up comparison

GAB-151 kept the same PO, one-stage policy, sentence, criteria and handoff comment as GAB-150; its title identified the comparison and its description added only an explicit `/home/gabriel/.claude/skills/paperclip/SKILL.md` entrypoint and instruction to read it. Run f62c1b27-5327-456a-9898-0da8f8e729c2 read the skill, checked API environment and submitted approval. The issue is done and issue_execution_decisions contains approved. This single pair supports entrypoint guidance as a practical correction, without isolating model randomness or proving a general success rate. Recovery defect remains a separate builder reproduction; no production repair deployed.
