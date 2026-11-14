---
status: active
priority: high
updated: 2026-11-14T22:35:59+09:00
authorization: Implementation authorized; production installation excluded
reviewed_by: [review_opencode_mcp_plan]
plan_review: complete
---

# OpenCode 외부 어댑터의 Paperclip MCP 전달 계획

## 목표와 승인 범위

Paperclip에서 연결·인증하고 에이전트에 허용한 MCP 도구를 OpenCode 에이전트가 실제로 호출하게 한다.
사용자가 후속 메시지로 플러그인 구현을 승인했다. 구현·로컬 fixture 검증·패키징을 진행한다. 운영 설치·활성화, 실제 에이전트 재실행, 커밋·푸시·배포는 이 승인에 포함하지 않는다.

기본 방향은 별도 패키지로 배포하는 **Paperclip 외부 어댑터**다. OpenCode 자체 플러그인 개발과
Paperclip의 일반 앱 플러그인 개발은 이번 구현 방식에 포함하지 않는다.
회사별 인증·권한·승인·감사와 실행별 토큰 발급은 기존 Paperclip 서버가 계속 소유한다.

## 현재 근거와 한계

- 조사 기준: 저장소 `611a8547ea`, 현재 호스트 OpenCode `1.18.9`. 구현 시작 때 다시 확인한다.
- `server/src/services/heartbeat/runtime-execution.ts`는 `runtimeMcp`와 `runtimeTools`를 어댑터에 전달한다.
- `packages/adapters/opencode-local/src/server/execute.ts`는 `runtimeTools`를 환경변수로 전달하지만
  `runtimeMcp.getServers()`를 OpenCode MCP 설정에 반영하지 않는다.
- Codex와 Claude의 `server/execute.ts`에는 `runtimeMcp` 소비 경로가 있다. 주소와 토큰의 전달,
  설정 수명과 세션 식별 방식을 비교하되 각 CLI의 설정 형식은 OpenCode에 복사하지 않는다.
- 이번 장애에서는 서버의 기존 인증 경로를 사용한 Todoist 읽기 호출이 성공했다. 이후 에이전트는
  `ready`를 확인하고도 실제 도구를 찾지 못해 공급자 MCP 주소를 무인증으로 호출하고 새 초안을 만들었다.
  서버 테스트 성공은 OpenCode 에이전트 사용 성공의 증거가 아니다.
- 외부 어댑터 로더는 `createServerAdapter()`를 받아 같은 `type`의 내장 어댑터를 대체한다.
  이 기능은 self-hosted용이며 Cloud-managed에서는 설치가 거부된다.
- 로더의 내장 대체는 **인스턴스 전체**에 적용된다. 특정 회사·에이전트만 바뀐다고 설명하지 않는다.
- 공통 지침의 상태 판정·재조회 문제와 GWS 경로 이관 문제는 별도 개선이다. 이번 계획에서 함께 고치지 않는다.

근거 파일: `docs/adapters/external-adapters.md`, `server/src/adapters/plugin-loader.ts`,
`server/src/adapters/registry.ts`, `server/src/services/adapter-code-policy.ts`,
`packages/adapter-utils/src/types.ts`, `packages/adapters/opencode-local/src/server/runtime-config.ts`.

### 기존 Codex·Claude 구현에서 재사용할 원칙

- Codex `server/execute.ts`는 runtime 목록과 기존 managed gateway 정보를 합친 뒤
  `server/codex-home.ts`의 `writeManagedCodexMcpConfig()`에 위임한다. 실행 오케스트레이터가
  공급자 OAuth를 직접 다루지 않고 CLI별 설정 writer에 위임하는 경계를 따른다.
- Claude `server/execute.ts`는 `writePaperclipClaudeMcpConfig()` 결과를 `--mcp-config`로 넘긴다.
  로컬 sandbox에는 해당 디렉터리 읽기 권한을 추가하고, 원격에는 기존 asset 전달 경로로 옮긴다.
  `mcpServerIdentity` 비교를 통해 세션 재개 적합성을 판단한다. OpenCode에서도 이 세 가지 증거가
  있어야 하며 단순히 호스트에 파일을 만드는 것으로 완료 처리하지 않는다.
- CLI별 config/TOML/strict flag를 그대로 복사하지 않는다. 사용자 MCP 보존 여부와 OpenCode 자체의
  권한 경계는 별도로 검증하며, Paperclip 승인 검사는 기존 gateway를 계속 거친다.

## 설계와 모듈 소유권

```text
Paperclip의 회사·실행별 권한 판정 및 게이트웨이 발급
  → AdapterExecutionContext.runtimeMcp / runtimeTools
  → 외부 opencode_local 어댑터의 실행별 MCP 설정 준비
  → OpenCode의 MCP 클라이언트
  → Paperclip 게이트웨이의 권한·승인 검사
  → Todoist 등 공급자
```

### 외부 패키지와 재사용 경계

예상 위치는 `extensions/opencode-mcp-adapter/`인 독립 패키지다. 기존 workspace에 자동 편입하거나
루트 의존성·lockfile을 바꾸지 않고 로컬 디렉터리 설치부터 검증한다. 위치와 패키지명은 구현 때 확정한다.

- 패키지 루트의 `createServerAdapter()`가 `type: "opencode_local"`을 반환한다.
- `runtimeToolDelivery: "native_mcp"`를 선언해 설정용 연결 도구도 서버의 MCP 전달 목록으로 받는다.
- 설치된 기본 OpenCode 어댑터의 공개 `./server` 및 루트 export를 우선 재사용한다.
  프로세스 실행·취소·출력·사용량·provider·skills·instructions 처리를 통째로 복제하지 않는다.
- registry의 내장 정의는 자동으로 합쳐지지 않는다. `supportsLocalAgentJwt`,
  `supportsInstructionsBundle`, `instructionsPathKey`, `requiresMaterializedRuntimeSkills`,
  `listSkills`/`syncSkills`, 모델 검색, command spec, session codec,
  `supportsToolRefreshOnResume` 등을 명시적으로 대조한다. 마지막 flag는 session-preparation에서 직접
  소비하므로 누락 상태를 단순 metadata 차이로 취급하지 않는다. CLI의 실제 갱신 증거에 따라 true,
  false 또는 config별 함수를 선언하고 갱신 가능한 경우와 fresh session이 필요한 경우를 각각 검증한다.
  `sessionManagement`의 host fallback만 별도로 확인된 동작이다.
- 기존 UI 설정 폼·CLI 출력과 같은 type을 유지한다. 외부 설치 이후 실제 폼·전사 표시의 재사용 여부를
  검증하고, UI parser export가 필요하면 기존 파서의 자체 완결 번들을 제공한다.
  불필요한 UI 또는 새 전역 registry 분기를 추가하지 않는다.
- 정확한 base adapter/adapter-utils 의존성을 고정한다. 현재 패키지 버전만으로 소스 일치를 가정하지 않고
  설치된 export·빌드 식별자와 호환성 결과를 패키지 검증 기록에 남긴다.

### 구현 전 타당성 확인: 얇은 래퍼가 가능한가

현재 base `execute()`에는 추가 launch-env를 직접 받는 공개 훅이 없다. 따라서 단순히 base execute를
호출하면 MCP가 전달된다고 가정하지 않는다. 첫 구현 단계에서 아래 후보를 가짜 인증값으로 증명한다.

1. `runtimeMcp.getServers()`의 정보를 실행별 private 저장소에 준비한다.
2. OpenCode 1.18.9가 `{file:절대경로}` 같은 설정 참조를 MCP 인증 헤더에서 실제 지원하는지 확인한다.
   `OPENCODE_CONFIG_CONTENT` 병합, OAuth 자동 인증 비활성화, 새 실행과 세션 재개를 함께 확인한다.
3. 지원된다면 래퍼는 비밀값을 담은 private 파일과, 비밀값 대신 파일 참조만 담은 MCP 설정을 만들고
   base execute에 전달한다. `config.env`에 넣는 값은 비밀이 없는 실행용 설정 참조뿐이어야 한다.
   실제 토큰·Authorization 값은 저장되는 agent config/프롬프트/sessionParams에 넣지 않는다.
4. base execute가 참조·정리·세션 수명을 보존하는 경우에만 이 방식을 채택한다.

이 가설은 아직 검증되지 않았다. 지원하지 않는 경우 전역 `process.env`를 바꾸거나 토큰을 영구 설정에
써서 우회하지 않는다. 외부 어댑터가 자체 실행 경로를 소유하는 대안과, base에 작고 공개적인 실행 훅을
추가하는 대안을 비용·호환성 기준으로 비교해 이 계획을 수정한다. 본체 수정 없는 방식을 보장할 수 없는
결과가 나오면 구현 범위 변경으로 명시하고 결정받는다. 800줄 execute 복제는 기본 해법으로 삼지 않는다.

### MCP 설정 준비 계약

| 구성요소 | 입력 | 출력·소유 책임 |
|---|---|---|
| 외부 factory | 호환되는 base 공개 exports | 완전한 ServerAdapterModule 및 명시적 capabilities |
| MCP 설정 준비 | 서버가 준 MCP 목록, 비밀 없는 기존 OpenCode 설정, 실행 ID | 실행 전용 설정 참조, private 인증 자료, cleanup |
| execute 래퍼 | AdapterExecutionContext | base 실행 결과와 비밀 없는 세션 식별 정보 |
| session codec | 기존 세션 정보와 전달 버전 | 원래 필드 보존 및 MCP 구성 식별 정보 직렬화 |
| 환경 진단 | CLI 버전·export·설정 기능 | pass/warn/fail과 비밀 없는 진단; 진단 자체로 인증 성공 주장 금지 |

- 대상은 Paperclip이 발급한 게이트웨이 URL과 실행별 토큰이다. 공급자 OAuth 토큰을 추출하거나
  `ai.todoist.net/mcp`를 별도 등록·재인증하지 않는다. connection/grant/권한 row를 직접 수정하지 않는다.
- connectionId 기반으로 결정적인 server key를 만든다. 동일 display name의 서로 다른 연결을 구분한다.
  사용자 설정과 key가 충돌하면 임의 덮어쓰기 없이 명시적으로 실패한다.
- 기존 사용자 MCP·provider 설정을 보존한다. JSONC·inline 설정·환경변수 설정의 우선순위와 malformed 입력을
  실제 OpenCode 동작으로 확인한다. 유효하지 않은 설정을 빈 객체로 취급해 조용히 덮어쓰지 않는다.
- 인증 파일은 0700 실행 디렉터리와 0600 파일로 준비하며 동시 실행은 경로를 공유하지 않는다.
  raw token을 argv, 로그, 진단, 오류, Git, artifact 또는 session codec 출력에 남기지 않는다.
- 제한된 로컬 sandbox에서도 private 파일 참조가 읽히는지 확인한다. 허용 경로에 넣는 공개 전달 수단이
  없다면 해당 실행 모드를 지원한다고 선언하지 않으며 filesystem scope를 몰래 넓히지 않는다.
- 새 실행에서는 현재 목록·토큰을 다시 받아 이전 인증 자료를 재사용하지 않는다.
  token과 임시 경로를 제외한 MCP identity/delivery version을 세션에 기록한다.
  실제 CLI가 재개 시 설정을 다시 읽는지 검증하고, 연결 추가·삭제·권한 회수 후 오래된 도구가 남는지 확인한다.
  새 세션이 필요한 경우 기존 session history는 보존하고 기존 handoff 경로를 사용한다.
- cleanup은 OpenCode 및 해당 MCP 요청의 종료가 확인된 뒤 수행한다. 취소·startup 실패에서도 정리하고,
  서버 연결 자체를 영구 삭제하지 않는다. 프로세스 비정상 종료 잔여물의 처리도 수명 기준으로 검증한다.

### 로컬·원격 지원 범위

첫 수직 검증은 현재 장애가 발생한 self-hosted 로컬 실행이다. 호스트 파일 참조를 원격 실행에 전달하면
안 된다. 원격/샌드박스 지원은 기존 execution-target asset 전달·정리 경로로 검증된 경우에만 선언한다.
초기 패키지가 원격을 지원하지 않으면 실행 전에 구조화된 오류로 거부한다. 기존 내장 OpenCode의 원격
기능을 전체 교체로 손상시키지 않도록 운영 설치 전에 해당 인스턴스의 모든 OpenCode 실행 대상을 조사한다.

## 구현 단계와 완료 증거

1. **계약 확인과 실패 재현**: host/base/OpenCode 버전과 설치·rollback 경로를 고정한다. 가짜 MCP 서버로
   기존 OpenCode에서 tools/list가 도달하지 않는 것을 관측하고, server-side Test와 에이전트 실행을 구분한다.
   가짜 토큰·읽기 도구만 사용한다. OpenCode V2 문법을 1.18.9에 적용하지 않는다.
2. **래퍼 타당성 확인**: 위 private 파일 참조 후보가 실제 CLI에 적용되는지 관측한다. 이 단계의 결과로
   본체 무변경 여부와 구현량을 확정한다. 기능이 없는 훅을 계획상 존재하는 것으로 취급하지 않는다.
3. **패키지 구현**: factory와 capabilities, MCP 병합, credential 수명, session codec, 환경 진단과 README를
   구현한다. 검증 가능한 local-path 설치 패키지를 만든다. 설치자와 로더가 수락하는 실제 exports를 확인한다.
4. **독립 리뷰와 좁은 검증**: 아래 회귀·권한·동시성 시나리오를 실행한다. Codex/Claude는 재사용 근거로
   대조하며 변경하지 않는다. 실패 기록은 최종 결과에 남기고 setup 오류를 회귀 실패로 주장하지 않는다.
5. **격리 인스턴스 수직 검증**: 실제 Paperclip 발급 → 외부 로더 → OpenCode → gateway → fixture 호출을
   수행한다. transcript뿐 아니라 provider request receipt, invocation status와 사용자 결과를 대조한다.
6. **운영 적용은 별도 승인**: 패키지·영향 대상·호환성·롤백을 검토 가능한 상태로 만든 뒤 설치한다.
   현재 회사별 권한을 유지하며 기존 실행을 중단하거나 새 실행을 무단 생성하지 않는다.

## 인수 시나리오와 검증 범위

| 시나리오 | 반드시 확인할 결과 |
|---|---|
| 정상 연결 | OpenCode에 실제 읽기 도구가 노출되고 호출 성공; 새 OAuth draft 생성 없음 |
| 다른 회사·다른 에이전트 | host가 전달하지 않은 연결을 자체 검색·노출하지 않음; gateway 거부 유지 |
| Off / Ask first | task-bound 실제 gateway 승인 카드로 처리; approve-and-run 결과를 재개 시 소비하고 같은 호출을 중복 실행하지 않음; 자동 승인·정책 변경 없음 |
| 인증 만료·접근 회수 | 서버의 실제 오류 유지; 무인증 provider 직접 호출로 우회하지 않음 |
| 동시 실행·새 토큰 | 실행별 자료 격리; 토큰 변경 후 이전 파일·값 재사용 없음 |
| 세션 재개·도구 제거 | 현재 설정 반영; 과거 MCP endpoint/token/도구가 실행 권한을 유지하지 않음 |
| 기존 사용자 설정·MCP 없음 | 기존 provider, skills, instructions, 출력·usage·세션 기능 유지 |
| 취소·시작 실패 | 기존 취소·timeout 계약 유지, 종료 후 비밀 자료 정리, 비밀 로그 없음 |
| 설치·대체·복원 | 동일 type의 실제 factory로 로드, capability parity 및 서버 재시작 후 effective external 구현 확인, 내장 fallback 복원 가능 |
| 원격 대상 | 지원 검증 또는 실행 전 명확한 거부; 호스트 경로·token 유출이나 silent 무도구 실행 없음 |

Ask-first 검증은 UI Test만으로 대체하지 않는다. 격리 인스턴스의 task-bound 가짜 쓰기 도구에 invocation
counter를 두어 승인 후 서버의 approve-and-run 1회와 에이전트 재개 후 추가 호출 0회를 확인한다.
거절·재개 및 취소 시에도 추가 외부 호출이 없어야 하며 결과가 불명확한 호출을 재시도로 중복 실행하지 않는다.

계획 단계에서는 테스트를 실행하지 않는다. 구현 단계에서는 패키지 단위 테스트·typecheck·build와
실제 CLI/격리 Paperclip 수직 검증부터 한다. 기존 로더·registry·공유 코드를 바꾸는 대안이 선택되면
해당 회귀와 영향 맵을 갱신한다. PR-ready handoff 전 저장소 규정의 전체 검증을 수행하거나 미실행 이유를
보고한다. fixture 통과와 실제 Todoist/OpenCode E2E 통과는 구분한다.

독립 패키지에는 `test`, `typecheck`, `build` 스크립트를 제공하고 예를 들어
`pnpm --dir extensions/opencode-mcp-adapter test`, `pnpm --dir extensions/opencode-mcp-adapter typecheck`,
`pnpm --dir extensions/opencode-mcp-adapter build`, `npm pack --dry-run`을 해당 패키지 범위에서 수행한다.
패키지가 root workspace glob 밖에 있으므로 `pnpm -r typecheck`만으로 패키지 검증을 대체하지 않는다.

## 운영 적용과 롤백

- 현재 host와 같은 self-hosted 환경에서 instance-admin의 기존 어댑터 설치 API/UI를 사용한다.
  문서의 예시 포트·HOME를 복사하지 않고 실제 인스턴스의 주소와 저장소 경로를 사용한다.
- 운영 토큰을 패키지에 넣지 않는다. 기존 인증·grant·agent adapterConfig와 설치 레코드는 private하게
  백업하고, 리뷰 가능한 패키지에는 코드·설명·가짜 fixture만 포함한다.
- 기존 `opencode_local` 대체는 모든 회사의 해당 타입 신규 실행에 영향을 준다. 먼저 격리 인스턴스에서
  검증하고 운영 적용 시 영향 목록과 중단 필요성을 명시한다. 실행 중 프로세스의 교체는 성공으로 세지 않는다.
- `plugin-loader.loadFromRecord()`는 import/factory 실패를 기록한 뒤 null을 반환한다. 서버 재시작 때는
  내장 어댑터가 먼저 등록되므로 외부 패키지가 실패하면 내장 구현이 남을 수 있다. 설치 레코드나 type
  이름만으로 활성화 성공을 판단하지 않는다. `routes/adapters.ts`의 `buildAdapterInfo().source`도 설치
  레코드를 기준으로 하므로 `source: external` 응답만으로 검증을 끝내지 않는다. 외부 factory의
  환경 진단에 비밀 없는 build/delivery-version check를 넣고, 운영 반영과 이후 서버 재시작 절차에서
  실제 선택된 factory의 해당 check 및 가짜 MCP 관측을 확인한 뒤 대상 작업을 허용한다.
  실패 주입(누락 dependency/import 예외/유효하지 않은 factory) 후 이 차이를 검출하는 절차도 검증한다.
  독립 패키지는 host의 loader 실패를 가로챌 수 없으므로, 자동 fail-closed 운영이 필요해 별도 startup
  guard가 요구되면 그 추가 범위를 명시하며 본체 무변경으로 해결했다고 주장하지 않는다.
- override pause/resume 또는 제거를 통한 내장 fallback 복원을 실제 설치된 경로로 검증한다.
  새 session codec 필드가 내장에서 무시돼도 원래 sessionId/cwd 등은 손상되지 않아야 한다.
- 코드 rollback은 Todoist OAuth 인증이나 서버 권한을 삭제하지 않는다. 복구된 내장 어댑터에서는 이번
  MCP 전달 기능이 다시 없어진다는 제한을 명시한다.

## 변경 규모와 범위 결정

이전 6~8파일/300~600줄 추산은 내장 어댑터 보완 기준이었다. 외부 패키지 방식은 별도 패키징·factory·
호환성·설치 검증이 추가된다. 얇은 래퍼 후보가 성립하면 약 8~12파일/450~900줄(테스트·README 포함)을
초기 추산으로 삼는다. 타당성 확인 후 실측 범위를 갱신하며, 자체 execute가 필요하면 이전 추산을 재사용하지 않는다.
새 DB schema/migration, UI 디자인 변경, 공급자별 커넥터 재작성은 현재 범위에 없다.

## Current state

- Completed: 외부 패키지 구현, private 파일 참조 타당성, 로컬 base execute와 실제 CLI 호출·세션 검증,
  타입 검사·빌드·패키지 구성 및 실제 host loader 확인, 독립 코드 리뷰와 지적 반영을 완료했다.
- Remaining: 운영 설치 전 격리 Paperclip 인스턴스의 task-bound 승인·회사 경계 E2E, cold restart/fallback,
  설치·롤백과 실제 Todoist 인수 검증. SIGKILL 잔여 인증 파일의 자동 회수는 미구현이다.
- Next concrete action: 운영 적용을 진행할 때 격리 self-hosted 인스턴스에 이 패키지를 설치해 승인·권한·재시작·롤백 경로를 검증한다.

## 리뷰 기록

`review_opencode_mcp_plan`이 문서와 실제 loader/registry/adapter/runtime 경계를 읽기 전용으로 검토했다.
1차 판단은 서버가 권한·인증을 소유하는 외부 어댑터 설계가 구조에 맞고, 래퍼 후보는 검증 gate로
유지해야 한다는 것이다. 리뷰에서 제시한 세 가지 P2 사항을 반영했다.

1. 설치 레코드와 실제 활성 구현 구분: cold restart 및 import/factory 실패 주입, factory build 진단과
   fixture 호출을 인수 기준에 추가했다. API의 source 표시는 설치 레코드 기반이라는 점도 보완했다.
2. 도구 갱신 capability: `supportsToolRefreshOnResume`의 실제 소비 경로를 명시하고 CLI 검증 결과에
   맞춰 선언하며 fresh/resume 양쪽을 검증하도록 수정했다.
3. Ask-first: task-bound 승인·거절·취소와 invocation counter를 통해 approve-and-run 중복 실행을
   검증하고 UI Test 성공과 구분하도록 수정했다.

수정본 재리뷰에서 세 가지 지적 모두 해결됐고 추가 material finding은 없다는 판단을 받았다.
리뷰 범위는 계획과 소스 경계의 대조이며 제품 테스트·실제 플러그인 실행 증거는 아니다.
`{file:...}` 래퍼, CLI 호환성, sandbox/원격 가시성은 여전히 후속 검증사항이다.

문서 검증: 변경 범위는 이 계획문서 하나이며 whitespace/frontmatter/종료 newline을 확인했다.
제품 코드·설정은 수정하지 않았고 제품 테스트·설치·배포·커밋·푸시는 수행하지 않았다.

## 구현 진행 기록

- 실제 CLI 1.18.9의 `debug config`를 격리 HOME와 가짜 토큰으로 실행했다. MCP 헤더의 private 파일 참조가 해석되고 oauth:false/disabled MCP 설정이 유지되는 것을 확인했다. 실제 자격증명이나 공급자 호출은 사용하지 않았다.
- 외부 래퍼 방식으로 진행하며 초기 지원은 로컬 실행이다.

### 구현 내용과 실제 검증

- `extensions/opencode-mcp-adapter/`에 독립 패키지 `@gabrielwithappy/paperclip-opencode-mcp-adapter` 0.1.0을 구현했다.
  실제 peer는 host built exports 0.3.1이며, 로컬 development shim과 tsx로 source-checkout dependencies를 해석했다.
  본체·기존 어댑터·DB schema·권한 정책 코드는 변경하지 않았다. 영향 맵에는 선택적 local adapter 범위만 추가했다.
- `runtimeToolDelivery: native_mcp`, 기존 base executor/skills/models/UI/CLI 재사용,
  private sidecar 파일 참조 주입, 충돌·malformed config 거부, 토큰 로그/결과 redaction을 구현했다.
- 실제 CLI에서 인증된 initialize/tools/list와 local OpenAI-compatible model fixture를 통한 tools/call을 관측했다.
  동일 세션에서 토큰 교체 후 새 인증으로 추가 호출 성공, 연결 제거 후 fresh session 전환과 추가 호출 0회를 확인했다.
  이는 실제 CLI/base executor 수준 증거이며 Paperclip task authorization E2E 또는 live Todoist 증거가 아니다.
- 구성 identity는 token/private path를 제외한다. explicit refresh는 보수적으로 fresh session을 사용한다.
  로컬 sandbox scope와 remote target은 MCP 실행과 환경 검사에서 명시적으로 거부한다.
- 실제 `loadExternalAdapterPackage()`에서 factory와 자체 완결 UI parser를 로드했다.
  이 검사는 별도 프로세스 내 loader 검증이며 운영 plugin store/현재 agent 설정은 변경하지 않았다.
- 패키지 typecheck/build 및 protocol/base/CLI tests를 실행했다. npm pack dry-run은 dist·metadata·README만 포함하고
  credential/source-checkout node_modules는 포함하지 않는 것을 확인했다. 전체 repo typecheck/test/build는 본체 무변경의
  독립 패키지 범위라 실행하지 않았으며 PR-ready 또는 운영 적용 완료로 주장하지 않는다.
- 초기 타입 검사에서는 독립 패키지 Node typings 링크 누락으로 실패해 development shim을 보완했다.
  최초 테스트 파일 쓰기에서 cwd를 잘못 지정해 테스트 0개로 종료한 결과는 성공 증거로 사용하지 않았다.
  추가 remote fixture의 첫 시도는 `username` 대신 `user`를 사용한 잘못된 SSH spec으로 실패했다.
  fixture를 실제 계약에 맞게 수정하고, malformed remote 선언도 local로 흘리지 않도록 guard를 보완했다.
  이 setup 실패들은 제품 regression red-green 증거로 계산하지 않는다.
- `review_opencode_mcp_plan` 코드 리뷰에서 unsupported target의 testEnvironment가 base probe 후 pass가 될 수 있다는
  P2를 확인했다. base/CLI probe 이전 structured fail과 회귀 테스트로 수정했다. 재리뷰 추가 material defect 없음.
- finally cleanup만 지원한다. host SIGKILL/crash/power loss 이후 private `/tmp` 파일은 남을 수 있다.
  README에 종료된 프로세스를 확인한 뒤 수동 정리하도록 명시했다. age-only background sweeper는 추가하지 않았다.
  이 제한과 미지원 remote, strict CLI version, 인스턴스 전체 override 범위를 설치 전에 확인해야 한다.

최종 로컬 검증: `npm run typecheck`, `npm run build`, `npm test` (12 passed/0 failed),
`npm pack --dry-run --json`, 실제 host loader 호출, `node scripts/check-maps.mjs`,
`git diff --check` 및 새 패키지 whitespace 검사 통과. 운영 인스턴스는 변경하지 않았다.
