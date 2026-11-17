---
status: complete
priority: high
updated: 2026-11-17T00:15:00+09:00
reviewed_by: [principles_review, qa_review, qa_slack_plan, debug_slack_plan, qa_slack_recovery]
authorization: Implementation and QA review authorized by user on 2026-11-16
---

# Slack 답변 전송 정체: 원인 및 수정 계획

## 목표와 범위

Slack DM에서 생성된 답변이 사용자에게 전달되지 않는 장애를 분석하고 진행 알림의 전송 전 DB 검사 실패 경로를 수정한다. 2026-11-16 후속 사용자 요청으로 계획 구현과 독립 QA·수정이 승인되었다. 기존 DB 정리 이력을 보존하고 회사 경계, 중복 전송 방지, 실제 전송 결과 불명 메시지의 운영자 해소 절차를 유지한다. 실제 복구는 인증된 관리 경로와 provider 확인을 확보한 범위에서만 수행하며, 미확보 항목은 미검증으로 남긴다.

## 확인된 원인과 타임라인

모든 시각은 2026-11-16 한국 시간이다. 22시대 health 조회로 확인한 서비스 revision은 `b162600bedbaa14b6688e9d8052f838117044398`이다. 최초 오류가 발생한 15:27 서비스 프로세스는 이후 조회 프로세스와 달랐으며, 당시 revision은 확인하지 못했다.

- 15:27:52: 과거 진행 알림 처리에서 `heartbeat_runs`의 상태와 오류 코드를 읽는 `SELECT ... FOR UPDATE`가 실패했다. 로그에는 PostgreSQL 원인 코드가 없어 교착 상태, 연결 실패 등을 확정할 수 없다.
- 실패한 진행 알림은 `delivery_unknown`, 시도 1회로 남았다.
- 같은 대화의 선행 `pending/retry/streaming/delivery_unknown` 메시지가 후행 전송을 막는 순서 보장 조건 때문에 실제 답변도 선택되지 않았다.
- 22:16:28: 신고 대상 메시지는 정상 접수됐다. 연결된 에이전트는 엘리스(VP)였다.
- 22:16:41: 실행이 성공하고 “안녕하세요! 엘리스입니다.” 답변이 생성됐지만, 전송은 `pending`, 시도 0회였다.
- 정리 직전 선행 불명 진행 알림 1건과 후행 대기 메시지 7건을 확인했다.

내부 DB 오류가 전송 결과 불명으로 이어지고, 순서 보장 규칙이 이를 대화 전체 정체로 확대한 것이 확인된 장애 경로다. 현 소스에서는 `runOwnershipMilestoneSupersessionReason`의 해당 DB 조회가 `postSafePublication`보다 먼저 실행되고, 일반 DB 오류는 `failures.ts`를 거쳐 분류기의 기본 `delivery_unknown` 분기로 들어가는 경로를 확인했다. 다만 사고 당시 revision 및 동일 경로의 오류 주입 재현은 미확인이다. 현재 소스의 호출 순서만으로 최초 PostgreSQL 오류 원인까지 확정하지 않는다. Slack 상태 표시 오류는 이번 직접 원인으로 입증되지 않았다.

## 관련 구현

- `server/src/services/chat-channels/publication-replacement.ts`: 진행 알림 유효성 검사와 issue → run 행 잠금.
- `server/src/services/chat-channels/publications/worker.ts`: 전송 시도, 선행 미해결 메시지 검사, 진행 알림 대체 및 실패 처리.
- `server/src/services/chat-channels/publications/queue.ts`: 선행 메시지에 따른 후행 후보 제외.
- `server/src/services/chat-publication-errors.ts`: 오류 분류.
- `server/src/services/chat-channels/publications/resolution.ts`: 운영자 해소, 감사 로그, 큐 알림의 정상 경로.
- `server/src/services/chat-delivery-work.ts`, `packages/db/src/work-signals.ts`: 큐 실행 예약과 프로세스 내부 알림. 직접 SQL은 이 알림을 발생시키지 않는다.

## 수행한 DB 정리와 검증

대상은 기존 진행 알림 한 건으로 한정했다. 삭제하거나 전송 성공으로 위장하지 않았다.

- publication: `21afce0b-1f63-4041-849f-6624110a4f38`
- company: `0087aede-0d1d-4bdc-ae9a-9e9c70ac2428`
- conversation: `344a42c0-ae16-428c-a658-909d08c8d973`
- 변경: 회사 ID, `delivery_unknown` 상태, `progressState=working` 조건으로 `cancelled` 전환, 재시도 시각 제거.
- 동일 트랜잭션에서 `activity_log`에 `chat.publication_cancel` 기록을 추가했다. 실제 사용자 신원을 추정하지 않고 system actor로 직접 SQL 복구임을 기록했다.
- 변경 전 원본은 로컬 `/tmp/paperclip-slack-incident/before.json`에 보존했다. 이 파일은 임시 증거이며 영구 백업이 아니다.
- 사용자가 DB 정리를 명시적으로 승인한 범위에서 로컬 관리 DB 접근으로 예외 복구했다. 보드 API 조회는 403이었으며, 직접 SQL은 보드 권한 검사·서비스 검증·process-local 알림을 거치지 않았다. 403은 직접 DB 변경의 권한 근거가 아니며 이 방법을 표준 복구 절차로 일반화하지 않는다. 오래된 진행 알림을 재전송할 필요가 없어 취소했으며, 실제 Slack 전달 여부를 확인했다고 주장하지 않는다.
- 재조회 결과 차단 알림은 `cancelled`; 후행 7건은 여전히 `pending`, 시도 0회였다. 실제 답변과 실행은 수정하지 않았다.

**DB 차단 해소와 사용자 답변 복구는 별개다.** 직접 SQL은 서버 내부 wake 신호를 발생시키지 않는다. 이것이 정리 직후 대기가 유지된 이유라는 해석은 타당한 가설이나, 다른 예약·외부 wake 여부까지 배제한 것은 아니다. 후행 전송 재개는 미검증이다. 서버 재시작이나 새로운 Slack 메시지 전송은 수행하지 않았다.

## 합의한 처리 기준

DB 쿼리 실패와 정상 조회 결과가 없는 경우는 다르다. 이번 기록은 쿼리 실패이며, 정보가 없었다는 증거가 아니다. SQLSTATE가 없으므로 일시 오류였다고도 단정하지 않는다.

| 상황 | 계획상 처리 |
| --- | --- |
| 진행 알림의 전송 전 일시 DB 오류 | 기존 재시도 예산을 재사용하여 제한적으로 재시도한다. `delivery_unknown`으로 분류하지 않는다. |
| 해당 진행 알림의 재시도 소진 | `failed`로 종료하고 사유와 시도 횟수를 보존한다. 같은 대화의 최종 답변을 계속 막지 않아야 한다. 실제 작업은 알림 실패만으로 중단하지 않는다. |
| 전송 전 재시도로 회복할 수 없는 오류 | 무조건 재시도하지 않고 명확한 실패로 처리한다. 구체적 오류 분류는 재현과 DB 드라이버 계약으로 결정한다. |
| 실행 종료로 의미가 없어진 진행 알림 | 기존 supersession의 취소·대체 동작을 재사용한다. 실패 소진의 `failed`와 구분한다. |
| 실제 provider 호출 결과 불명 또는 수락 후 결과 저장 실패 | `delivery_unknown`을 유지한다. 자동 재전송·취소로 중복 위험을 숨기지 않는다. |
| 실패 상태 기록 자체도 DB 장애로 불가능 | 즉시 종료·큐 진행을 보장하지 않는다. DB 복구 후 안전하게 재개할 경로와 프로세스 중단 경계를 검증한다. |

이 표는 주로 보조적인 진행 알림의 실패 처리다. 최종 답변·파일·승인/상호작용 메시지를 같은 이유로 자동 취소하거나 건너뛰는 정책은 추가하지 않는다. DB 자체를 자동 복구하는 구현도 아니다.

## 구조·설계 적합성 리뷰

판정: 진행 알림의 로컬 검사 오류를 실제 전송 불명과 구분하는 방향은 기존 구조에 맞다. 아래 수정 경계를 기본 구현 범위로 삼는다.

- **소유 모듈:** `publication-replacement.ts`가 진행 알림 유효성을 검사하고, `publications/worker.ts` → `failures.ts`가 그 검사 실패의 상태 전환을 소유한다. 이번에 부족한 계약은 이 특정 검사에서 발생한 로컬·전송 전 오류를 식별하는 정보다. 작은 타입/오류 경계를 우선 사용하고 새 범용 복구 프레임워크를 만들지 않는다. 이 검사와 관계없는 모든 DB 오류를 문자열·SQLSTATE만 보고 재시도로 바꾸지 않는다. 전송 후 DB 오류는 여전히 결과 불명일 수 있다.
- **기존 계약 재사용:** `failed`는 이미 후행 메시지를 막지 않으며 일반 retry는 총 5회에서 종료한다. `queue.ts`의 순서 조건·기본 provider 불명 분류·rate-limit 예외를 완화하거나 중복 구현할 이유가 없다. 새 상태/DB migration/API 계약은 기본 수정에 필요하지 않다. lease의 회사·시도·상태 조건과 issue → run 잠금 순서를 보존하며 Slack I/O 동안 DB 트랜잭션/행 잠금을 유지하지 않는다.
- **복구의 한계:** 검사 오류 뒤 실패 상태 저장까지 불가능하거나 lease를 잃으면 현재 소유권을 우회해 상태를 바꾸지 않는다. 재시작 뒤 미전송 증거가 없을 때 stale `streaming`을 `delivery_unknown`으로 격리하는 것은 기존 안전 설계다. 이를 유지하고 실제 관리 해소 경로를 검증하는 것까지 기본 범위다. 프로세스 중단 뒤 자동 복구를 위해 새 영속 전송 단계를 도입하는 작업은 별도 설계 범위이며 이번 수정의 필수 구현으로 확대하지 않는다.
- **예약과 제품 책임:** 자동 재시도·후행 메시지 wake는 기존 `notifyChatPublicationWork`와 delivery-work coordinator/work-scheduler를 재사용한다. 사용자에게 로컬 DB 오류 정리를 맡기지 않는다. 상태 기록과 work signal은 같은 트랜잭션에 등록하고 commit 불명·drain/resume의 기존 의미를 보존한다. 새 polling·타이머·DB 접속 재시도 계층을 추가하지 않는다.
- **검증 범위:** 이 경로는 Slack 전용이 아닌 공유 publication 로직이다. Slack 실제 회귀와 함께 동일 검사를 사용하는 기존 다른 provider fixture 한 건에서 선택한 오류 경계가 동일하게 동작하는지 확인한다. 파일 전송·명시적 게시·rate-limit 등 별도 경로의 정책을 바꾸지 않는다. UI는 실제 접근 결함이 확인된 경우에만 해당 부분을 보완하며 재설계하지 않는다.

리뷰에서 보완한 계획상 공백은 전송 단계 분류의 적용 범위, crash 복구를 위한 영속 상태 확장의 범위, 기존 wake/lease 계약 및 공유 경로 검증이다. 이 판정은 소스 대조에 근거하며 사고 재현·구현 성공의 증거가 아니다.

## 수정 계획

1. **최초 오류와 사용자 접근 문제 조사.** 보존된 로그에서 DB 오류 및 사고 당시 revision을 확인하되 확보 불가 시 미확정으로 남긴다. 현재 코드와 실제 worker 오류 주입으로 재현한 증거를 사고 당시 사실과 구분한다. 보드 API 403의 호출 주체·인증 방식·권한 조건과 실제 사용자 세션의 접근을 구분한다. 사용자가 본 `Slack session status / failed / Provider action`은 대상 publication이 아니며, 메시지 게시 여부의 증거로 삼지 않는다. 대상 publication ID와 endpoint·회사를 대조하고, 활동 화면에서 안 보이는 이유(필터·페이지·조회 범위·권한 등)를 조사한다. 활동 목록은 기본 25개·생성일 내림차순이므로 오래된 차단 기록이 첫 페이지 밖인지 확인하되 원인으로 단정하지 않는다.
2. **전송 단계별 오류 경계 수정.** `publications/worker.ts`의 진행 알림 유효성 검사에서 DB 오류를 주입해 provider 호출 0회를 입증한다. 해당 진행 알림 검사에서 발생한 로컬·전송 전 오류를 명시적으로 구별해 기존 실패 처리에 전달한다. 이 특정 검사 오류가 provider 오류 분류기의 기본 `delivery_unknown`으로 흐르는 경로를 수정하되, 공통 분류기의 미분류 오류 기본값은 보존한다. `providerAccepted=false`만으로 미전송을 단정하지 않는다. 요청을 보냈으나 응답을 못 받은 경우에도 false일 수 있다. provider별 프로토콜은 기존 플랫폼 모듈에 둔다. SQLSTATE·안전한 원인 분류·단계를 기록하되 SQL 인자·메시지 본문·인증정보는 추가 로그에 노출하지 않는다.
3. **유한 재시도와 소진 후 종료.** 확인된 전송 전 일시 DB 오류만 재시도한다. `failures.ts`의 기존 일반 재시도 예산(현재 총 5회 시도에서 종료)과 대기 정책을 우선 재사용하고 이중 재시도 루프를 만들지 않는다. 소진된 진행 알림을 `failed`로 확정하고 후행 답변이 선택·전송되는지 확인한다. DB 회복으로 해결될 오류와 기록 부재·검증 실패를 구분한다. 기존 기록 부재 처리는 별도 조사하되 이번 사고를 기록 부재로 재해석하지 않는다.
4. **지속 DB 장애와 기존 진행 알림 대체 경로 검증.** 상태 저장도 실패하면 현재 코드는 `streaming`을 남길 수 있고 stale 처리가 이를 `delivery_unknown`으로 격리할 수 있다. 단순 오류 분류 변경만으로 이 경로까지 해결됐다고 주장하지 않는다. 살아 있는 worker, lease 상실, 프로세스 중단 및 DB 복구를 구분하고, 미전송 증거가 신뢰 가능하게 남는 범위에서만 안전하게 재개한다. 재시작 뒤 증거가 없다면 임의 자동 재전송을 하지 않는다. DB 복구 후에도 미전송 증거가 없으면 기존 격리와 인증된 관리 해소를 유지한다. 새 영속 상태를 통한 crash 이후 자동 복구는 기본 수정에 포함하지 않으며, 필요성이 입증되면 별도 설계로 영향 레이어와 검증을 제시한다. 이미 종료된 실행의 진행 알림은 `publication-replacement.ts`의 기존 `runOwnershipMilestoneSupersessionReason`을 재사용한다. 작업 종료 후 진행 알림이 실제 발송된 사례는 확인되지 않았으며 새 장애 사실로 추가하지 않는다. 실제 전송 불명 메시지를 자동 해소하는 권한 확장은 이번 기본 수정에 포함하지 않는다.
5. **실제 사용할 수 있는 관리 경로 검증·필요 부분 보완.** API·UI 코드 존재와 사용 가능성을 분리한다. 활동 GET의 `connections:audit`와 resolve POST의 board actor 및 `tools:manage_connections` 검사는 다르므로 조회 가능 여부와 변경 가능 여부를 따로 확인하고 기존 관리자 예외도 보존한다. 실제 권한 있는 사용자 세션에서 Apps → Slack 연결 → Activity의 대상 publication 노출, `resolutionActions`, 버튼 및 권한을 확인한다. `delivery_unknown`일 때 `mark_delivered / retry_anyway / cancel`이 상태·종류에 맞게 제공되는지 확인한다. 허용되지 않은 사용자는 기존대로 거부하고, 403 해결을 위해 회사 경계나 권한을 완화하지 않는다. 이미 취소한 사고 대상은 현재 상태·화면 노출·후행 답변 진행을 확인하며 Resolve 버튼이 없어야 정상이다. 해소 버튼·감사·wake 동작은 승인된 제한 fixture 또는 별도 실제 미해결 건으로 검증한다. 이를 위해 취소된 사고 기록을 `delivery_unknown`으로 되돌리지 않는다. 실제 provider 게시를 확인할 기존 수단을 조사하되 자동 확인 기능을 가정하지 않는다. 관리 해소의 감사 로그·트랜잭션·큐 wake·빈 큐 재예약을 검증한다. 전송 실패와 세션 표시 실패가 구분돼야 한다. 필요 시 해당 UI/API만 보완하고 무조건 polling이나 직접 SQL을 표준 복구 경로로 추가하지 않는다.
6. **현재 대기 답변의 실제 복구.** 후속 구현·운영 작업에서 최신 상태와 이미 게시된 내역을 먼저 확인하고, 검증된 인증 관리 경로로 필요한 메시지만 재개한다. publication ID와 provider message ID 및 실제 Slack 표시를 대조해 수신·중복 여부를 확인한다. 오래된 진행 알림은 정당한 취소·대체를 허용하며 과거 관측의 7건 전체 전송을 요구하지 않는다. 안전한 경로가 없으면 영향 범위와 필요한 운영 조치를 명시하고 미복구로 남긴다. 전역 exactly-once 보장은 주장하지 않는다.

## 검증 및 완료 기준

- 회사·issue·run에 결합한 working publication과 후행 final을 구성하고, 실제 worker의 해당 heartbeatRuns SELECT에만 오류를 주입하여 claim·다른 조회·실패 저장은 동작하게 둔다. 별도 케이스에서 실패 저장 UPDATE도 실패시킨다. 수정 전 `delivery_unknown` 재현, 수정 후 provider 호출 0회 및 제한된 `retry`를 확인한다. 분류기 mock만으로 완료하지 않는다.
- 일시 오류 회복 후 정상 전송, 재시도 소진 후 진행 알림 `failed` 및 후행 최종 답변 진행을 각각 확인한다. 재시도 횟수·대기 정책이 유한하고 기존 예산과 일치해야 한다.
- DB가 실패 상태 저장까지 거부하는 경우, DB 회복 후 처리와 worker 중단/lease 상실/stale quarantine 경계를 검증한다. 미전송을 증명할 수 없는 기록은 자동 해소하지 않으며, 그 경우의 관리 해소도 검증한다. 로그만으로 재시작 후 미전송을 보장하지 않는다.
- provider 응답 유실, provider 수락 후 DB 저장 실패는 `delivery_unknown`으로 보존되고 자동 재전송되지 않아야 한다. 완료된 실행의 진행 알림 취소·대체는 기존 동작으로 검증한다.
- 기존 `chat-channels.integration.test.ts`의 `isolates malformed publication preparation so later messages still deliver`, `holds ambiguous provider sends for an audited duplicate-risk resolution without reordering` 및 terminal run 진행 알림 테스트를 우선 재사용한다. malformed preparation 사례는 Discord 준비 단계이고 ambiguous 사례는 service 직접 호출이므로 이번 SELECT 재현이나 board 권한·UI 사용 가능성의 증거로 대체하지 않는다. `suppresses queued and working placeholders that terminalize while paused`를 종료된 실행의 진행 알림 회귀로 재사용한다. 필요한 실제 worker 회귀 사례만 추가한다.
- 기존 다른 provider fixture 한 건에서도 같은 진행 알림 검사 오류의 분류를 확인한다. 기존 rate-limit의 예산 예외와 실제 전송 오류 분류는 보존한다.
- 실패 상태 전환·work signal·재시도 deadline이 기존 coordinator를 통해 후속 시도로 이어지는지, lease 상실 시 stale worker가 상태를 덮어쓰지 않는지 확인한다.
- 같은 대화 순서, 다른 대화의 정상 진행, 중복 전송 방지, 회사 경계 및 운영자 권한을 유지한다. 진행 알림 실패와 실제 작업 실패를 혼동하지 않는다.
- 실제 사용자 세션에서 취소된 사고 대상 기록의 ID·현재 상태·노출 및 후행 전송을 확인한다. 별도의 승인된 `delivery_unknown` 검증 건에서 기록 발견 → 허용된 해소 버튼 → 감사 이력 → 후행 전송 재개의 경로를 검증한다. 취소된 사고 기록은 검증 목적으로 되돌리지 않는다. 권한 없는 사용자 거부 및 현재 403 원인도 확인한다. 화면 접근이나 provider 확인을 못 하면 해당 인수 항목을 미검증으로 남긴다.
- 실제 Slack에서 신고 대상 답변의 provider message ID와 사용자에게 보이는 결과를 확인한다. DB `published`나 API 성공만으로 실제 수신을 단정하지 않는다.
- 후속 구현에서는 변경 범위의 서버 테스트를 먼저 실행한다. UI 변경 시 토큰 게이트와 관련 UI 검증, 타입 계약 변경 시 해당 소비자까지 직렬 typecheck, map 변경 시 map 검사 등 저장소 규칙을 적용한다.
- 최초 계획 수정·읽기 전용 리뷰 당시에는 테스트·빌드·typecheck를 실행하지 않았다. 문서 변경 검토와 `git diff --check`, 새 문서 whitespace 검사를 수행한다. 리뷰는 구현 성공이나 라이브 복구 증거가 아니다.

## 구현 및 QA 실행 결과 (2026-11-16)

- `publication-replacement.ts`의 issue → run 잠금 조회 트랜잭션만 `ChatProgressValidationError`로 감쌌다. 정상 조회의 기록 부재 의미, 잠금 순서와 provider transport 경계는 변경하지 않았다.
- `progress-validation-error.ts`는 Drizzle cause의 구조화된 허용 코드만 검사한다. 알려진 일시 DB 오류는 retryable이고, 영구·미분류 오류는 non-retryable이다. query·params·원문·cause는 진단에 보존하지 않는다. `CONNECTION_ENDED`는 종료된 로컬 pool이므로 재시도 대상으로 추가하지 않았다.
- `failures.ts`는 해당 경계 오류만 기존 publication retry/failed 처리에 연결한다. 기존 총 5회 예산과 지수 대기, 트랜잭션 work signal, lease 검증을 재사용한다. provider 수락 우선 분기와 공통 provider 분류기의 기본 `delivery_unknown`은 그대로다. migration·UI·권한·polling 변경은 없다.
- 수정 전 재현: 경계 wrapping만 일시 제거하고 동일 worker fixture를 실행했다. 실제 PostgreSQL `40001` 오류를 status/errorCode SELECT 위치에서 발생시켜 provider 호출 0회 후 `delivery_unknown`이 되는 실패를 확인했다. 검증 후 구현을 복원했다. 이 재현은 현재 소스의 증거이며 사고 당시 SQLSTATE나 revision을 확정하지 않는다.
- 새 worker 6개 사례: Slack/Telegram 일시 오류 회복 2건, coordinator deadline 자동 재개 및 idle, 5회 소진/후행 답변/실행 유지, 영구 오류 실패, 실패 저장 자체의 PostgreSQL 오류 → worker 종료 → stale 격리 → board Activity GET/resolve POST → 감사 취소/후행 전송. 실패 저장까지 거부하면 즉시 안전하게 자동 복구된다고 주장하지 않는다.
- QA `qa_slack_recovery`는 코드·오류 주입·재현 로그를 독립 검토했다. 관리 API의 204 응답 테스트 수정과 임의 5자 진단 코드 제한을 반영했다. 현재 추가 중대 코드 결함은 보고되지 않았다.
- 1차 새 회귀 5건 통과 후 coordinator/API 검증을 추가했다. 확장 실행에서 27건 통과, 1건 실패(테스트 기대 200, 실제 API 계약 204)가 있었다. 기대값 수정 뒤 실패 사례와 누락됐던 provider 분류/수락 후 저장 실패를 별도로 실행하여 37건이 통과했다. 성공한 테스트는 합계 64개 고유 사례(통합 15, 안전 진단 14, provider 분류 35)이며, 필터 밖 전체 suite 통과를 의미하지 않는다.
- 기존 malformed preparation, ambiguous provider send/감사 replay, terminal progress supersession, connection-manager 거부, 회사 경계, 정확 lease orphan 격리/수락 후 lease 상실, commit wake/빈 슬롯 재예약을 함께 검증했다. 실제 수락 후 저장 실패는 task-bound `/close` publication fixture로 `delivery_unknown` 보존을 확인했다.
- 재현 명령: `pnpm --filter @paperclipai/server exec vitest run src/__tests__/chat-channels.integration.test.ts -t 'pretransport run progress database failures'`; 진단은 `src/services/chat-channels/progress-validation-error.test.ts`, provider 분류는 `src/services/chat-publication-errors.test.ts`를 실행한다. 실행 로그는 `/tmp/slack-progress-red.log`, `/tmp/slack-progress-test.log`, `/tmp/slack-progress-qa.log`, `/tmp/slack-progress-final.log`에 임시 보존한다.
- `node scripts/check-maps.mjs` 통과: 35 areas/192 capability IDs. `git diff --check` 통과. `pnpm --filter @paperclipai/server typecheck` 통과(다른 typecheck가 없음을 확인하고 테스트 완료 후 단독 실행). UI 변경이 없어 token gate/브라우저 suite는 실행하지 않는다. 좁은 서버 변경이므로 repo-wide test/build/typecheck는 실행하지 않는다.

## 현재 상태

요청된 코드 구현과 독립 QA 수정이 완료되었고, 사용자가 운영 확인 테스트를 직접 수행하기로 했다. 이 계획의 구현 범위는 완료로 처리한다. 운영 검증은 사용자 후속 작업이며 아래에 당시 확인 한계를 보존한다. 이전 DB 정리 직후 후행 7건 pending 관측은 역사적 기록이며 최신 상태로 간주하지 않는다.

2026-11-16 23:27 KST 현재 3110 health는 authenticated/private 및 revision `ff0cdd1ad77cec291002fe50b123ba85c501e5d0`을 반환했다. 세션 없는 사고 endpoint 활동 GET은 **401 Unauthorized**다. 이 요청은 과거 403과 같은 인증 주체라는 증거가 없으므로 과거 403 원인을 확정하지 못했다. 원본 임시 증거 디렉터리에는 `before.json`만 있어 최초 SQLSTATE/revision 로그는 확보하지 못했다. Paperclip task/run 인증 환경이나 연결된 Slack 도구도 제공되지 않았다.

따라서 취소된 사고 publication의 현재 노출·후행 답변 상태, 실제 사용자 Activity 화면, 실제 Slack provider message ID·수신·중복 여부는 미검증/미복구로 남긴다. 인증 우회·직접 SQL 복구·사고 상태 되돌리기·관리 서버 재시작·배포는 수행하지 않았다. fixture board actor API 검증은 실제 세션 로그인 증거가 아니다.

후속 운영 확인은 사용자가 수행한다.

## 리뷰 반영

- AgentOS 원칙 리뷰 (`principles_review`): 사고 당시 revision과 현재 소스 증거 분리, 사용자 승인과 직접 SQL 접근 경계 명시, 승인 범위에 맞춘 다음 행동, 자동 해소 정책의 조건부 검토를 반영했다.
- QA 리뷰 (`qa_review`): 현재 소스의 전송 전 오류 경로, 실제 worker 오류 주입과 기존 회귀 테스트 재사용, 답변별 provider 수신 확인, 관측 시점의 한계를 반영했다.
- 후속 QA 리뷰 (`qa_slack_plan`): 활동 조회와 해소 권한 차이, 기본 25개 페이지와 대상 ID 대조, 기존 테스트의 증거 범위를 반영했다. 이미 취소된 사고 기록의 조회 검증과 별도 미해결 건의 해소 버튼 검증을 분리하고, 검증을 위한 사고 상태 되돌리기를 금지했다.
- 후속 디버깅 리뷰 (`debug_slack_plan`): 기존 5회 시도 예산, providerAccepted 플래그의 한계, 실패 저장까지 실패하는 경우의 streaming/stale 격리, 재시작 후 영속 증거 경계를 반영했다. 최신 계획 재검토에서 남은 필수 수정 없음으로 보고했다.
- 구조·설계 후속 리뷰 (주 에이전트): module/chat-platform/sleep-aware 규칙과 worker·failures·queue·transport·work-signals를 대조했다. 특정 검사 오류의 작은 계약, 기존 retry/wake/lease 재사용, crash 격리 유지, 영속 상태 확장의 별도 범위 및 공유 provider 검증을 명시했다.
- 리뷰는 자문이며 구현 승인이나 라이브 복구 검증을 의미하지 않는다.

## 문서 접근 제한

현재 대화에는 Paperclip task/run 인증 환경과 귀속 issue가 제공되지 않아 업로드 helper 및 artifact work product 등록을 수행하지 못했다. 이 문서는 저장소 파일로 제공하며 업로드 완료로 간주하지 않는다. 기존 관련 없는 계획 문서 삭제 변경은 보존했다.
