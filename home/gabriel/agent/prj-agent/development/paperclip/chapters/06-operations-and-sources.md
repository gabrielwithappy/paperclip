# 6장. 운영 점검과 근거 자료

## 운영자가 확인할 순서

1. 저장된 연결의 회사, 활성 상태와 인증 상태를 확인한다.
2. 대상 에이전트의 접근 권한과 작업별 정책을 확인한다.
3. 에이전트가 현재 상태를 새로 조회했는지 실행 기록으로 확인한다.
4. 연결 설정 도구와 실제 앱 도구의 목록을 나눠 확인한다.
5. 인증된 Paperclip 게이트웨이 호출과 외부 공급자 직접 요청을 구분한다.
6. CLI 버전, 실제 선택된 어댑터 구현과 MCP 설정 적용을 확인한다.
7. 변경 후 서버 테스트와 실제 에이전트 작업을 각각 검증한다.

## 에이전트 공통 지침

공통 연결 지침은 `packages/shared/src/connection-intent-guidance.ts`에 문자열로 정의돼 있다.
기본 프롬프트와 런타임 안내에 포함되고 `skills/paperclip/SKILL.md`에도 운영 절차가 있다.
그러나 재개 시 기본 프롬프트가 생략되는 경로와 사용자 지정 프롬프트가 있으므로 전달 여부를 확인해야 한다.

지침에는 최신 상태 재조회, 실제 호출 오류를 근거로 한 인증 요청, 기존 연결 재사용을 명확히 포함해야 한다.
다만 지침을 강화해도 어댑터의 MCP 등록 코드 누락은 해결되지 않는다.
서버 응답에서 인증 필요와 권한 부족이 혼동되는 상태 판정 역시 별도 개선 대상으로 관리한다.

## 조사 근거와 기준 시점

조사 기준은 2026년 11월 14일, 저장소 커밋 `611a8547ea`와 호스트 OpenCode `1.18.9`다.
이후 코드나 CLI가 변경되면 같은 결과라고 가정하지 않는다.

저장소에서 다시 확인할 파일은 다음과 같다.

- `packages/adapter-utils/src/types.ts`: runtimeMcp, runtimeTools, 외부 어댑터 계약.
- `server/src/services/heartbeat/runtime-execution.ts`: 실행별 MCP 전달.
- `packages/adapters/opencode-local/src/server/execute.ts`: OpenCode 실행 경로.
- `packages/adapters/opencode-local/src/server/runtime-config.ts`: 설정 병합과 수명.
- `packages/adapters/codex-local/src/server/execute.ts`: 기존 MCP 전달 구현 비교.
- `packages/adapters/claude-local/src/server/execute.ts`: MCP 설정·sandbox·세션 비교.
- `server/src/adapters/plugin-loader.ts`: 외부 factory 로드와 실패 처리.
- `server/src/adapters/registry.ts`: 같은 type 대체와 fallback.
- `docs/adapters/external-adapters.md`: 외부 어댑터 설치·배포.
- `doc/plans/2026-11-14-opencode-mcp-external-adapter.md`: 독립 리뷰를 반영한 구현 전 계획.

외부 공식 자료는 다음과 같다. 문서의 버전과 설치된 CLI 버전을 대조한다.

- [OpenCode MCP 서버](https://opencode.ai/docs/mcp-servers)
- [OpenCode 플러그인](https://opencode.ai/docs/plugins)
- [Google OAuth 클라이언트와 secret 관리](https://support.google.com/cloud/answer/15549257?hl=en)
- [Google Drive 암호화](https://support.google.com/drive/answer/10519333?hl=en)
- [Google Drive 파일 승인과 잠금](https://support.google.com/drive/answer/9387535?hl=en)

## 아직 완료되지 않은 일

외부 어댑터 패키지 구현·설치, private 파일 참조 래퍼 검증, 실제 OpenCode에서의 Todoist E2E는 미완료다.
이 전자책은 조사와 계획의 기록이며, 실행 가능한 플러그인이나 검증 완료 보고서가 아니다.
