---
status: complete
priority: high
updated: 2026-11-17T22:25:14+09:00
authorization: User authorized implementation of the canonical stage handoff recovery plan; deployment and original-task mutations remain excluded
reviewed_by: [qa_plan_review]
---

# 검토 인계의 cleanup 대기 보존·재개 개선 최종 계획

## 최종 계획 요약

QA 리뷰를 반영한 계획 확정본이다. 후속 사용자 지시로 구현을 진행하며 최신 코드·검증 상태는 Current state에 기록한다. 운영 복구와 배포는 별도 범위다.

- **확인한 문제:** 서버가 하루의 미해제 lease 때문에 유효한 엘리스 검토 요청을 보류했고, 48ms 뒤 lease가 반환됐다. 요청은 deferred 실행 의무가 아닌 skipped 진단 기록으로 남아 직접 재개 경로에 들어가지 않았다.
- **최소 수정 대상:** 서버가 현재 상태로 검증한 stage 인계를 영속 보존하고, cleanup 완료 후 기존 issue 큐 소비 경로로 현재 대상에게 한 번 재개한다. 단순 상태 문자열 변경이나 reason 이름만으로 권한을 부여하는 수정은 하지 않는다.
- **유지할 것:** lease 보호, 회사·권한·예산·Stop, stage/담당자 재검증, 중복 방지와 정상 skipped/취소 동작.
- **별도 조사:** GAB-144 예약·409·episode, 나머지 배정/상태/부모/의존성 신호 전체 정책. 별도 review backstop이 실제 사고를 복구하지 않은 최종 분기는 아직 미확인이다.
- **완료 증거:** 실제 stage fixture에서 cleanup 전 실행 0회 → 해제 후 유효한 대상 1회, stale/위조/Stop 뒤 0회, restart·동시 trigger에서도 유실·중복 없음.

본문 Approach가 현재 실행 계획이며, 뒤의 날짜별 조사 절은 근거와 가설 정정 기록이다.

## Outcome and scope

검토 stage 인계가 이전 executor의 cleanup 때문에 일시 보류되어도 현재 담당자에게 안전하게 재개되도록 한다. GAB-144 예약/repair 문제는 별도 조사로 유지한다. 정상적인 의존성·승인·예산·Stop은 유지한다. 작업 상태, 실행 예약, 실제 실행 시작, 산출물 완료를 서로 구분한다.

최초 요청의 산출물은 논의 가능한 계획문서였고, 이후 조사·진단 변경을 거쳐 이번 사용자 요청으로 아래 축소된 stage 인계 구현이 승인됐다. 원본 작업 재시도·완료 처리, 운영 배포·재시작, 운영 DB 변경은 수행하지 않는다. 각 구현 단계에 별도 승인 절차를 추가하지 않는다. 운영 복구 권한과 대상 범위는 별도로 명시한다.

저장소 작업 좌표는 이 문서 하나다. `doc/plans/` 사용은 AGENTS.md의 저장소 규칙을 따른다. Paperclip에 게시한 사본을 갱신할 때는 문서 revision을 확인하고 기존 승인된 plan을 덮어쓰지 않는다.

## 문제 정의와 정정

GAB-136을 단순한 계획 작성 작업으로 보고 자식이 blocked여도 완료시키자는 초기 가설은 철회한다. 실제 요청은 모닝 브리핑 루틴의 수정·검증이며, 해당 결과를 검토할 책임이 남아 있다.

| 작업 | 관측 상태 | 역할과 실제 관계 |
| --- | --- | --- |
| GAB-136 | todo, executionRunId=null | 모닝 브리핑 점검·수정의 상위 작업. 직접 blockedBy는 GAB-137 |
| GAB-137 | in_review, executionRunId=null | 루틴 수정·검증. 현재 담당 검토자는 엘리스. 최신 assignment wake가 skipped |
| GAB-144 | in_progress, executionRunId=null | 검토 wake 문제를 조사하는 기술 자식. blockedBy와 blocks는 모두 비어 있음 |

GAB-144는 구조상 GAB-136의 자식이지만 GAB-136의 직접 blocker는 아니다. `parentId`, 의존성, 검토 소유권, 실행 경로를 구분해야 한다. GAB-144의 API 상태도 관측 시점에는 blocked가 아니다. 사람이 말하는 “막혔다”와 저장된 status를 혼동하지 않는다.

## 관측 환경과 근거 수준

- 대상: 로컬 authenticated/private Paperclip, 회사 `0087aede-0d1d-4bdc-ae9a-9e9c70ac2428`.
- 사용자 URL: `https://gabriel-hp-elitebook-850-g7.tail35aacf.ts.net:8443`.
- 진단 접근: 기존에 저장된 Board CLI 인증으로 `http://127.0.0.1:3110/api`의 읽기 API 사용. 인증값·원시 환경변수는 문서에 복사하지 않는다.
- health commit: `896ea4132c7f6ecaa20b68904507daa288dda643`; 조사 checkout HEAD와 일치했다. 사고 당시 모든 프로세스가 같은 revision이었다는 독립 증거는 아직 없다.
- 2026-11-17 약 20:45 KST까지 실제 상태·wake·run·문서를 확인했다. 아래 값은 당시 스냅샷이며 구현 시작 전에 재조회해야 한다.
- GAB-144 보고서의 테스트 결과와 본 작업에서 실행한 진단 회귀 10개·admission suite 35개 및 서버 typecheck는 구분한다. lifecycle 보존·재개 수정의 성공 증거는 아직 없다.

### 주요 타임라인

모든 표시 시각은 2026-11-17 KST이며 괄호에 API UTC를 보존한다.

| 시각 | 관측 | 의미·한계 |
| --- | --- | --- |
| 11:37:13.800 (02:37:13.800Z) | 하루 run `94e12c58-018f-4c1a-b5ec-1f66d1a51bd1` cancelled, errorCode=issue_reassigned | 담당자 변경 취소 자체를 검토 실패의 원인으로 단정하지 않음 |
| 11:37:14.569→14.859 (02:37:14Z) | GAB-137 엘리스 assignment wake skipped, runId=null. 진단 API reason=other, 원본 reason=execution_reconciliation_required | 이전 executor의 환경 lease 미반환이 직접 거절 원인으로 확인됨 |
| 11:37:14.907 (02:37:14.907Z) | 하루 run의 local lease releasedAt 기록 | skipped 종료보다 48ms 뒤. 사용자 Cancel이 아니라 재배정 후 cleanup과 새 인계의 경합 |
| 13:29:35→13:34:52 (04:29~04:34Z) | GAB-144 최초 담당 run `c025ea6a-db1f-42a6-b9ee-bf77e70a04a3` succeeded | 실행 성공은 기술 작업 완료와 다름. 중간 보고와 부분 패치만 존재 |
| 13:35:58→15:15:36 (04:35~06:15Z) | 예약 run `7f9a58f1-7fed-40a1-945f-2e96be6bc26a`가 시작 없이 대기하다 cancelled | 대기 중 수동 요청·댓글 wake의 coalesced 기록도 있음. 취소 주체·원인은 추가 조사 |
| 15:18:03.696 (06:18:03.696Z) | run `c9c5472e-75b6-4f85-ac38-58931e5d49dc`의 실제 명령 결과 HTTP 409, disposition_recovery_retry_stale | 댓글 설명 외에 실행 원문 로그로 직접 확인 |
| 15:18:09→15:50:31 (06:18~06:50Z) | 예약 run `02d125eb-0e26-41e1-919a-d30e062747ef`도 시작 없이 대기하다 cancelled | 동일한 정체 유형의 두 번째 관측. 무한 자동 실행 횟수를 입증하는 것은 아님 |
| 15:52:50.961 (06:52:50.961Z) | 다음 run `da7cc82c-81da-4d94-b603-31a92b5db17c` 생성 | wakeReason=issue_disposition_repair, attempt=2, maxAttempts=2 |
| 예정 15:53:55.134 (06:53:55.134Z) | 위 run scheduled_retry, startedAt=null, wake queued | 20:45경에도 약 4시간 52분 기한 초과. 예정과 실제 시작이 분리된 문제 |

GAB-144의 당시 activeRecoveryAction은 `7fe7f66b-e3d7-44fb-9189-b4198496601f`, kind/cause=`deliberate_wait_without_target`, ownerType=agent, attemptCount=maxAttempts=2다. 이 값만으로 최종 소진 후 무한 재실행을 확정하지 않는다. 예약된 마지막 시도의 미실행과 소진 후 새 episode 생성 여부를 따로 조사한다.

## 확인된 결함과 미확인 가설

### A. 기한이 지난 예약 재시도 — 별도 조사 backlog

예약 run과 queued wake가 존재하지만 startedAt이 없다. 예약 생성 성공을 복구 실행 성공으로 보고할 수 없다.

미확인 후보: deadline 등록 누락, drain/resume 중 예약 유실, startup 복원 누락, admission gate 또는 동시 실행 제한으로 인한 보류, 다른 wake의 coalescing이 미실행 예약에 묶이는 경로. 타이머 문제로 미리 확정하지 않는다. 예정 시각 이후 현재 authority·gate·재예약 의무를 함께 추적한다.

### B. 복구 지침과 허용 상태의 불일치 — 별도 조사 backlog

실제 409와 코드 조건은 일치한다. `server/src/routes/issues.ts`의 `disposition_recovery_retry_stale` 분기는 `outcome=restored`, 요청 sourceIssueStatus=todo, 해당 recovery 종류에서 현재 작업이 blocked이고 Board escalation 및 원 담당자 조건을 만족하는지 검사한다. 관측된 GAB-144는 in_progress/agent 소유의 자동 disposition repair였다.

따라서 거절 검사를 제거할 문제가 아니라 자동 복구 실행이 왜 이 경로를 선택했는지와 유효한 일반 작업 계속하기 경로가 왜 사용되지 않았는지를 조사한다. 복구 run에 제공된 지침은 완료·진짜 blocker·질문·승인·지원되는 다음 실행 경로를 기록하도록 요구했다. 실제 도구 계약·실행 scope·사용된 payload와 대조한다.

“복구 액션을 먼저 닫은 뒤 409로 롤백했다”는 주장은 이번 증거로 입증되지 않았다. 조사한 조건은 resolve 이전에 거절한다. 별도의 stale-action 정리 결함은 실제 transaction trace나 재현으로 입증된 경우에만 포함한다.

### C. 검토 wake 유실 후 복구 공백

최초 거절은 이전 실행의 lease cleanup 대기였음이 확정됐다. skipped 진단 저장과 직접 재개 경로의 제외를 확인했으며, 별도 review backstop이 회복하지 않은 최종 분기는 미확인이다.

GAB-137의 최신 검토 wake는 skipped/runId=null이다. 그 직전까지 담당자 왕복에 따른 여러 실행이 있었지만, 최신 인계 이후 검토 run은 생성되지 않았다.

GAB-144 보고서의 선행 reviewer run 부재 가설은 후속 조회에서 이 사고에 해당하지 않는 것으로 정정됐다. 엘리스의 이전 cancelled review run이 존재한다. 기존 execution-review participant 복구가 최신 인계의 실행 의무를 왜 회복하지 못했는지는 아직 미확인이다.

### D. 진단 reason의 정보 손실 — 이번 사고 코드만 보완

보고서는 `budget.blocked`, `agent.not_invokable`, `company.inactive`, `heartbeat.scheduling_suppressed`, `heartbeat.worktree_execution_cutoff`가 `other`로 투영되는 재현과 allowlist 보완을 기록한다. 허용된 고정 코드만 공개하고 raw error/payload는 숨기는 접근을 유지한다.

위 다섯 코드는 이번 사고 원인이 아니며 통합을 기본 요구로 삼지 않는다. 이번 로컬 수정은 실제 코드 execution_reconciliation_required의 투영과 인계 hold 로그에 한정됐고 테스트·typecheck가 통과했다.

## 유지할 행동 계약

1. 유효하고 실행 가능한 작업에는 하나의 실제 다음 실행 경로가 있어야 한다. 예약 run을 중복 executor로 바꾸지 않는다.
2. 실행 보류 시 gate의 종류와 담당 경로를 보존한다. Stop·pause·예산·회사·검토·workspace finalization을 건너뛰지 않는다.
3. 동일 원인·동일 원본 상태의 복구는 유한하다. 새 run ID, 동일 설명 댓글, 복구 자신의 상태 기록만으로 한도를 초기화하지 않는다. 기존 episode 정책은 이번 stage 인계 수정에서 재설계하지 않는다.
4. 완료된 provider 작업·저장된 파일·문서·세션을 보존하고, 결과 수락·정산·정리·작업 완료를 구분한다.
5. 검토 인계의 책임과 복구는 기존 소유 모듈이 가진다. 범용 복구 프레임워크·새 polling·자동 완료 규칙은 추가하지 않는다.
6. 대기 조건이 해소되면 정상 admission으로 재개하고, 해소되지 않으면 조용히 기다린다. genuine wait의 소유자에게 동일 알림을 계속 보내지 않는다.

## Approach

현재 구현 후보는 **정상적인 stage 인계가 이전 executor의 cleanup에 막힐 때, 그 의무를 보존하고 현재 대상에게 한 번 재개하는 경로**로 제한한다. 아래 단계는 이 작은 동작을 완결하기 위한 순서다. 후반의 과거 조사 기록·요청 7종 분류는 근거와 영향 점검 자료이며 전체를 이번 패치에서 바꾸라는 지시가 아니다.

### 1. 실제 사고에 맞는 재현

- 구현 시작 시 health/HEAD와 기존 pending stage·담당자·gate를 재조회한다. 원본 운영 작업을 변경하는 reconcile/retry는 진단 목적으로 실행하지 않는다.
- 유효한 executionPolicy/executionState와 서로 다른 작업자·검토자를 저장한 기존 통합 fixture를 쓴다. 검토자에게 과거 cancelled review run이 있는 실제 상황을 기본으로 하고, 이전 run 부재는 필수 재현에서 제외한다.
- lease release 직전 barrier로 실제 stage 제출 wake를 보류시킨다. generic reason 문자열만 바꾼 기존 matrix는 저장 분기 특성화이며 이 사고의 최종 복구 실패 재현이 아니다.
- 기존 cleanup 재개와 review backstop을 각각 실행해 어디까지 회복되는지 확인한다. 이 fixture에서 정상 복구되면 차이를 조사하며, skipped 상태만 보고 전체 원인을 확정하거나 중복 수정을 만들지 않는다.

### 2. 서버 소유 인계의 보존과 소비 연결

- reason 문자열은 요청자가 지정할 수 있으므로 보존·실행 권한의 근거로 삼지 않는다. 회사·issue의 현재 저장된 stage, participant/returnAssignee, 결정·배정 identity와 요청의 server-owned 출처를 기존 잠금·권한 경계에서 대조한다. 승인 전/오래된/위조 인계를 durable 실행 권한으로 바꾸지 않는다.
- 기존 deferred receipt 또는 native status intent 중 현재 경로와 호환되는 것을 재사용한다. 새 범용 요청 분류기, 새 scheduler, 새 polling, 기본 DB schema/API/UI 변경은 추가하지 않는다.
- 대기 저장 producer → cleanup 완료 eligibility 신호 → 다른 담당자의 요청도 읽는 consumer → 정상 admission 재검사까지 연결한다. 기존 comment worker는 comment/interaction 조건을 쓰므로 status만 deferred로 변경하는 패치는 충분하지 않다.
- 재시작/resume 때 기존 영속 의무를 복원하고, stage·assignee 변경/완료/Stop으로 무효가 된 intent는 기존 종료 경로로 정리한다. lease 보호와 기존 재시도·예산 정책은 유지한다.
- 세 stage 인계(review/approval/changes-requested)가 동일한 신뢰 경계·생성/소비 코드를 공유하는 부분만 함께 다룬다. 소유권이 다른 경로는 이름이 비슷하다는 이유로 확대하지 않는다.

### 3. 좁은 안전 검증과 실제 인계 확인

- cleanup 전 시작 0회, 해제 후 유효한 대상 1회, cleanup 이벤트·backstop 경쟁에서도 1회인지 확인한다. 같은 fixture로 stale/취소/위조 인계 및 실제 Stop·예산 gate가 실행을 막는지 검증한다.
- lease 해제 전후 재시작 한 경계를 통해 보존된 의무가 유실되지 않는지 확인한다. 기존 성공 경로·댓글 대조군을 재사용하고 같은 조건의 큰 runtime matrix는 추가하지 않는다.
- 필요한 진단 코드/테스트 및 관련 server 타입 검사만 수행한다. 구현 후 격리 환경의 실제 인계 journey로 현재 stage·run 시작·결과 저장을 확인한다.
- 원본 GAB-137 재개, 브리핑 검증, GAB-136 종료, 배포·재시작은 이번 코드 검증과 구분한다. 별도 운영 권한 없이 수행하지 않는다.

### 별도 조사 backlog — 이번 패치의 필수 변경에서 제외

- GAB-144 overdue 예약과 scheduler/drain 원인, 자동 disposition repair의 API 선택과 409, episode/fingerprint 정책 변경.
- 배정·상태·자식 완료·dependency 신호 4종 전체의 보존 규칙 개편. 기존 matrix는 같은 분기라는 사실만 입증했으며 개별 backstop의 실패는 입증하지 않았다. 같은 수정의 실제 소비자라면 관련 회귀만 추가한다.
- 관측과 무관한 reason allowlist 확대, 전체 skipped 재생, UI 재설계, DB migration, 새 복구 플랫폼.

## 소유 모듈과 인터페이스

| 경계 | 입력 → 보장할 출력 | 우선 조사 경로 |
| --- | --- | --- |
| 예약 lifecycle | durable retry run, retryAt, 현재 gate → 한 번의 시작 또는 근거 있는 보류/취소 | `server/src/services/heartbeat/retries.ts`, `scheduling.ts`, `queue.ts`, `recovery.ts` |
| 공유 실행 기한 | 등록된 의무·drain/resume·재시작 → 보존된 실제 deadline | `server/src/services/work-scheduler.ts`, `delivery-work-coordinator.ts` 및 기존 호출부 |
| disposition repair | source state·episode·attempt·권한 → 유효한 continuation/대기/에스컬레이션 | `server/src/services/recovery/service.ts`, `successful-run-handoff.ts` |
| 검토 인계 | 현재 stage·participant·assignment → 유효한 검토 wake/run | `server/src/routes/issues.ts`의 `buildExecutionStageWakeup`, heartbeat scheduling/recovery |
| 운영자 retry | 현재 잠금 상태·복구 notice·actor → 허용된 재시도 또는 부작용 없는 409 | `server/src/routes/issues.ts`의 `disposition_recovery_retry_stale` 인접 경로 |
| 진단 projection | 내부 고정 원인·상태 → 민감 정보 없는 조치 가능한 요약 | `projectWakeDiagnosticReason`, `issue-wake-diagnostics-routes.test.ts` |

현재 기본안에는 DB schema 변경이나 UI 재설계가 없다. 필요성이 입증되면 영향 레이어와 migration·호환성을 계획에 추가한 뒤 진행한다. 파일 내 줄 번호는 변할 수 있으므로 함수·오류 코드로 찾는다.

## Acceptance evidence

다음은 구현 시 필요한 검증이며 아직 통과했다고 주장하지 않는다.

| 시나리오 | 필요한 관측 결과 |
| --- | --- |
| 실제 stage 인계 + 이전 executor의 미해제 lease | 새 executor 시작 0회, 유효한 의무 보존 |
| lease 해제 + 현재 다른 stage 담당자 | 새 대상 실행 1회, 현재 단계·결과 저장 확인 |
| cleanup 신호와 기존 복구의 경쟁/중복 | 의무 누락·중복 executor 없음 |
| gate 대기 중 재시작/resume | 영속 의무가 기존 복원 경로로 재개됨 |
| stale stage/담당자, done/cancelled, 위조 reason/payload | 오래된·권한 없는 실행 0회, 유효한 최신 의무 유지 |
| Stop·pause·budget·회사/권한 gate | 기존 거부 유지, cleanup 신호가 권한/재개 의사를 대체하지 않음 |
| 기존 정상 stage 인계·agent 댓글 | 기존 성공/대기 경로 회귀 없음 |
| 진단 projection 및 의무 없는 idle | 정보 비노출, 새 무조건 polling·무한 재예약 없음 |

GAB-144 예약·409·episode와 요청 7종 전체의 최종 복구 matrix는 이번 패치의 완료 조건이 아니다. 실제 수정이 해당 계약을 바꾸는 경우에만 검증을 확대한다.

좁은 회귀부터 실행한다. 기존 `server/src/__tests__/issue-wake-diagnostics-routes.test.ts`, `heartbeat-process-recovery.test.ts`의 execution-review participant 사례 및 영향받은 admission/consumer 테스트를 우선 재사용한다. 필요한 결함은 수정 전 행동 실패를 확인하고 동일 테스트로 수정 후를 확인한다. 이후 관련 성공·거절·경쟁 사례를 실행한다.

예시 출발점: `pnpm exec vitest run server/src/__tests__/issue-wake-diagnostics-routes.test.ts`, `pnpm exec vitest run server/src/__tests__/heartbeat-process-recovery.test.ts -t 'execution-review participant'`. 실제 package 설정·fixture 환경을 확인해 명령을 확정하고 선택 제외 사례 수를 보고한다.

서버 코드가 바뀌면 `pnpm --filter @paperclipai/server typecheck`를 관련 범위에서 실행한다. host의 기존 typecheck 프로세스를 먼저 확인하고 하나씩 실행하며 build/test와 겹치지 않는다. shared 계약 변경 시 영향 소비자만 확장한다. OOM/137이면 기록하고 자동 재시도를 중단한다. 문서만 변경한 현재 단계는 diff 검토와 `git diff --check`만 수행한다.

실제 acceptance에는 작업 상태·실행 시작·유용한 산출물 저장·reload 후 보존·검토 인계를 포함한다. 단위 테스트나 succeeded 표시만으로 사고 복구 완료를 주장하지 않는다.

## 논의할 핵심 선택과 권고안

| 논점 | 권고안 | 결정에 필요한 근거 |
| --- | --- | --- |
| 수정 범위 | canonical stage 인계의 cleanup 대기 보존·소비 연결만 우선 수정 | 실제 stage fixture 재현과 기존 backstop 결과 |
| overdue의 의미 | 자동 강제 실행 대신 현재 gate·deadline 소유권을 재평가 | 실제 overdue run의 보류 사유와 scheduler 등록 상태 |
| episode 초기화 | 새 run ID/자체 댓글은 변화로 보지 않음. 실제 사용자 지시 변경은 별도 규칙 | 현 fingerprint 생성과 comment wake 분류 |
| stale 복구 액션 | 거절 guard 유지. 유효성 정리는 recovery service의 기존 책임 | 현재 source/run/action이 양립할 수 있는지 |
| 최초 skipped 원인 | 이전 executor lease cleanup 대기로 확인. 전체 복구 실패 경로는 추가 검증 | 원본 wake reason과 lease 시각, consumer/backstop 재현 |
| 실제 GAB 복구 | 코드 검증·배포와 원본 작업 회복을 각각 기록 | 배포 revision·허용된 운영 조치·현재 미완료 수용 기준 |

추가 논의는 위 선택이 데이터 보존·실행 권한·원래 산출물 범위를 바꾸는 경우에 집중한다. 통상적인 파일 분리나 테스트 선택은 구현 담당자가 판단한다.

## 참고 자료와 재조회 경로

### 내부 계약·규칙

- [실행 의미론](../execution-semantics.md): status, admission hold, accepted-plan 책임, liveness, bounded continuation.
- [V1 구현 계약](../SPEC-implementation.md), [제품 정의](../PRODUCT.md), [개발 안내](../DEVELOPING.md), [DB 계약](../DATABASE.md).
- [heartbeat 경계](../../rules/heartbeat-execution-boundaries.mdc), [idle 규칙](../../rules/sleep-aware-background-work.mdc), [모듈 소유권](../../rules/module-boundaries.mdc), [harness 책임](../../rules/product-harness-responsibility.mdc).
- [writing-plans](../../.agents/skills/harness/writing-plans/SKILL.md), [실패 run 진단·수정](../../.agents/skills/fix-failed-paperclip-run/SKILL.md), [실제 환경 검증](../../.agents/skills/verify-paperclip/SKILL.md).
- [아티팩트 전달](../AGENT-ARTIFACTS.md). 정식 패치 전달은 임시 파일 존재와 구분한다.

### 실제 이슈·문서

- [GAB-136](https://gabriel-hp-elitebook-850-g7.tail35aacf.ts.net:8443/GAB/issues/GAB-136), 같은 작업의 `#document-cause-analysis`.
- [GAB-137](https://gabriel-hp-elitebook-850-g7.tail35aacf.ts.net:8443/GAB/issues/GAB-137): 원본 review 및 report.
- [GAB-144 report](https://gabriel-hp-elitebook-850-g7.tail35aacf.ts.net:8443/GAB/issues/GAB-144#document-report): 확인 당시 revision 2 (`56de7731-bd31-457b-8e3a-1435878c6f3c`). 기존 승인 plan을 이 계획으로 교체하지 않는다.
- `GET /api/issues/{id}/diagnostics/wakes`, `/runs`, `/activity`, `/comments`, `/documents/{key}`.
- `GET /api/heartbeat-runs/{runId}`, `/log?offset=...&limitBytes=262144`, `/events`. log의 nextOffset으로 페이지를 끝까지 읽고 본문 비밀값을 복사하지 않는다.
- GAB-136 UUID `9793045c-f941-4003-8109-9cb4f7a1979a`; GAB-137 UUID `89c581fd-b4ca-41f9-be63-e65a554f6c63`; GAB-144 UUID `a4e2bc9f-6046-4f2f-8964-6745e4a0ee89`.

### 기존 부분 산출물과 외부 유사 보고

- `/tmp/gab-144-paperclip`: 격리 복사본. `server/src/routes/issues.ts` 존재를 확인했다. 현재 source tree·설정·차이는 구현 전에 다시 대조한다.
- `/tmp/gab-144-diagnostics.patch`: 2026-11-17 파일 존재 및 2,238 bytes를 확인했다. 영구 첨부 성공은 확인되지 않았으며 임시 파일만으로 전달 완료로 처리하지 않는다. report에도 부분 diff가 남아 있다.
- [upstream #16819](https://github.com/paperclipai/paperclip/issues/16819): 해결된 blocker 뒤 남는 blocked 및 권한 없는 recovery wake 보고.
- [upstream #6523](https://github.com/paperclipai/paperclip/issues/6523): 부모의 반복 recovery/handoff 보고.
- [upstream #9668](https://github.com/paperclipai/paperclip/issues/9668): 일부 자식 blocked 상황에서 부모 wake 누락 보고.

외부 보고는 유사 메커니즘 참고이며 이번 사고의 동일 원인·현재 해결 상태를 보증하지 않는다. PR 준비 시 private 회사 ID·URL·본문을 공개 fixture/PR에 복사하지 않는다.

## Current state

- **Completed:** canonical review/approval/changes 인계의 내부 identity를 저장하고 현재 statusVersion·stage·participant/returnAssignee·decision을 admission과 claim 잠금 경계에서 대조한다. lease 대기 의무는 기존 deferred receipt에 보존하고 같은 receipt를 successor와 원자적으로 연결한다. 기존 worker가 cleanup의 committed eligibility 신호와 startup/resume를 소비한다. 새로운 polling·schema·공개 API는 추가하지 않았다. 같은 mutation의 댓글 wake가 stage provenance를 덮어쓰지 않게 했다.
- **Safety:** stale stage/담당자/종료 작업, 위조 payload marker, 이후 operator Stop은 새 실행 권한이 아니다. 최신 인계는 유지하고 이전 receipt만 취소한다. pause·회사·agent·실제 비용 budget·일일 제한을 존중한다. producer 중복, cleanup/startup 및 실제 generic backstop 경쟁에서 successor는 하나다.
- **Verified:** 관련 5파일 전체 **172개 통과**. 최신 핵심/추가 사례와 기존 execution-review participant backstop 선택 실행은 **29개 통과, 474개 선택 제외**. 이후 같은 fixture의 실제 backstop 경쟁까지 추가한 최종 선택 실행은 **3개 통과, 49개 선택 제외**. 아래 명령과 한계를 따른다.
- **Runtime evidence:** 실제 격리 PostgreSQL, 등록된 deferred/dispatch worker, 실제 local process adapter를 사용한 cleanup/restart 두 사례에서 해제 전 시작 0회, 해제 후 시작 1회와 stdout 저장을 확인했다. 보유 lease로 대기할 때와 완료 history만 남을 때 가상 시계 25분 동안 SQL 증가가 없었다. 이는 로컬 lifecycle 증거이며 실제 외부 모델의 검토 품질이나 운영 복구 증거는 아니다.
- **Typecheck limitation:** 다른 typecheck/test/build가 없는 상태에서 서버 패키지 단독 `tsc --noEmit`을 실행했으나 **2026-11-17 22:21:59 KST global OOM으로 SIGKILL**됐다. 커널 로그의 tsc anon-rss는 10,696,172KiB였다. 검사 전 가용 메모리는 약 10GB였고 별도 memory 증설은 하지 않았다. 서버 전체 검사를 자동 재시도하지 않았다. 새 판별 모듈과 그 정적 의존성만 대상으로 범위를 줄이고 1.5GiB 힙 상한을 적용한 검사는 통과했다. **queue/routes/coordinator를 포함한 서버 전체 정적 타입 검증은 완료하지 못했다.**
- **Other checks:** map 구조 검사 통과(35 areas, 192 capability IDs), diff 공백 검사 통과. build·browser E2E·repo-wide 검사는 이번 서버 slice에 불필요하여 수행하지 않았다. 운영 health/HEAD는 시작 때 일치했으나 원본 작업 변경·재시작·배포는 하지 않았다. 원래 사고에서 generic backstop이 복구하지 않은 최종 운영 조건과 GAB-144 backlog는 이번 구현의 해결 주장에 포함하지 않는다.
- **Next concrete action:** 검증 한계와 함께 현재 로컬 구현 diff를 사용자에게 인계한다.

### 이번 구현의 검증 명령

모두 별도 프로세스를 겹치지 않고 순차 실행했다. 테스트 내부 Promise.all은 단일 Vitest worker에서 admission 경합을 재현한다.

1. `pnpm exec vitest run server/src/__tests__/heartbeat-undispatched-execution-wait.test.ts server/src/__tests__/deferred-execution-receipt-work.test.ts server/src/__tests__/issue-execution-policy-routes.test.ts server/src/__tests__/issue-wake-diagnostics-routes.test.ts server/src/services/heartbeat/queue.test.ts` — 172개 통과.
2. `pnpm exec vitest run server/src/__tests__/heartbeat-undispatched-execution-wait.test.ts server/src/__tests__/heartbeat-process-recovery.test.ts server/src/__tests__/deferred-execution-receipt-work.test.ts -t 'canonical|provenance|stage receipt|admitted stage|old stage|execution-review participant'` — 29개 통과, 474개 선택 제외. 첫 전체 실행 이후 추가한 실제 budget/Stop·최신 인계 및 claim 안전성 변경을 포함한다.
3. `pnpm exec vitest run server/src/__tests__/heartbeat-undispatched-execution-wait.test.ts -t 'preserves canonical'` — 실제 generic backstop과 두 복원 consumer의 경합을 함께 호출한 최종 3개 통과, 49개 선택 제외.
4. `pnpm --filter @paperclipai/server exec tsc --noEmit` — 위 OOM/SIGKILL. 반복하지 않음.
5. `NODE_OPTIONS=--max-old-space-size=1536 pnpm --filter @paperclipai/server exec tsc --ignoreConfig --noEmit --target ES2023 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck --types node --esModuleInterop --resolveJsonModule --isolatedModules src/services/heartbeat/stage-handoff.ts` — 통과. 저장소의 NodeNext/strict 설정을 명시했으며 전체 서버 성공으로 해석하지 않는다.
6. `node scripts/check-maps.mjs`, `git diff --check` — 통과.

보존 조건만 잠시 제거한 negative control에서 canonical review 테스트가 expected deferred / actual skipped로 실패했고 즉시 코드를 복원했다. 최초 fixture의 stage 저장 누락, DB trigger가 정하는 statusVersion에 대한 고정값 가정, 실제 프로세스 실행 중 가상 시계 가속으로 만든 controller lease 만료는 설정 오류로 수정했다. 이 실패들은 제품 회귀 red 증거로 세지 않는다. 기존 `qa_plan_review`는 계획의 과거 리뷰이며 이번 구현의 독립 리뷰를 새로 수행했다는 뜻이 아니다.

## Decisions and evidence

- 후속 지시로 조사와 필요한 진단 로그 수정·검증까지 승인되었다. 이번 추가 분석은 읽기 전용이며 원본 작업의 status/assignee/review/복구 상태를 변경하지 않는다.
- 기존 원본 변경 `AGENTS.md`, `doc/DEVELOPING.md`, Slack 계획 이동은 이번 작업에서 수정하거나 되돌리지 않는다.
- GAB-144의 테스트 통과는 기존 report에 기록된 증거다. 이번 계획 작성 과정에서 재실행한 결과가 아니다.
- 계획은 가설을 고정하는 명세가 아니다. 현재 코드·실행 상태·재현이 다르면 이 문서를 먼저 정정한다.

## 2026-11-17 enqueueWakeup 조사 및 진단 수정

후속 사용자 지시로 enqueueWakeup 조사와 필요한 로그 추가를 승인받았다. 이번 증분은 실제 거절 원인 확인·진단 API 정보 손실 수정·해당 admission 로그 추가로 한정한다. 예약 재시도·검토 복구 정책의 변경이나 운영 재시작은 수행하지 않는다.

### 새로 확정한 사실

- journal의 해당 시각에는 HTTP 상태 변경 성공과 기존 실행 종료 기록만 있었으며, 정확한 검토 admission 거절 사유는 보이지 않았다.
- 기존 Board 권한으로 읽기 API 조회에 성공한 동일 회사·작업 범위에서 로컬 DB의 read-only transaction을 사용했다. 인증 우회·DB 변경 없이 wake의 고정 reason, 필요한 메시지, lease 시각만 조회했다. 인증정보·전체 payload는 출력하지 않았다.
- wake `1bc6d9fc-a0ac-4b31-ae90-8bbca5848ae9`의 원본 reason은 `execution_reconciliation_required`다. 메시지는 이전 실행의 환경 lease 미반환으로 cleanup을 기다리라는 내용이다.
- 이전 하루 run `94e12c58-018f-4c1a-b5ec-1f66d1a51bd1`의 local lease `0bbd54f4-7f16-438e-a9a0-79e798e85429`는 `02:37:14.907Z`에 releasedAt을 기록했다. wake가 skipped로 끝난 `02:37:14.859Z`보다 48ms 뒤다. lease의 최종 상태는 expired, cleanupStatus=null이다.
- 그러므로 최초 검토 실행을 막은 것은 예산이나 chat-bound reassignment가 아니라 이전 실행 cleanup과 검토 인계의 경합이다. 안전한 admission 거절 자체는 유지해야 한다.
- `deferBlockedExecution`은 이처럼 comment/interaction/native intent가 없는 요청을 `recordExecutionWait`로 넘기고, 이 함수는 skipped/runId=null 진단 기록을 저장한다. 이 기록 자체는 재실행 권한이나 예약이 아니다. lease 해제 뒤 해당 요청을 누가 다시 실행하는지의 전체 liveness 증명은 아직 남아 있다.

### 이번 코드 변경과 검증

- `server/src/routes/issues.ts`: 고정 reason `execution_reconciliation_required`를 진단 allowlist에 추가한다. 기존 부분 패치의 다른 다섯 reason을 무관하게 확대하지 않는다.
- `server/src/services/heartbeat/queue.ts`: review/approval/changes-requested 요청의 reconciliation hold에 국한한 구조화 info 로그를 추가한다. blocker run/action ID 및 고정 cause만 남기며 payload·raw error·본문은 기록하지 않는다. DB 쿼리·타이머·재시도 동작은 추가하지 않는다.
- `server/src/__tests__/issue-wake-diagnostics-routes.test.ts`: 실제 DB receipt를 사용해 고정 reason 노출과 cleanup 상세/payload 비노출을 검증한다. 수정 전 새 회귀는 실제로 reason=other로 실패했다.
- 진단 회귀는 수정 전 1개 실패(reason=other), 수정 후 전체 10개 통과. `git diff --check` 통과. 아직 운영에 적용하거나 원본 검토를 재개했다고 주장하지 않는다.

이 증거로 기존 ‘최초 skipped 원인은 미확인’ 판단을 업데이트한다. 이후 핵심 조사는 cleanup 해제 뒤 검토 continuation을 복원하는 소유 경계이며, 진단 개선을 liveness 수정 완료와 혼동하지 않는다.

## 2026-11-17 21:25 KST 추가 분석 — cleanup 이후 검토 재개 경계

### 질문에 대한 정확한 설명

자원 정리의 주체는 하루의 이전 실행이고, 요청을 접수·보류한 주체는 Paperclip 서버다. 엘리스가 자신의 요청을 버린 상황이 아니다. 서버는 같은 작업 환경에 두 executor가 겹치지 않도록 기존 lease가 남아 있는 동안 새 검토 run 생성을 막았다. lease 해제 48ms 전의 admission 거절은 합리적인 안전 동작이다. 개선 대상은 이 순간의 대기 의무를 cleanup 이후 현재 검토자에게 전달하는 계약이다.

`skipped`를 모두 재실행하는 수정은 하지 않는다. 진단 기록과 실행 의무를 구분하고, 권한·Stop·stage/participant 변경·중복 실행 검사를 통과한 현재 인계만 정상 admission으로 재개해야 한다.

### 이번에 확인한 코드 경로

| 경계 | 실제 동작 | 이번 사례와의 관계 |
| --- | --- | --- |
| `heartbeat.ts` executor finally → `releaseEnvironmentLeasesForRun` | terminalization과 instruction 정리 뒤 환경 자원을 반환 | 작업 status/담당자 변경과 cleanup 완료는 별개이며 시간상 겹칠 수 있음 |
| `heartbeat/queue.ts`의 `deferBlockedExecution` | comment/interaction/native status intent는 deferred로 저장하고 `notifyDeferredExecutionWork` 호출. 나머지는 `recordExecutionWait`로 저장 | 일반 assignment 검토 요청은 후자에 들어가 skipped/runId=null로 남음 |
| `execution-wait.ts`의 `recordExecutionWait` | 진단용 skipped receipt를 insert/coalesce. 함수 자체에는 실행 큐 알림·재개 callback 없음 | 기록 존재를 재시작 예약으로 해석할 수 없음 |
| `heartbeat.ts` cleanup 뒤 legacy pending 조회 | `status=deferred_issue_execution`, `agentId=정리한 run.agentId`, 같은 issue인 요청이 있을 때 재개 | 이번 receipt는 skipped이며 target은 엘리스, 정리 run은 하루여서 이 조회에 들어가지 않음 |
| `heartbeat/queue.ts`의 `resumeDeferredExecutionReceipts` | deferred 상태를 대상으로 comment IDs/interaction 응답 등 현재 지원 입력을 재개 | skipped 검토 receipt는 해당 조회 대상이 아님 |
| `heartbeat/run-control.ts`의 `resumeExecutionWaitComments` | deferred task retry 또는 user-authored execution wait를 조회 | agent-authored 검토 assignment와 상태·용도가 다름 |
| `modules/wake-queue/adapters/postgres.ts`의 `findNextDeferredWake` | 회사·issue별 deferred 상태를 선택해 정상 release admission으로 연결 | 이 모듈은 다른 agent의 deferred도 처리할 수 있지만 skipped는 읽지 않음. 일반 큐 전체를 ‘동일 agent 전용’이라고 단정하지 않음 |
| `environments.ts`의 `releaseLease` | environment cleanup, chat inbound notice, retained native cleanup 신호를 조건에 따라 전송 | cleanup 후 아무 신호도 없다는 주장은 부정확. 다만 이 신호가 skipped review를 직접 승격시키는 근거는 확인하지 못함 |
| `recovery/service.ts`의 `reconcileStrandedAssignedIssues` | 별도의 pending review participant 복구 경로가 존재 | 직접 cleanup callback의 누락과 이 별도 backstop의 유효성을 따로 검증해야 함 |

요약하면, **직접 cleanup 후 재개 경로의 입력 분류에서 이 검토 receipt가 제외되는 것은 코드로 확인했다.** 그러나 이것만으로 모든 복구 경로가 없다고 결론 내리지 않는다. generic review backstop이 실제로 왜 새 run을 만들지 않았는지까지 확인해야 전체 정체 원인이 완성된다.

### 실제 데이터로 가설 정정

동일 회사·GAB-137만 대상으로 read-only transaction을 사용해 다음을 추가 확인했다. 전체 payload, 비밀값, 변경 SQL은 사용하지 않았다.

- 최신 리뷰 재제출 뒤 wake 목록은 해당 skipped receipt 1건뿐이었다. 조회 시점까지 후속 검토 wake는 없었다.
- 엘리스의 이전 검토 run은 `417f7c88-b273-4958-b016-daef130f79a6` 및 `fce81b69-c56d-4497-bdf8-d1f0847a78cc`로 실제 존재하며 모두 재배정에 따른 cancelled다.
- 따라서 기존 GAB-144 report의 ‘최초 reviewer run 부재’ 분기 가설은 이 사고의 직접 설명이 아니다. 그 분기는 별도 재현 가능성으로만 취급한다.
- 위 최신 엘리스 run과 하루 run은 errorCode=issue_reassigned, reassignmentStopConfirmed=true이며 cancelledByActorType은 null이었다. 해당 필드만으로는 recovery의 `isOperatorCancelledRun` 조건에 해당하지 않는다. 실제 사람 Stop이라는 이유로 스킵됐다고 단정하지 않는다.
- task session의 goalStatus는 null이었다. 조회된 자료에는 검토자 unfinished goal hold가 없었다. 과거 모든 시점의 부재를 보증하지 않는다.
- 과거 GAB-137 recovery action 두 건은 cancelled였고, 최초 issue_review_path_lost action은 02:21:09Z에 이미 취소됐다. 해당 오래된 active Board action이 최신 02:37 인계를 계속 막았다는 설명은 현재 자료와 맞지 않는다.

### 좁혀진 후속 재현과 설계 선택

1. 서로 다른 executor/reviewer를 가진 기존 review 통합 fixture를 재사용한다. 실행 정리의 lease release 직전에 제어 가능한 barrier를 두고 리뷰 재제출 wake를 admission에 넣는다. 기존 거절과 skipped 진단 기록을 확인한 후 barrier를 해제한다.
2. 실제 cleanup 후 재개와 기존 deferred worker 경로를 호출했을 때 reviewer run 0회인지 확인한다. 그 후 generic stranded review recovery를 별도로 호출해 1회 복원되는지, 추가 gate에서 제외되는지 비교한다. fixture 설정 오류를 결함 재현으로 보고하지 않는다.
3. 실제 사고의 직전 reviewer는 cancelled run이 있는 경우이므로 이를 기본 재현으로 삼는다. 이전 run이 없는 경우는 필요할 때 별도 대조군으로 둔다.
4. backstop이 fixture에서 정상 회복하면 사고와 다른 조건을 목록화한다. 실제 scheduler/notification 연결, 당시 pause·budget·tree hold·recovery source 판정, recovery 실행 여부를 좁혀 읽는다. 운영에서 mutation을 일으키는 reconcile 함수를 진단 명목으로 실행하지 않는다.
5. 수정이 승인된 후 선택할 기본 방향은 서버 소유 review stage/participant에 결합된 durable continuation이다. 기존 deferred/native status intent 경로를 재사용할 수 있는지 먼저 검토한다. 단순 status를 deferred로 바꾸는 것만으로 충분하다고 가정하지 않는다. 알림 producer, cleanup 해제, 재시작 복원, stale participant 폐기까지 같은 계약으로 검증해야 한다.
6. 기존 Stop/권한·company·예산·유효한 lease hold를 유지한다. cleanup 전 시작 0회, cleanup 후 유효한 reviewer 1회, 재배정/취소 후 오래된 reviewer 0회를 핵심 관측 결과로 삼는다. 새 주기 polling을 추가하지 않는다.

### 현재 한계와 검증 기록

이번 turn은 분석과 문서 갱신만 수행했다. 기존 진단 코드 패치를 추가로 변경하지 않았고, 앞서 통과한 테스트 10개와 서버 typecheck는 관련 소스가 바뀌지 않아 재사용한다. 위 lease-barrier 통합 재현과 generic backstop의 최종 제외 분기는 아직 검증 전이다. 운영 재시작, 원본 검토 재시도, 작업 완료 처리는 수행하지 않았다. 문서 diff 검토와 공백 검사를 수행하고 Paperclip 사본을 같은 key의 새 revision으로 갱신한다.

## 2026-11-17 에이전트 요청 종류와 lease 대기 영향 점검

### 범위와 분류 기준

에이전트의 도구 호출 전체가 wake 요청은 아니다. 문서 저장·조회·댓글 저장 등은 해당 domain mutation이고, 다음 실행이 필요할 때만 서버가 wake를 만든다. 에이전트가 요청한 mutation에서 만들어지는 assignment/automation 요청, agent 직접 wake, native status outbox, interaction 후속 실행을 구분한다. `reason`은 임의 문자열도 받을 수 있으므로 이름을 모두 나열하는 것만으로 완전한 안전성을 증명할 수 없다. 이번 검증 범위는 **유효한 issue-bound 요청이 이전 executor의 lease 때문에 admission을 통과하지 못할 때의 보존 방식**이다. 모든 권한·오류·실행 환경에 대한 안전성 인증은 아니다.

판단 기준은 요청자 actorType 하나가 아니라 comment ID, interaction continuation, durable chat request, native status wake intent 및 기존 execution wait receipt의 존재다. 같은 이름의 요청도 경로와 payload에 따라 다르게 처리된다.

| 요청 종류 | 코드상의 reason/경로 | lease 대기 중 처리 | 확인 수준 |
| --- | --- | --- | --- |
| 검토 제출 | execution_review_requested | 보존 marker 없는 일반 요청은 skipped | 실제 사고 + DB 통합 특성 테스트 |
| 승인 인계 | execution_approval_requested | 동일 | DB 통합 특성 테스트 |
| 수정 요청을 작업자에게 반환 | execution_changes_requested | 동일 | DB 통합 특성 테스트 |
| 새 작업·자식 배정 또는 재배정 | issue_assigned | comment/별도 marker 없으면 skipped. 댓글이 동반된 일부 update는 deferred 가능 | 생성 helper/route 분석 + DB 특성 테스트 |
| 작업 상태 변경으로 시작 | issue_status_changed | 별도 marker 없으면 skipped | route 분석 + DB 특성 테스트 |
| 자식 완료 후 부모 재개 | issue_children_completed | 별도 marker 없으면 skipped | route 분석 + DB 특성 테스트 |
| blocker 해결 후 의존 작업 재개 | issue_blockers_resolved | 별도 marker 없으면 skipped | route 분석 + DB 특성 테스트. 별도 dependency backstop 존재 |
| 에이전트 댓글 후속 실행 | issue_commented + 실제 commentId | deferred_issue_execution, lease가 남아 있으면 새 run 생성 안 함 | 실제 DB agent 댓글을 사용한 대조 테스트 |
| 상호작용 응답 후속 실행 | mutation=interaction 및 정상 continuation context | deferred 보존 조건 존재 | 정적 확인. 이번 신규 matrix에서 response lifecycle 검증 안 함 |
| native status 결정 후 실행 | status-decision-committer → durable intent → nativeStatusWakeIntentId | 일반 stage wake와 달리 deferred 보존 조건·intent 재처리 경로 존재 | 정적 확인. 이번 matrix에서 outbox lifecycle 검증 안 함 |
| 외부 chat에서 유래한 후속 실행 | durableChatRequest | 별도 영속 receipt/deferred 경로 | 정적 확인. 외부 전달/cleanup 이후 실행은 이번 검증 범위 밖 |
| 에이전트의 직접 wake 요청 | agents route → on_demand/호출자가 지정한 reason | 별도 marker 없으면 같은 skipped 분기 가능. agent 입력의 comment marker는 route에서 제거됨 | 정적 확인. reason 값만으로 내구성을 판단할 수 없음 |
| 단순 멘션 | issue_comment_mentioned | queue 입구에서 무시 | 의도된 동작. 멘션을 배정·검토 요청으로 취급하지 않음 |
| timer·monitor·recovery | 서버 소유 예약/복구 reason | 각자의 durable 예약/attempt/소진 규칙을 가짐 | 에이전트 mutation으로 시작된 요청과 구분. 별도 lifecycle 검증 필요 |

### 이번 실제 테스트

기존 `server/src/__tests__/heartbeat-undispatched-execution-wait.test.ts`를 확장했다. mock이 값을 반환하게 하는 대신 embedded PostgreSQL에 cancelled 이전 executor, active local environment lease, 다른 담당 agent를 저장하고 실제 `getExecutionBlocker`와 `heartbeatService.wakeup`을 사용했다. 원본 운영 DB는 변경하지 않았다.

- marker 없는 요청 7종은 같은 `execution_owner_active` blocker에 걸려 `execution_reconciliation_required`, skipped, runId=null로 저장됐다.
- 실제 저장된 agent 댓글 ID가 있는 대조 요청 1종은 deferred_issue_execution으로 저장됐다.
- 모든 사례에서 새 heartbeat run이 생기지 않아 lease hold를 우회하지 않는 것도 확인했다.
- 선택 실행: `pnpm exec vitest run server/src/__tests__/heartbeat-undispatched-execution-wait.test.ts -t 'predecessor cleanup'` — **8개 통과, 기존 27개 선택 제외**.
- 전체 파일 재검증: `pnpm exec vitest run server/src/__tests__/heartbeat-undispatched-execution-wait.test.ts` — **35개 모두 통과**.
- 이 테스트의 expected skipped는 현행 동작을 기록하는 **특성 테스트**다. 요청 유실이 올바른 기대 동작이라는 뜻도, lease 해제 후 최종 복구를 검증했다는 뜻도 아니다. 후속 수정 시 실행 의무가 있는 요청은 deferred와 실제 successor 결과를 검증하도록 바꾼다.
- 정상 배정/의존성 요청의 실제 producer 전체를 각각 실행한 E2E가 아니라 공통 admission 경계의 matrix다. stage 권한·현재 participant 검사는 수정 acceptance에서 별도 검증한다.

### 영향 판단과 수정 범위 보완

검토 요청 하나의 이름만 예외 처리해서 7종 전체가 해결됐다고 주장할 수는 없다. 다만 7종 전체를 이번 패치에서 바꿔야 한다는 근거도 없다. 공통 분기에서 marker 없는 여러 실행 신호가 진단 기록으로 전환된다. 다만 **7종 모두 최종적으로 영구 정체된다는 증거는 없다.** 신규 배정, resolved dependency, review 등에는 독립 backstop이 있어 최종 복구 여부는 각각 따로 판정해야 한다.

수정은 모든 agent 요청을 무조건 재시도하는 방식이 아니라 서버가 수락한 현재 실행 의무를 영속 보존하는 계약으로 설계한다. 정상 중복·오래된 stage·취소된 작업의 skipped는 유지한다. 우선 세 stage 인계와 책임 이전을 검증하고, 배정·상태·부모/의존성 신호에는 기존 outbox/backstop 재사용 여부를 결정한다. stage generation, actor/회사, 보류 gate, idempotency와 현재 assignee를 유지하며 재개 owner까지 연결한다.

이번 추가 변경은 위 통합 테스트와 문서뿐이다. production queue 수정이나 운영 복구는 하지 않았다. 기존 진단 코드의 성공한 typecheck는 해당 코드·설정·타입 계약이 바뀌지 않아 재사용하며, 추가한 테스트는 Vitest 실행으로 검증한다.

## 최신 판단 계약 — deferred와 skipped의 역할

사용자와의 논의를 반영한 설계 기준이다. 아래 기대 동작 전체가 이미 구현됐다는 의미는 아니다. **일시적으로 실행할 수 없지만 서버가 수락한 유효한 실행 의무가 남아 있으면 보존하고, 무효·불필요한 신호만 종료한다.** actor가 agent인지 user인지, comment ID가 있는지만으로 이 의무를 결정하지 않는다.

`deferred_issue_execution`과 `skipped`는 여기서 wake receipt의 상태다. `deferred` 이벤트 하나를 기록하는 것이 최종 완료 조건은 아니다. 요청 영속화 → gate 해제 알림 → 정상 admission 재검사 → 유효한 executor 시작 또는 명시적 대기/취소까지 이어져야 한다.

| 조건 | 계획상 처리 | 필요한 검증 |
| --- | --- | --- |
| 이전 실행의 lease cleanup 때문에 현재 검토·승인·수정 인계가 일시 보류 | deferred 또는 동일 보장을 주는 기존 durable intent로 보존 | cleanup 전 시작 0회, 해제 후 현재 대상 실행 1회 |
| 현재 배정·상태·부모/의존성 변경에 따른 유효한 실행 의무 | 기존 durable intent/backstop과 중복 없이 보존·재개 | 일시 거절 후 의무 유실 없음. 별도 복구 경로 존재만으로 안전 판정하지 않음 |
| 과거 검토 stage/participant 또는 assignee가 변경돼 요청이 무효 | skipped 또는 기존 취소 상태로 종료 | 오래된 대상으로 실행 0회. 최신 인계 의무는 유지 |
| 작업이 이미 done/cancelled이고 재개 권한·의도가 없음 | skipped 또는 취소 | 완료 작업 재실행·의도치 않은 reopen 없음 |
| 실행할 일이 없는 정기 heartbeat 신호 | skipped 가능 | 무의미한 지연 큐 누적·반복 wake 없음 |
| 동일 의무를 처리할 유효한 요청·실행이 이미 있음 | 기존 coalescing/중복 제거 | 유효한 대표 요청이 남고 입력·책임 유실 없음. duplicate를 모두 deferred로 쌓지 않음 |
| 사람의 Stop·pause 또는 권한·예산 gate | 기존 gate와 원래 재개 권한 유지 | cleanup 이벤트가 사용자 재개 의사나 추가 권한을 대신하지 않음 |
| 일시·영구 여부 또는 실행 결과가 불명 | 기존 reconciliation/명시적 대기 경로 유지 | 무조건 deferred 재시도로 중복 부작용을 만들지 않음 |

이번 사고는 첫 번째 조건이다. 따라서 lease 보호 검사를 없애지 않고, 그 검사에 걸린 유효한 인계를 진단용 skipped로만 끝내는 분류·보존 공백을 고친다. skipped 상태 자체를 제거하거나 모든 과거 skipped 행을 일괄 재생하지 않는다. 과거 행은 provenance·현재 stage·Stop·미완료 의무를 확인할 수 있는 정상 복구 경로에서만 다룬다.

### 후속 구현·검증에 반영할 사항

- 공통 분류에서 실행 의무, 보존 owner, gate 해제 producer, 재개 consumer를 함께 정의한다. `status` 문자열만 바꾸고 callback/재시작 복원을 빠뜨리지 않는다.
- 기존 특성 테스트의 skipped 기대값은 현상 기록이다. 수정 시 유효한 의무는 보존·최종 재개를 기대하도록 바꾸고, 정상 skipped/취소/중복 제거 대조군을 추가한다.
- generic review backstop이 왜 원래 사례를 복구하지 않았는지는 여전히 미확인이다. 최초 lease 거절 원인과 보존 공백이 확인됐다는 사실과 구분한다.
- 최신 변경은 문서뿐이다. 기존 코드·테스트 결과가 유효하므로 이번 갱신에서는 테스트·typecheck·build를 반복하지 않는다. 저장소 문서와 Paperclip 사본을 함께 갱신한다.

## QA 리뷰 결과와 범위 조정

사용자의 명시 요청에 따라 독립 QA 에이전트 `qa_plan_review`와 현재 계획·관련 소스·기존 테스트를 읽기 전용으로 리뷰했다. QA는 테스트를 재실행하지 않았으며, 이 리뷰가 구현·운영 acceptance 통과를 의미하지 않는다.

| 발견 | 영향 | 반영한 처분 |
| --- | --- | --- |
| P2: 기본 재현에 ‘최초 reviewer run 없음’이 남아 실제 기록과 충돌 | 다른 장애를 재현하고 해결했다고 오인할 수 있음 | Approach와 acceptance를 유효한 stage·다른 executor·이전 cancelled reviewer run·미해제 lease 조합으로 정정 |
| P2: GAB-144 scheduler/409/episode 및 7종 전체 개편이 필수 범위에 혼재 | 근거가 다른 수정이 묶여 불필요한 구조·검증 확대 가능 | 현재 slice는 canonical stage 인계 보존·재개로 제한. 나머지는 별도 조사 backlog |
| P2: reason/모양만으로 인계 내구성·실행 권한을 인정할 위험 | agent 직접 wake가 review를 흉내 내거나 오래된 stage를 재실행할 수 있음 | 서버 저장 stage/participant/returnAssignee 및 cycle/decision identity, server-owned 출처를 admission·재개 시 대조하도록 명시 |
| 필수 설계 보완: deferred 저장만으로 consumer·trigger가 생기지 않음 | 여전히 실행이 시작되지 않는 불완전한 패치 | 기존 issue 단위 drain의 다른-agent 소비를 재사용하고 cleanup signal·startup 복원까지 연결하도록 명시 |

**과도한 수정 여부 판정:** 현재 진단 allowlist 1개와 인계 hold 구조화 로그는 작은 관측 개선이다. payload·raw error를 추가 기록하지 않고 새 scheduler·반복 작업도 없어 유지한다. 기존 7종 테스트는 저장 분기 특성화 자료로 유지하되, 이를 근거로 모든 요청의 상태 정책을 한 번에 변경하지 않는다. 새 큐·범용 실행 의무 프레임워크·DB schema/API/UI 개편은 현재 필요성이 입증되지 않았다.

**검증의 최소 범위:** 실제 인계의 cleanup 전 0회/후 1회, stale 또는 위조 인계/Stop 후 0회, restart와 동시 trigger에서 중복 없음이다. 동일 stage producer/consumer를 공유하는 승인·수정 인계만 관련 소비자로 검증하며, 별개 runtime/provider 전체 matrix를 요구하지 않는다.

이 리뷰의 문서 발견 3건과 설계 보완을 본문의 Approach·Acceptance·현재 상태에 반영했다. 과거 타임라인·조사 appendix는 근거 보존용이며 최신 구현 범위는 본문의 축소된 Approach를 따른다. 이번 turn은 문서 변경만 수행해 diff 검토와 공백 검사로 확인하며, 소스·설정이 동일한 기존 테스트/typecheck는 반복하지 않는다.
