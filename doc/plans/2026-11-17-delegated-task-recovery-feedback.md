---
status: active
priority: high
updated: 2026-11-17T00:00:00+09:00
authorization: Implementation authorized
---

# 위임 작업의 복구 차단과 caller 피드백 개선 계획

## 목적과 승인 범위

caller가 callee에게 위임한 작업이 실행되지 못할 때 요청의 처리 결과와 다음 책임자가 명확하게 드러나도록 한다. 시작되지 않은 실행의 취소가 후속 요청을 영구 차단하지 않게 하되, 실제 실행 여부가 불확실한 경우 중복 실행 방지는 유지한다.

사용자가 2026-11-17 별도 worktree에서 이 계획의 구현을 승인했다. 코드 변경과 격리된 검증을 진행한다. 운영 데이터 변경, 기존 취소 task 재개, 배포 및 외부 발송은 범위 밖이다. 저장 위치는 저장소 AGENTS.md의 `doc/plans/YYYY-MM-DD-*.md` 규칙을 따른다.

## 확인된 증거와 미확인 사항

조사 당시 소스 및 서버 revision: `57b9c1a3680e896c1ee2486e1603cc36a003ad7e`. 아래는 사건 당시 관찰이며 현재 상태는 구현 착수 시 다시 조회한다.

- GAB-124의 caller 엘리스는 GAB-125를 callee 하루에게 위임했다. 최초 배정과 첫 재작업은 실제 하루 실행으로 이어졌다.
- GAB-125의 상태 정리 복구 run `ce445fb6-f45e-42aa-8b20-0454c547d0aa`는 `startedAt`, PID, wakeup의 `claimedAt` 없이 취소됐다. 조회한 환경 lease는 없고 run 이벤트에는 취소 및 자동 복구 중단이 기록됐다.
- 이후 재작업 댓글 `13f7988a-379e-43bd-989e-899746f69b1e`에 대한 wakeup `ccc3ed46-3dfc-4657-88d1-1c19e91f2618`은 실제 생성됐으나 `deferred_issue_execution`, `runId: null`, 대기 사유 `execution_recovery`로 남았다.
- 사용자 메시지와 Retry의 대기 사유는 `process_identity_missing`: 이전 실행의 검증된 종료 기록 없음이었다. GAB-131의 복구 run `690b03f3-eb79-4cd4-926f-44e2ca133df4`에서도 같은 패턴을 확인했다.
- 당시 GAB-124의 blocker 조회는 GAB-125를 `covered / active_child`로 표시했지만 callee 활성 run은 없었다. 이후 GAB-124, GAB-125, GAB-131은 취소 상태로 관찰됐다. 조사 과정에서는 변경하지 않았다.
- 취소 직후 조회한 caller wakeup 시간 구간과 부모 댓글에서는 복구 취소 피드백을 찾지 못했다. 모든 알림 경로가 없다는 증명은 아직 아니다.

미확인: 최초 복구 실행을 취소한 정확한 호출 경로, 오래된 실행에서 시작 기록 누락 가능성, `active_child` 판정에 기여한 정확한 상태 집합. PID나 시작 시각이 없다는 사실만으로 미실행을 확정하지 않는다.

## 개선할 동작 계약

1. 요청 수락, 큐 대기, 실행 시작, 종료 확인, 작업 완료를 구분한다. 댓글 저장 성공을 실행 시작으로 설명하지 않는다.
2. 실행이 시작되지 않았음을 트랜잭션과 실행 소유권으로 증명한 경우에만 종료 증명을 요구하는 차단을 해소한다. 기존 operator Stop, 취소 task, pause, 예산 및 승인 경계는 유지한다.
3. 복구가 더 진행할 수 없는 상태로 바뀌면 callee task에 이유와 다음 조치를 남기고, 실제 의존 중인 caller에게 같은 정보를 전달한다. 단순 parent 관계만으로 모든 조상에게 실행을 발생시키지 않는다.
4. `In progress` 또는 보류 wakeup 존재만으로 정상 진행으로 분류하지 않는다. 실행 가능, 유효한 대기, 복구 차단, 조치 필요 상태를 기존 read model에 일관되게 반영한다.
5. 동일 차단 사건의 알림·caller wake는 멱등적이고 제한적이어야 한다. caller가 같은 실패 요청을 반복하거나 복구가 복구를 무한 생성하지 않아야 한다.
6. 일상적 프로세스 확인은 시스템 책임이다. 사용자에게 근거 없이 종료 사실을 인증하게 하거나 종료 증명을 임의 생성하지 않는다.

## 구현 접근과 변경 경계

### 1. 재현과 최초 취소 원인 확인

회사 범위를 제한한 run/wakeup/event/recovery/action 이력으로 취소 호출자와 상태 전이를 복원한다. 취소 전 마지막 상태, 예약 retry deadline, claim 여부, cancellation metadata를 비교한다. 서버 revision과 adapter 변경 이력도 확인한다. 개인 task 본문·인증정보는 회귀 fixture에 복사하지 않는다.

별도 테스트 DB에서 legacy 예약 복구 → 시작 전 취소 → 후속 사용자 메시지 및 caller 댓글 → 보류 상태를 재현한다. 기존 성공 위임을 반례로 유지한다. 재현 결과를 통해 필요한 수정 경계를 확정하며, 추가 증거 없이 “미실행” 예외를 넓히지 않는다.

### 2. 시작 전 취소 및 후속 요청 재개

소유 모듈: `heartbeat/run-control.ts`, `legacy-execution-recovery.ts`, `cancelled-native-startup.ts`, `explicit-native-continuation.ts`, `heartbeat/queue.ts`.

입력: run의 확정된 claim/dispatch/cancellation 증거, 실행 소유권, lease, 현재 요청 권한. 출력: 미실행 입증 / 종료 입증 / 불확실 및 구체적 사유.

기존 proof helper와 receipt를 우선 재사용한다. 필요한 경우 취소 생산자가 소유권 lock 아래 미실행 증명을 저장하게 한다. 소비자가 null PID만 보고 추론하게 하지 않는다. 실제 시작과 취소가 경합하면 단 하나의 경로만 승리해야 한다. 안전한 재개는 저장된 새 요청을 한 번 처리하며 과거 외부 동작을 자동 재연하지 않는다. 오래된 증거 부족 row는 임의 backfill하지 않고 명시적인 조사·복구 대상으로 남긴다.

### 3. 의존 작업 판정 및 caller 전달

소유 후보: `issues.ts`의 blocker attention, 기존 recovery 서비스, 의존성 상태 변경/wakeup 생산자. 구현 전 기존 알림 및 멱등성 계약의 실제 소유 모듈을 확정한다.

입력: 자식의 복구 상태 전이와 실제 dependency 관계. 출력: 부모의 정확한 blocker 상태, 접근 가능한 실패 요약, 적격 caller에 대한 영속 wake 또는 명시적 대기 경로.

기존 `activeIssueIds`, `explicitWaitingIssueIds`, `pathHasLiveWork`가 보류 요청과 `in_progress`를 어떻게 분류하는지 검증한다. 보류된 이유와 재개 가능성을 구분해 판단한다. 동일 복구 사건/상태 revision/부모를 기준으로 중복 전달을 억제한다. 여러 부모, 변경된 담당자, 취소·완료 부모, 순환 의존성과 회사·private task 접근을 처리한다. 실행 불가능한 caller를 무조건 깨우지 않고 기존 사용자 attention 경로를 사용한다.

상태 변화와 기존 delivery coordinator/deadline을 사용한다. 주기적으로 모든 부모를 깨우는 새 polling은 추가하지 않는다.

### 4. UI와 계약 동기화

기존 interruption/execution blocker 표현을 우선 재사용한다. task에는 “요청 저장됨 / 이전 실행 확인으로 시작 보류 / 다음 조치”를 표시한다. 부모에는 “진행 중인 자식” 대신 확인된 차단 사유를 표시한다. Retry는 현재 가용한 조치와 결과를 정확히 설명해야 한다.

새 API 필드가 필요할 때만 shared 타입·검증·서버·UI 클라이언트를 함께 변경한다. schema 변경은 기본 전제가 아니다. 필요하면 DB migration 워크플로를 따른다. UI 변경 시 디자인 토큰과 `pnpm check:token-gates`를 적용한다.

## 검증 기준

| 시나리오 | 통과 기준 |
| --- | --- |
| 정상 caller → callee 위임과 완료 | 기존 실행 및 완료 피드백 유지 |
| 미실행이 입증된 예약 복구 취소 | 권한 있는 새 요청이 한 번 실행되고 이전 동작은 재연되지 않음 |
| 시작과 취소 경합 | 중복 executor 없음; 늦은 claim이 취소를 우회하지 않음 |
| PID만 없거나 dispatch 증거가 불명확 | 안전 차단 유지, 구체적인 이유와 책임 경로 표시 |
| 실제 프로세스 생존 또는 remote 종료 미확인 | 새 실행 불허; 원격 PID를 로컬 증거로 사용하지 않음 |
| callee 복구 중단 | caller 댓글이 수락됐어도 미실행임을 노출; 부모에 같은 이유 전달 |
| 동일 이벤트 재전송·재시작 | 알림과 caller wake 중복 없음; 미전달 기록은 복구됨 |
| caller 취소·pause·예산/승인 제한 | 승인 없는 재개나 우회 없음 |
| 여러 부모·회사 경계·private task | 권한 있는 실제 의존자에게만 전달 |
| task가 In progress이나 보류 요청만 존재 | 정상 실행 중으로 잘못 분류하지 않음 |
| 정상 인간 승인 대기 | 잘못된 자동 재시도나 정체 경보 없음 |

가장 작은 의미 있는 회귀 테스트를 수정 전 실패, 수정 후 성공으로 확인한다. 프로세스·취소 경합은 실제 로컬 테스트 프로세스와 격리된 인스턴스로 검증한다. caller/callee 전체 흐름은 실제 adapter 구성에서 한 번 이상 검증하고 run/queue/부모 attention 결과를 보존한다. 운영 GAB task를 검증용으로 재개하지 않는다.

변경 패키지와 타입 소비자만 순차 typecheck하며 다른 typecheck 프로세스와 중복 실행하지 않는다. 변경한 feature/access map과 Storybook 계약에 필요한 검사를 수행한다. UI 구조 검사나 단위 테스트만으로 실제 재개 성공을 주장하지 않는다.

## 위험과 전달 단위

- 가장 큰 위험: 불완전한 미실행 판정으로 외부 동작을 중복 실행하는 것. proof 생산자와 소비자를 함께 검증한다.
- caller 알림 폭주 및 재위임 루프: 상태 전이 기반 멱등성, bounded delivery, 기존 Stop 규칙으로 제한한다.
- 과거 task 자동 부활: 취소 task는 그대로 두고 이력 확인과 신규 요청 권한을 분리한다.
- 세 전달 단위로 나눌 수 있다: (A) 재현·취소 증명·재개, (B) blocker 판정·caller 전달, (C) UI 설명·전체 흐름 검증. 전체 완료에는 A–C 모두 필요하다.
- 배포와 기존 사건의 복구는 코드 검증과 별개다. 구현 완료 시 PR 템플릿, 관련 검증 결과, 배포 필요 여부, 원래 task 복구 여부를 각각 보고한다.

## Current state

- Worktree: `/home/gabriel/orca/workspaces/paperclip/delegated-task-recovery-feedback`
- Branch: `gabrielwithappy/delegated-task-recovery-feedback`; base: `57b9c1a3680e896c1ee2486e1603cc36a003ad7e` (원본 checkout과 같은 revision).
- 소유권: run-control의 취소 fence가 예약 run의 미실행 증명을 생산하고 기존 continuation/recovery 소비자가 검증한다. issues blocker read model은 실제 실행/유효한 대기를 구분한다. 피드백은 기존 recovery delivery 소유 모듈을 확인 중이다.
- 확인: 예약 retry는 별도 run이며 dispatch가 startupCancellation을 검사한다. blocker read model은 deferred wake와 in_progress를 살아 있는 경로로 분류할 수 있다.
- 의존성 설치 완료. 구현 및 회귀 검증 진행 중. 최초 운영 취소 호출자는 아직 재확인하지 않았다.

Next concrete action: 예약 취소 증명과 보류 blocker 오분류를 DB 회귀 테스트로 재현한다.

연결된 구현 issue가 없어 운영 사건에 댓글/업로드하지 않는다. 원본 checkout의 미커밋 파일은 보존한다.

## 구현 및 검증 기록

- 예약 취소의 미실행 증명 생산/검증, blocker attention 판정, 직접 의존자 복구 notice와 재시작 가능한 delivery를 구현했다.
- 관련 8개 suite 실행: 532 통과, 신규 fixture 2 실패. 이벤트 순번 충돌과 일반 wake의 완료 후 임의 key 중복 제거를 가정한 테스트를 수정한 뒤 해당 2개 시나리오 통과.
- 일반 wake 재호출의 exactly-once 보장은 이 검증에 포함되지 않는다. 전체 원격 adapter 여정과 최초 운영 취소 호출자 재확인은 미완료이며 운영 task는 변경하지 않았다.
- map 구조 검사와 git diff --check 통과. UI는 기존 system notice 표현을 사용한다.
- 사용자가 전체 변경의 devel 적용을 명시적으로 요청했다. 구현 완료 전체 인수 검증으로 간주하지 않는다.

Next concrete action: devel 적용 후 남은 타입 검사 결과와 실제 요청 재전송 보장을 확인한다.

- 서버 `pnpm exec tsc --noEmit --pretty false`를 단독 1회 실행했다. OOM 없이 종료했으나 Runner 패키지 타입 누락 및 여러 기존 소비자 implicit-any 오류로 실패했다. 신규 proof/feedback/run-control/issues 변경 파일에 대한 진단은 없었다. 추가 빌드/타입검사 재실행은 하지 않았다.
