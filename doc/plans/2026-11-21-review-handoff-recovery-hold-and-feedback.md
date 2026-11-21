# Review Handoff Recovery Hold Fix Plan

- **Date**: 2026-11-21
- **Status**: Implementation completed (Vitest 203/203 passed; typecheck skipped per host OOM policy)
- **Trigger Incident**: `GAB-173` / `GAB-176` (2026-11-21 14:16 KST)

## 1. Background & Root Cause

`GAB-176` 담당 에이전트(`소피`)가 구현을 마치고 리뷰어(`엘리스(VP)`)에게 `in_review`로 인계하는 과정에서 다음 연쇄 문제가 발생해 리뷰 진행이 멈췄다.

1. [`server/src/routes/issues.ts`](../../server/src/routes/issues.ts#L14633-L14672)의 `assigneeWillChange` 분기에서, 에이전트가 자기 자신의 활성 런(`4bf8f514`) 안에서 정상적으로 리뷰어에게 `in_review` 스테이지를 인계할 때도 `heartbeat.cancelRun(..., { errorCode: "issue_reassigned", resultJson: { reassignmentStopConfirmed: true, issueMutationStopId } })`로 자기 런을 취소한다.
2. [`server/src/services/legacy-execution-recovery.ts`](../../server/src/services/legacy-execution-recovery.ts#L47-L83)의 `legacyExecutionNeedsReconciliation()`은 이 정상 셀프 리뷰 핸드오프 취소(`issue_reassigned`)를 비정상/불확실 중단과 구분하지 못하고 `true`를 반환한다.
3. 그 결과 `preserve_without_replay_v1` 복구 액션(`134da1be`, `status: "resolved"`, `outcome: "blocked"`, `replay: "blocked"`)이 생성되어, 직후 생성된 리뷰어 웨이크업(`execution_review_requested`, `03fcf1fc`)이 `deferred_issue_execution`으로 보류되었다.

## 2. Scope & Non-Goals (Reviewed)

### In Scope (이번 구현 범위)
- **정상 `in_review` 셀프 핸드오프 시 `issue_reassigned` 복구 차단 방지**:
  - 기존 `cancelRun` 호출 자체는 유지하여 나가는(outgoing) 에이전트 런이 리뷰어 실행 전에 안전하게 종료되도록 한다 (`still stops the outgoing run before an agent handoff` 계약 및 실행 락 직렬화 유지).
  - 단, 아래 엄격한 조건을 모두 만족하는 **에이전트 자신의 `in_review` 스테이지 핸드오프**인 경우 `cancelRun`의 `resultJson`에 `reviewSelfHandoffConfirmed: true`를 기록한다:
    - `req.actor.type === "agent"`이고 `req.actor.agentId === existing.assigneeAgentId`
    - `runToStopForReassignment.id === req.actor.runId`, `runToStopForReassignment.agentId === req.actor.agentId`, `runToStopForReassignment.companyId === existing.companyId`
    - `runToStopForReassignment.contextSnapshot?.issueId === existing.id`
    - `updateFields.status === "in_review"`이며 갱신될 `executionState`가 `status === "pending"`, `currentStageType === "review"`, 유효한 `currentParticipant`를 가짐
  - `legacyExecutionNeedsReconciliation(run)`은 `run.status === "cancelled" && run.errorCode === "issue_reassigned" && run.resultJson?.reviewSelfHandoffConfirmed === true`인 경우 `false`를 반환한다. (단, 기존 `workspaceRestoreFailure` / `hasRequiredWorkspaceRecovery` 체크가 우선하므로 워크스페이스 복구 실패가 있으면 여전히 `true`를 반환해 안전 가드를 유지한다.)
  - `native` 런타임은 이미 `legacyExecutionNeedsReconciliation`에서 `false`를 반환하므로 기존 동작을 유지한다.

### Out of Scope / Deferred (리뷰 결과에 따라 이번 PR에서 제외)
- **`revalidateActiveSourceRecovery`의 `resolved(blocked)` 자동 해제**: 정상 리뷰 인계에서 차단 행 자체가 생성되지 않으면 불필요하며, `preserve_without_replay_v1` 안전 가드를 약화할 위험이 있어 제외한다. (기존 멈춘 `GAB-176` 건은 운영/UI에서 복구 또는 리뷰 완료로 해소)
- **보드 복구 대기 시 Slack/채팅 능동 알림(`delegated-feedback.ts`)**: 이번 버그와 인과관계가 없는 별도 기능 개선이며 `chat-channels` post-commit 경계 설계가 필요하므로 별도 이슈로 분리한다.

## 3. Verification Plan

1. **단위 테스트 (`server/src/services/legacy-execution-recovery.test.ts`)**
   - `status: "cancelled"`, `errorCode: "issue_reassigned"`, `resultJson: { reviewSelfHandoffConfirmed: true }` → `false`
   - `reviewSelfHandoffConfirmed`가 없는 일반 `issue_reassigned` 취소 → `true`
   - `reviewSelfHandoffConfirmed: true`여도 `workspaceRestoreFailure: "restore_unsafe_archive"`가 있으면 → `true`
2. **라우트 테스트 (`server/src/__tests__/issue-agent-mutation-ownership-routes.test.ts`)**
   - 에이전트가 자기 런 실행 중 `status: "in_review"` + 리뷰 스테이지(`executionState`)로 리뷰어에게 핸드오프 시 `cancelRun`에 `reviewSelfHandoffConfirmed: true`가 전달되는지 검증.
   - 일반 에이전트 재할당(리뷰 스테이지 아님) 또는 제3자/다른 런 재할당에서는 `reviewSelfHandoffConfirmed`가 전달되지 않는지 검증.
3. **타입체크 및 포맷 검증**
   - `pnpm --filter @paperclipai/server typecheck`
   - 관련 Vitest 스위트 실행
   - `git diff --check`
