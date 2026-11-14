---
status: active
priority: high
updated: 2026-11-14
authorization: Implementation authorized
reviewed_by: [qa_opencode_repair]
---

# OpenCode / NVIDIA gateway 설정 저장 복구

## 목표와 승인 범위

사용자 요청: 수정 계획 작성 → QA 에이전트 리뷰 → 계획 보완 → 구현 및 검증.
로컬 GAB 회사의 에이전트를 OpenCode와 기존 NVIDIA Chat Completions 연결로 설정할 수 있게 한다.
기존 지침·환경변수·스킬·연결 키·작업 이력·에이전트 pause 설정을 보존한다.
새 connection 등록이나 instance-admin 권한 부여, 보안 검사 완화, 회사 전체 자동 실행 재개는 범위 밖이다.
제품 계약: ../SPEC-implementation.md, ../PRODUCT.md; 이관 배경: ./2026-11-13-devel-local-service-migration.md.

## 확인한 증거와 아직 확인할 점

- 로컬 서비스 :3110은 현재 checkout을 실행한다. 기존 작업의 변경 파일이 많아 모두 보존해야 한다.
- 11:14:29 KST 엘리스 PATCH adapterType=opencode_local 은 403. 기존 instructionsBundleMode=external,
  instructionsFilePath/root는 Docker의 /paperclip/instances/default/... 경로다. 대응 파일은 새 PAPERCLIP_HOME에 존재한다.
- test-environment는 기존/대상 harness가 다르고 요청 env에 plain ***REDACTED*** 값이 있으면 422를 반환한다.
  DB의 실제 값이 정상이더라도 읽기 API/UI의 마스킹 값이 요청에 남을 수 있다. 사용자 실제 입력 후 요청은 별도로 확인해야 한다.
- Chat gateway는 opencode_local/hermes_local과 호환된다. paperclip_runner는 provider를 함께 전달해야 정규화된다.
- 403의 정확한 throw 지점과 경로 변경 이후의 추가 저장 검증/모델 요청 성공은 아직 입증하지 않았다.

## 구현 순서와 소유 경계

1. QA가 아래 계획과 실제 코드에서 원인·권한·복구 위험을 리뷰한다. 근거 있는 수정 사항을 이 문서에 반영한다.
2. 운영 이관 보조 도구와 기존 instructions service를 대조한다. Docker → 현재 HOME의 같은 company/agent 지침만
   명시적·검증 가능한 복구 대상으로 삼는다. 외부 사용자 경로를 자동 managed로 전환하는 전역 휴리스틱은 금지한다.
   dry-run, 파일/경로 검증, 원래 설정 백업, 동시 변경 감지, 회사 범위, 감사 기록 및 재실행 안전성을 갖춘 최소 복구를 구현한다.
3. 실제 원인이 제품 코드 결함이면 해당 소유 모듈에서만 수정하고 회귀 테스트를 먼저 실패시킨다.
   경로 이관 문제만으로 설명되면 권한 검사를 바꾸지 않고 이관 도구/운영 설정만 복구한다.
4. 환경변수 경고는 별도 원인으로 취급한다. 숨겨진 변수를 새 harness에 조용히 전달하거나 지우지 않는다.
   사용자가 입력한 값이 버려지는지 재현하고 필요할 때만 UI 저장/테스트 경로를 수정한다.
5. 기존 connection/model을 사용하는 OpenCode 저장과 재조회, 가능한 경우 환경 테스트를 실제 서버에서 검증한다.
   외부 공급자 모델 실행은 API 호출/비용과 현재 paused 상태를 고려해 설정 검증과 구분한다.
6. QA가 최종 diff와 검증 결과를 다시 리뷰한다. 결과·남은 제한·복구 절차를 이 문서에 기록한다.

## 안전 및 운영 원칙

- 실제 NVIDIA 키·환경변수 값·세션을 출력/문서화하지 않는다. 인증 세션 복제나 권한 상승으로 403을 우회하지 않는다.
- 실제 외부 지침 접근은 계속 instance-admin을 요구한다. agent/company 경계와 symlink/traversal 검사도 유지한다.
- 지침 파일/DB 버전 기록은 보존한다. 경로만 달라진 경우 내용 변경으로 가장하지 않는다.
- 실행 중 단일 checkout의 source 수정/빌드 전 서비스의 실제 command와 writer/run 상태를 확인한다.
  필요한 경우 저장된 설정을 보존하고 app/callback을 정지, 백업한 후 수정/빌드하고 정상 복구한다.
- DB 스키마 변경, 새 migration, unrelated 파일 수정, 자동 commit/push/merge는 하지 않는다.

## 인수 시나리오와 검증

- 원래 managed 번들이 동일 company/agent 위치로 이관됨: 검증한 현재 파일로 경로 복구 후 일반 회사 운영자가 harness 저장 가능.
- 실제 외부 경로, 다른 company/agent 경로, traversal/symlink, 누락 파일은 복구 거부; 기존 설정 유지.
- stale DB 설정이면 덮어쓰지 않음; 재실행은 무변경; env/connection/skills/history/pause 상태 유지.
- 명시 입력된 환경변수는 테스트 요청에 반영; 가려진 미입력 값은 다른 harness 테스트에서 여전히 거부.
- OpenCode+chat 허용, Codex+chat 거부; Runner provider 누락 문제는 재현된 범위에서만 처리.
- 변경 소유 모듈의 좁은 테스트부터 수행. UI 변경 시 token gates. PR-ready 주장 전에 전체 typecheck/test:run/build.
  전체 검사 또는 실제 로그인 UI 검증이 불가능하면 사유와 실제 확인 범위를 명시한다.

## 초안 작성 시점

사용자 승인 범위, 로그/DB/파일의 초기 증거와 계획을 작성한 뒤 QA 리뷰를 요청했다. 이후 결과는 아래에 기록한다.

## QA 초안 리뷰 반영

- stale root는 stored managed 모드여도 external 분류되므로 UI metadata 수정만으로 403을 해결하지 않는다.
- 복구 도구는 기본 dry-run이며 explicit source instance root, company ID와 agent ID를 요구한다. 엘리스처럼 external 모드여도 과거 canonical root/file/entry 일치와 대상 파일 검증을 통과한 명시적 복구만 허용한다.
- `assertInstructionPathSafe`만으로는 누락 파일을 거부하지 않으므로 `readInstructionBytes` null과 파일 hash를 확인한다. 파일 생성/복사하는 updateBundle은 사용하지 않는다.
- `updateAgentConfigurationInTransaction`으로 revision/알림을 유지하고 같은 트랜잭션에 감사 기록을 남긴다. 선택한 전체 agent를 한 트랜잭션에서 처리하고 lock/CAS로 stale 변경을 거부한다.
- 백업은 0600 전용 파일에 저장한다. 롤백은 경로 4개만, 적용 후 현재 경로와 비교해 조건부로 복원하고 나중 env/model을 덮어쓰지 않는다.
- 현재 모든 유효 agent는 idle이고 run 0이다. 이전 paused 값으로 되돌리지 않는다.
- env의 명시 입력을 버린다는 재현은 아직 없으므로 env guard/UI를 변경하지 않는다. 일반 OpenCode가 선택된 이번 장애에서는 Runner 문제도 범위에서 제외한다.
- 실제 non-admin UI 저장 성공을 인수 기준으로 유지하며 직접 DB adapterType 변경으로 대체하지 않는다.

## 구현 1차 기록

- 제품의 auth/API/UI guard는 수정하지 않는다. `server/src/lib/migrated-instructions.ts`는 명시적 offline 경로 계획/조건부 rollback만 소유한다.
- `server/scripts/repair-migrated-instructions.ts` + `scripts/local-service/repair-instructions`는 기존 pinned config/DB/HOME를 사용하고 기본 read-only dry-run을 수행한다.
- 적용은 앱 listener 정지, active/queued run 부재, 0700 디렉터리/0600 독점 생성 백업을 요구한다. 원래 전체 row와 file hash를 재검증한 단일 트랜잭션으로 구성 revision 및 감사 기록을 남긴다.
- 9개 좁은 테스트 통과: former managed/external canonical 경로, 실제 외부/다른 company/agent 거부, missing/symlink/traversal 거부, idempotence, env/model 보존 및 key-only rollback.
- 최초 `vitest --project server` 호출은 프로젝트 이름 미설정으로 시작 실패했다. server cwd에서 직접 실행하여 1 file / 9 tests 통과. 실패는 회귀 red로 주장하지 않는다.
- 앱/콜백을 정상 정지했고 DB/HOME 복구 백업 진행 중. typecheck 및 실제 6-agent dry-run 시작. 실제 DB 적용은 아직 미수행.

## QA 최종 리뷰 및 실제 적용 증거

- `qa_opencode_repair`가 planner, offline CLI, rollback, HTTP 회귀 테스트를 읽기 전용으로 재검토했다. 추가 차단 결함 없음.
- 지적한 listener 오류 처리 보완: `ECONNREFUSED`만 정지로 인정하며 기타 socket 오류는 중단한다.
- 2026-11-14 11:18–11:31 KST 로컬 app/callback 정지 구간에서 DB/HOME 백업을 수행했다. 약 5.7 GiB HOME archive 목록과 DB dump 목록 검사 및 4개 checksum 검증 통과. 복원 리허설은 수행하지 않았다.
- private recovery set: `~/.local/state/paperclip-migration/20261114-opencode-instructions-repair/`. 원래 config snapshot은 `instructions-before.json`(0600), 실제 적용 receipt는 `instructions-applied.json`. 이 파일들은 비밀 포함 백업이므로 배포/업로드하지 않는다.
- 명시적으로 선택한 GAB 6 agents의 지침 경로만 단일 transaction으로 복구했다. 실제 DB 재조회와 파일 SHA-256 비교로 env/model/connection/runtime/status/defaultEnvironmentId/file bytes 불변을 확인했다.
- 구성 revision 6개 및 `agent.instructions_location_repaired` 감사 기록 6개 생성 확인. 같은 6-agent 명령 재실행 dry-run은 모두 `changed: false`.
- 기존 canonical instruction head는 0개라 revision hash 대조는 실행되지 않았다. 기록된 hash는 현재 이관된 파일의 식별 증거이며, Docker 원본과 동일하다는 독립 증명은 아니다.
- app/callback 모두 active/running 재기동. `/api/health`: ok, bootstrap ready, authenticated/private, commit `29929f3d2cfb96f2ff47a322fcd628651a3768e0` + 현재 dirty checkout. callback의 비허용 GET은 404 유지.
- 실제 NVIDIA key/connection/harness를 도구에서 변경하지 않았다. 연결 키 노출, 권한 상승, auth guard 변경 없음.

## 검증 결과와 제한

- 새 planner 테스트 9개 + 기존 instructions service 15개 통과(24개). route suite 최신 코드 25개 통과. 합계 49개.
- route 회귀는 실제 분류·권한·HTTP PATCH 경로로 같은 non-admin의 403→복구 후 200을 입증한다. 저장 서비스는 mock이므로 실제 사용자 DB 저장·재조회나 NVIDIA 호출 증거를 대체하지 않는다.
- `pnpm build` 전체 통과. 기존 CSS highlight/dynamic-import/chunk-size warning은 유지.
- 최초 전체 typecheck 및 별도 CLI typecheck 병렬 시도는 메모리 부족 SIGKILL/137로 실패. 순차 CLI+server superset typecheck 재시도에서 plans 배열의 implicit-any 오류를 발견해 명시 타입으로 수정했고 최종 동일 typecheck 통과(exit 0).
- route suite 최초 두 시도는 대규모 module graph 로딩의 30초 hook timeout으로 실패/skip. 단독 재시도 `--hookTimeout 120000`에서 25개 통과. 제품 timeout 또는 assertion을 완화하지 않았다.
- 전체 `GOMEMLIMIT=6GiB pnpm -r --workspace-concurrency=1 typecheck` 재실행은 통과(exit 0)했다. 전체 `pnpm test:run`은 미실행: 이번 변경은 offline migration 도구이며 관련 service/route/planner 49개로 검증했다. PR-ready 전체 suite 통과를 주장하지 않는다.
- UI source/시각 스타일/API contract/DB schema 변경 없음; token gates 및 browser CI/release suites는 실행하지 않았다.
- 현재 대화에 Paperclip task/run/API credential이 없어 계획 artifact 업로드나 issue work product 등록은 수행할 수 없다. 이 계획과 도구는 workspace 파일로 제공하고 비공개 백업은 업로드하지 않는다.
- 실제 로그인 브라우저의 접근성 트리/화면 캡처가 지원되지 않아 사용자에게 새로고침→OpenCode/NVIDIA 선택→Save→재조회 결과를 비동기로 요청했다. 이 인수와 실제 NVIDIA 모델 호출은 아직 미확인이다.

## 현재 상태 (실행 결과)

- 완료: 계획 → QA 리뷰/보완 → 도구 구현 → 최종 QA → 백업/실제 6-agent 경로 복구 → 상태·내용 보존/감사/재실행 검증 → 서비스 복구.
- 남음: 실제 사용자 OpenCode 저장 및 재조회 인수. 전체 타입 검사 결과 기록까지 완료했다.
- Next concrete action: 실제 사용자 OpenCode 저장·재조회 결과를 확인하고 이 문서의 인수 상태를 갱신한다.

- 추가 운영 검증: 실행 중 서버에 대한 `--apply`가 offline guard에서 거부되고 백업 파일도 생성하지 않음을 실제 CLI로 확인했다. rollback dry-run도 DB 변경 없이 정상 실행했다.

## OpenCode 로컬 실행 경로 수정 (2026-11-14 후속)

- 사용자 승인: “우선 opencode 연결을 수정하자.” 이번 범위는 로컬 OpenCode 실행 파일 검색 복구다.
- 설치된 `/home/gabriel/.opencode/bin/opencode`는 1.18.9다. 기존 서비스 프로세스의 PATH에는 설치 디렉터리가 없었다. runtime.env의 PATH에는 이미 있었으나 Node env-file은 상속된 PATH를 덮어쓰지 않아 적용되지 않았다.
- 호스트 systemd drop-in `~/.config/systemd/user/paperclipai.service.d/20-opencode-path.conf`를 새로 생성하여 기존 서비스 PATH에 OpenCode 디렉터리만 추가했다. 제품 코드와 runtime.env, 에이전트 설정/환경변수/연결 키는 변경하지 않았다. 롤백은 해당 drop-in 제거 후 daemon-reload/restart다.
- 실행/대기 heartbeat run 0개를 확인한 뒤 daemon-reload 및 paperclipai.service 재시작. 재시작된 실제 서버 프로세스 환경으로 `opencode --version` 실행: 1.18.9, exit 0. `/api/health`: status ok, bootstrapStatus ready.
- 미해결: Codex→OpenCode 전환 요청의 가려진 환경변수 검증 422 및 실제 NVIDIA 모델 호출. 이번 실행 파일 검색 복구는 그 검증을 우회하거나 에이전트 harness를 변경하지 않는다.
