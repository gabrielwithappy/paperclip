# 전체 에이전트 지시문(AGENTS.md) 개정 계획: GWS 스킬 및 커넥터 도구 사용 표준화

- **일자:** 2026-11-21
- **목적:** 에이전트가 로컬 GWS(Google Workspace) 스킬을 웹 OAuth 커넥터로 오인해 연결 카드를 남발하거나, 이미 연결된 외부 커넥터(Todoist 등)를 미연결 상태로 오판해 재인증을 반복 요청하는 문제를 원천 방지하기 위해 전체 에이전트 지시문을 개정한다.
- **상태:** 적용 완료 (7개 활성 에이전트 반영 완료)

---

## 1. 배경 및 문제 정의

1. **GWS(구글 캘린더, 드라이브 등) 스킬과 웹 커넥터 혼동**
   - 호스트 환경에 `gws` CLI 인증(`gabrielwithhappy@gmail.com`)이 완료되어 있고 에이전트에게 관련 스킬(`gws-calendar`, `gws-drive` 등)이 할당되어 있음에도, 에이전트가 `connections_search` 및 `connection_request`를 실행하여 Paperclip 웹 OAuth 카드를 신규 생성하고 사용자에게 인증 링크를 전달하는 혼선이 발생함.
   - 사용자는 "스킬용 링크가 아니다"라고 피드백하였으나, 에이전트는 계속 웹 커넥터 기준으로 판단함.

2. **외부 커넥터(Todoist 등) 상태 오판 및 중복 연결 카드 생성**
   - 사용자가 이미 Todoist 커넥터를 연결해 활성(`status: active`, `enabled: true`) 상태임에도, 시스템 내에 미완료된 draft 연결이 존재하거나 어댑터 도구 주입 지연이 있을 때 `connections_search` 결과의 `needs_user_action`만 보고 재인증을 요구함.
   - 공급자 엔드포인트(`https://ai.todoist.net/mcp`)로 무인증 직접 호출 후 401 Unauthorized를 받아 "사용자 미인증"으로 잘못 단정하는 사례 발생.

---

## 2. 적용 대상 에이전트

회사(`0087aede-0d1d-4bdc-ae9a-9e9c70ac2428`) 내 활성 에이전트 7개 전체:

| 에이전트 ID | 이름 | 역할 | 어댑터 | 지시문 파일 경로 |
|---|---|---|---|---|
| `ec225d49-a06a-4250-9235-8cd925d8a3bd` | 엘리스(VP) | VP (총괄) | opencode_local | `/home/gabriel/.local/share/paperclip-devel/instances/default/companies/0087aede-0d1d-4bdc-ae9a-9e9c70ac2428/agents/ec225d49-a06a-4250-9235-8cd925d8a3bd/instructions/AGENTS.md` |
| `ece599ad-f31b-4558-938e-c7b5fc50b37e` | 하루(Secretary) | 개인비서 | opencode_local | `/home/gabriel/.local/share/paperclip-devel/instances/default/companies/0087aede-0d1d-4bdc-ae9a-9e9c70ac2428/agents/ece599ad-f31b-4558-938e-c7b5fc50b37e/instructions/AGENTS.md` |
| `acb233bd-2e09-4c54-92f5-2552ba91c792` | 피오(PO) | Product Owner | opencode_local | `/home/gabriel/.local/share/paperclip-devel/instances/default/companies/0087aede-0d1d-4bdc-ae9a-9e9c70ac2428/agents/acb233bd-2e09-4c54-92f5-2552ba91c792/instructions/AGENTS.md` |
| `47ef59ef-2097-493a-be9c-c38fbf46fc1b` | 소피(SW Engineer) | SW Engineer | opencode_local | `/home/gabriel/.local/share/paperclip-devel/instances/default/companies/0087aede-0d1d-4bdc-ae9a-9e9c70ac2428/agents/47ef59ef-2097-493a-be9c-c38fbf46fc1b/instructions/AGENTS.md` |
| `b32f859d-03a0-4ac7-9009-38163faac323` | 자인(UI/UX디자이너) | Designer | opencode_local | `/home/gabriel/.local/share/paperclip-devel/instances/default/companies/0087aede-0d1d-4bdc-ae9a-9e9c70ac2428/agents/b32f859d-03a0-4ac7-9009-38163faac323/instructions/AGENTS.md` |
| `eb08efa1-4dbd-40bf-ac49-4b5f58ad217d` | Content-Studio | 컨텐츠 스튜디오 | opencode_local | `/home/gabriel/.local/share/paperclip-devel/instances/default/companies/0087aede-0d1d-4bdc-ae9a-9e9c70ac2428/agents/eb08efa1-4dbd-40bf-ac49-4b5f58ad217d/instructions/AGENTS.md` |
| `4ae73c01-1181-41ac-9b13-14b4fa49da7d` | 엘리스(VP)-Codex | VP (보조) | codex_local | `/home/gabriel/.local/share/paperclip-devel/instances/default/companies/0087aede-0d1d-4bdc-ae9a-9e9c70ac2428/agents/4ae73c01-1181-41ac-9b13-14b4fa49da7d/instructions/AGENTS.md` |

---

## 3. 공통 지시문 표준 개정 내용 (독립 리뷰 반영본)

각 에이전트의 `AGENTS.md`에 다음 표준 지침을 반영한다:

```markdown
## 외부 도구 연동 및 Google Workspace 사용 원칙

### 1. Google Workspace (GWS) 스킬 및 CLI 사용
- **로컬 스킬 및 CLI 우선 원칙:** Google Workspace 관련 서비스(Google Calendar, Gmail, Google Drive, Google Docs, Google Sheets, Google Tasks) 작업 시, 이미 호스트 환경에 인증 완료된 `gws` CLI 및 할당된 스킬(`gws-calendar`, `gws-gmail`, `gws-drive`, `gws-docs`, `gws-sheets`)을 우선 직접 호출한다.
- **임의 웹 커넥터 카드 생성 금지:** 사용자가 명시적으로 신규 Paperclip 웹 OAuth 연동을 요청하지 않는 한, `connections_search` 또는 `connection_request`를 통해 웹 연결 카드를 생성하거나 사용자에게 웹 링크를 요구하지 않는다.
- **인증 상태 확인 및 만료 시 대응:**
  - GWS 인증 상태는 `gws auth status` 명령어로 확인한다.
  - 만약 인증이 만료되었거나 필요한 경우, 웹 커넥터를 생성하지 말고 사용자에게 `"호스트 터미널에서 'gws auth login'을 실행해 주세요"`라고 명확한 복구 가이드를 제공한다.
- **파괴적 작업 안전 경계:** Gmail 대량 발송, 구글 드라이브 파일/폴더 삭제, 캘린더 일정 삭제 등 부작용이 발생하는 작업은 실행 전 파라미터와 대상 정보를 사용자에게 요약 보고하고 확인을 받는다.

### 2. 외부 커넥터(Todoist 등) 상태 판정 및 도구 접근
- **도구 확인 3단계 원칙 (Decision Flow):**
  1. **주입된 도구 확인:** 먼저 현재 에이전트 세션에 해당 서비스 도구(예: `todoist_*`)가 로드되어 있는지 확인하고 사용한다.
  2. **기존 활성 커넥터 확인:** 도구가 보이지 않는 경우 `connections_search`로 기존 연결을 확인하되, `status === 'active'` 레코드가 하나라도 존재하면 인증이 정상 완료된 것으로 본다 (draft 레코드나 검색 상의 `needs_user_action` 플래그로 인해 미인증으로 오판하지 않는다).
  3. **도구 주입 문제 분리:** 활성 커넥터가 있음에도 도구가 제공되지 않는다면 재인증을 요구하거나 새 카드를 만들지 말고, "Paperclip 서버의 도구 주입/어댑터 동기화 지연"으로 원인을 분리해 보고한다.
- **공급자 무인증 직접 호출 금지:** 공급자 MCP URL(예: `https://ai.todoist.net/mcp`)로 인증 헤더 없이 직접 HTTP 요청을 보내 발생한 401 오류를 사용자 미인증의 근거로 사용하지 않는다.
- **중복 연결 카드 생성 금지:** 동일 공급자에 대해 이미 연결 시도 또는 활성 연결이 존재하는 경우, 사용자의 명시적 재요청이 없는 한 추가 `connection_request`를 생성하지 않는다.
```

---

## 4. 실행 및 검증 절차

1. **독립 리뷰어(principle-reviewer) 검토:** 완료 (조건부 승인 및 피드백 반영 완료)
2. **사용자 확인 및 승인:** 개정안 내용 확인
3. **지시문 파일 일괄 반영 (`AGENTS.md`):** 대상 7개 에이전트 파일에 해당 섹션 추가/갱신
4. **반영 검증:** 각 파일의 diff 및 내용 무결성 확인
