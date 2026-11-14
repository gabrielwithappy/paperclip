---
status: draft
priority: normal
updated: 2026-11-14T08:31:10+09:00
authorization: Plan under review
reviewed_by: []
---

# Paperclip 스킬과 관리 방식의 AgentOS 적용 계획

## Outcome and scope

Paperclip이 보유한 스킬과 배포·설치·갱신 방식을 조사하고, AgentOS에 가져올 수 있는 스킬과 관리 개선안을 제안한다. 권장 방향은 **AgentOS의 로컬·문서 기반 구조를 유지하면서 검증 스킬, 출처 기록, 변경 감지 기능을 보강하는 것**이다.

이번 결과물은 조사와 계획문서다. 스킬 복사, AgentOS 설치기 수정, 설치 상태 갱신, 커밋·푸시·PR 생성은 수행하지 않는다. 후속 구현은 별도의 구현 요청을 받은 뒤 진행한다.

### 조사 기준과 한계

- 조사일: 2026-11-14, KST.
- Paperclip: 현재 작업 디렉터리, HEAD `29929f3d2c`. 미커밋 변경이 존재하므로 HEAD만으로 현재 내용을 재현할 수 있다고 보지 않는다.
- AgentOS 원본: `/home/gabriel/agent/prj-agent/agentos-workspace/agentos-private`, HEAD `ce05660`. 읽기 전용으로 조사했다. 이하 `AgentOS 원본`은 이 로컬 체크아웃을 뜻하며 공개 최신 배포판과 동일하다는 주장은 하지 않는다.
- 설치된 AgentOS: 이 Paperclip 저장소의 `.agentos/catalog.json`, `.agentos/skills.json`, `.agentos/project/project.md`.
- 확인 범위는 파일·소스·문서다. 실행 중인 회사의 DB, 에이전트별 할당, 실제 스킬 호출 빈도, 운영 성과는 확인하지 않았다. 아래 수치는 보유·등록 현황이지 실제 사용량이 아니다.
- 기존 코드 변경과 `doc/plans/done/` 이동 작업은 이번 조사 범위 밖이다.

## Approach

1. 스킬을 개발용·운영용·앱 배포용으로 나누고 소유권과 관리 경로를 확인한다.
2. AgentOS에 이미 있는 기능과 비교하여 재사용·보강·보류 후보를 정한다.
3. 설치기의 기존 안전장치를 유지하는 최소 관리 계약과 단계별 적용·검증 방법을 정의한다.

## 1. Paperclip 스킬 구성

| 계층 | 확인한 위치·규모 | 목적과 소유권 | AgentOS 관점 |
| --- | --- | --- | --- |
| 저장소 개발 스킬 | `.agents/skills/`의 `SKILL.md` 42개 | Paperclip 개발·검증·릴리스 절차. AgentOS 설치 스킬도 같은 경로에 공존 | 범용 절차를 추려 선택 도입 |
| 실행 에이전트 운영 스킬 | `skills/`의 `SKILL.md` 9개 | 회사·이슈·에이전트·메모리·채널 작업 | Paperclip API 의존 부분은 선택 통합으로 격리 |
| 앱 배포 카탈로그 | `packages/skills-catalog/catalog/` | 회사가 발견하고 설치하는 앱 배포 자산 | 메타데이터와 배포 검증 방식 참고 |
| 고정 운영 스킬 릴리스 | `skills-releases/paperclip/v0`, `v7-roster` | 실행 환경에 전달할 별도 릴리스 트리 | 일반 카탈로그나 최신 편집본과 구분 |
| 플러그인·팀·외부 어시스턴트 번들 | `packages/plugins/`, `packages/teams-catalog/`, `integrations/assistant-plugins/` | 특정 플러그인·팀·호스트용 스킬 | 대상 통합을 채택할 때만 검토 |

카탈로그에는 로컬 `SKILL.md` 16개와 외부 고정 참조 `catalog-ref.json` 1개가 있다. 생성된 manifest 기준 총 17개이며 `bundled` 10개, `optional` 7개다. `bundled` 분류와 `defaultInstall`은 별개다. 전체 회사나 모든 에이전트에 자동 활성화된다는 뜻으로 해석하지 않는다.

### 개발 스킬 42개의 역할별 목록

| 역할 | 스킬 |
| --- | --- |
| AgentOS 공통 기반 | `harness/guidance`, `harness/writing-plans`, `graphify`, `project-document-bootstrap` |
| PR·테스트·문서 | `check-pr`, `prepare-paperclip-pr`, `prcheckloop`, `pr-gardening`, `pr-report`, `test-audit`, `doc-maintenance` |
| 검증·평가·스토리북 | `create-verification-skill`, `maintain-verification-skill`, `verify-paperclip`, `paperclip-evals`, `add-runner-eval`, `add-product-e2e-eval`, `review-storybook`, `maintain-storybook`, `directions-lab`, `terminal-bench-loop` |
| 장애·실행환경 | `fix-failed-paperclip-run`, `diagnose-why-work-stopped`, `fix-slow-queries`, `honeycomb-tracing`, `paperclip-dev-workspace-run-verify-fix`, `cloudflare-one` |
| 제품 확장·운영 | `company-creator`, `create-case`, `create-agent-adapter`, `create-runner-adapter`, `create-external-bot-integration`, `create-issue-interaction-ui`, `create-paperclip-bundled-skill`, `paperclip-create-plugin`, `setup-code-maintenance-bot`, `garden-inbox`, `paperclip-page` |
| 릴리스·보안 | `release`, `release-changelog`, `release-changelog-discord-message`, `deal-with-security-advisory` |

운영 스킬 9개는 `paperclip`, `paperclip-board`, `paperclip-create-agent`, `paperclip-converting-plans-to-tasks`, `para-memory-files`, `agentmail`, `slack`, `suggestion-box`, `complain`이다. 이 중 메모리 정리 원칙은 이식성이 높지만, 운영 API와 채널을 사용하는 절차는 별도 도구·인증·권한을 요구한다.

### 앱 카탈로그 목록

- `bundled`: `doc-maintenance`, `issue-triage`, `reflection-coach`, `status-card-query`, `summarize-status`, `task-planning`, `paperclip-capsules`, `wireframe`, `qa-acceptance`, `github-pr-workflow`.
- `optional`: `agent-browser`, `release-announcement`, `simplified-english`, `ramp`, `design-critique`, `prepare-mcp-integration`, `last30days`.
- 동일한 이름이 개발 스킬과 앱 카탈로그에 존재할 수 있다. 예를 들어 두 `doc-maintenance`는 대상과 본문이 다르다. 이름만으로 같은 패키지라고 판단하지 않는다.

## 2. Paperclip의 관리 방식

### 2.1 작성과 배포

개발 스킬은 저장소 파일로 관리하고, 앱 카탈로그는 `packages/skills-catalog` 패키지의 manifest로 배포한다. `SKILL.md`를 짧은 진입점으로 두고 상세 절차·스크립트·템플릿·예제를 `references/`, `scripts/`, `assets/`, `examples/`에 분리하는 패턴을 사용한다.

카탈로그는 `id`, `key`, `slug`, 분류, 역할 추천, 의존 도구, 파일 목록, 파일별 SHA-256, `contentHash`를 가진다. 외부 참조는 원본 저장소·경로·40자리 commit을 기록한다. 예시 `last30days`는 태그와 정확한 commit, 포함 파일 목록을 함께 선언한다.

파일 구성에서 `markdown_only`, `assets`, `scripts_executables`를 도출한다. 이는 실행 권한이나 안전성 보증이 아니다. Markdown 본문에도 파괴적 명령과 외부 전송 지시가 들어갈 수 있으므로 내용 검토가 별도로 필요하다.

작성 절차의 유용한 원칙은 다음과 같다.

1. 새로 만들기 전에 기존 스킬을 찾는다(`FIND before MAKE`).
2. 재사용·수정본·신규 작성 중 하나를 명시하고 출처와 라이선스를 남긴다.
3. 입력 → 적용 절차 → 기대 결과를 보여주는 예제를 포함한다.
4. manifest를 생성하고 메타데이터·파일 해시·중복 이름·출하 목록을 검증한다.

### 2.2 발견, 설치, 할당, 실행의 분리

Paperclip의 흐름은 `배포 카탈로그/외부 소스 → 회사 라이브러리 → 에이전트 할당 → 실행 시 전달`이다. 라이브러리에 설치하는 것과 `desiredSkills`로 에이전트에 붙이는 것은 별도 작업이다. 동기화 API는 `add`, `remove`, `replace`를 구분한다.

런타임용 라이브러리 안내도 `enabled`, `installed, not enabled for you`, `enabled but unavailable`을 구분한다. AgentOS에서도 “카탈로그에 존재함”, “이 프로젝트에 설치됨”, “현재 호스트가 읽을 수 있음”, “실제 실행 가능함”을 같은 의미로 표시하지 않아야 한다.

### 2.3 버전, 저장, 접근 정책

- 회사 라이브러리는 회사별 identity·버전·출처·정책을 저장한다. 일반 스킬 작업은 기본 허용 정책이며 명시적인 정책 제한과 회사 경계·핵심 안전 검사가 적용된다. 모든 스킬 변경에 사람 승인이 필요하다고 일반화하면 안 된다.
- 관리형 편집은 불변 버전을 발행하고 경쟁하는 head 변경은 `409`로 충돌 처리한다. 실행에는 버전 pin을 남긴다.
- 설치 패키지는 저장소 backend에 보존하고 DB는 소유권·버전·저장 영수증 등을 관리할 수 있다. 추출 캐시는 원본 데이터가 아니다.
- 검증된 Git 복원 레시피는 정확한 commit·파일·해시·모드를 사용하며 복원 실패 시 최신 브랜치로 대체하지 않는다. 직접 작성·편집한 자료의 내구성은 별도로 보장한다.
- 소스 refresh와 저장된 버전 채택, 활성 실행의 버전 유지, 캐시 정리는 서로 다른 수명주기다.

이 서버·DB·실행 제어 전체를 AgentOS로 옮기는 것은 적합하지 않다. 로컬 manifest와 파일 백업으로 같은 문제의 작은 범위를 해결하는 편이 현재 구조에 맞다.

## 3. AgentOS 현재 상태와 차이

Paperclip에 설치된 AgentOS는 v2.0.0이며 스킬 4개와 역할 문서 2개가 등록되어 있다. 스킬은 `harness`, `writing-plans`, `graphify`, `project-document-bootstrap`, 역할은 `codebase-explorer`, `principle-reviewer`다. 역할 문서는 실행 중인 하위 에이전트가 아니다.

AgentOS 원본은 더 많은 선택 스킬을 제공한다. `doc-maintenance`, `github-pr-workflow`, `skill-creator`, `skill-catalog-viewer`, `knowledge-curator`, `agent-browser`, `wireframe`, `design-critique` 등이 이미 있으므로 Paperclip에서 다시 가져오기 전에 기존 구현을 비교해야 한다.

| 관리 항목 | AgentOS에서 확인한 현재 기능 | 적용 판단 |
| --- | --- | --- |
| 카탈로그·선택 설치 | `catalog/skills/catalog.json`, `catalog/agents/catalog.json`, 프로필·분류·이름 선택 | 그대로 사용 |
| 설치 상태 | `.agentos/catalog.json`, `.agentos/skills.json`, 사람이 읽는 `catalog.md` | 별도 registry를 추가하지 않고 확장 |
| 기본 검증 | 등록 항목과 실파일 대칭, 이름·경로·SemVer 일치, 중복 검사 | 재사용 |
| 파일 보호 | staging, 업데이트 백업·실패 복구, 관리되지 않는 경로 충돌 보호, symlink 거부 | 유지·회귀 검증 |
| 업데이트 | 기존 선택 유지, 명시적 `--update`, 누락 항목 제거는 `--prune` 등 별도 처리 | 유지 |
| 검색·보기 | CLI/TUI와 `skill-catalog-viewer`의 정적 HTML | 검색 서비스·웹앱 신설 불필요 |
| 출처·무결성 | 일부 외부 번들에 `skills-lock.json` 출처·해시 존재 | 설치 항목 전체의 원본 revision·내용 해시 계약은 보강 필요 |
| 신뢰·의존성 | 설명·license와 일부 의존 번들 선택 처리 | 공통 파일 분류와 외부 도구 요구사항을 일관되게 표시 |
| 실행 격리·권한 | 호스트 에이전트와 사용자 권한에 의존 | 스킬 metadata를 권한 enforcement로 표현하지 않음 |

AgentOS 설치기는 Python 표준 라이브러리만 사용하고 네트워크·인증 없이 설치하는 계약을 가진다. 외부 자료 취득은 기여·준비 단계에서 하고, 프로젝트 설치는 준비된 로컬 번들만 읽도록 유지한다.

### 먼저 해결할 지침 불일치

설치된 `writing-plans`는 작업문서를 `.agentos/project/work/`에만 두도록 하지만, Paperclip `AGENTS.md`와 `.agentos/project/project.md`는 저장소 계획을 `doc/plans/YYYY-MM-DD-slug.md`에 두도록 한다. 이번 문서는 명시적인 저장소 규칙을 따라 `doc/plans/`에 둔다. 후속 AgentOS 개선에서는 “프로젝트의 기존 문서 위치 우선, 없을 때 AgentOS 기본 위치 사용”을 스킬에 일관되게 명시한다. 같은 계획을 두 위치에 복제하지 않는다.

## 4. 도입할 스킬과 우선순위

| 후보 | 판단·우선순위 | 구체적인 적용 방법 | 확인할 결과 |
| --- | --- | --- | --- |
| `test-audit` | 신규 선택 스킬, P1 | 중복·무효 테스트 판별과 잔존 회귀 증거 원칙을 유지하고 `references/paperclip.md`를 대상 프로젝트 지침으로 대체. `NOTICE.md` 유지 | 삭제 후보마다 관찰 가능한 계약과 대체 검증 제시. 삭제하지 않는 결론도 허용 |
| `create-verification-skill` | 신규 선택 스킬, P1 | 프로젝트별 실행·상태 확인·대표 여정·정리 절차를 생성. Paperclip 전용 map 위치를 기본값으로 강제하지 않음 | 별도 샘플 앱에서 여정 1개 실행 후 정리, 증거 파일 보존 |
| `maintain-verification-skill` | 위 스킬과 함께 P1 | 소스 확인·실행 확인·미검증 항목 구분. 제품 API·권한 변경을 유지보수 범위에서 제외 | 소스만 본 상태를 실제 통과로 보고하지 않음 |
| `check-pr`, `prcheckloop` | 기존 PR 스킬 보강, P2 | `github-pr-workflow`의 상세 reference로 흡수할지 먼저 비교. 필요할 때만 별도 진입점 제공 | 최신 head의 check-run과 legacy status 확인, 제한된 반복, 정확한 blocker 보고 |
| `pr-report` | 선택 후보, P2 | 구조·동작·위험·증거 중심 보고 절차와 템플릿만 재사용. Paperclip 게시 경로 분리 | 저장소가 다른 PR에도 사용 가능 |
| `qa-acceptance` | 기존 검증·계획 스킬 보강, P2 | Given/When/Then과 실패·경계·동시성 확인을 선택형 reference로 반영 | 작은 문서 수정에 불필요한 전체 QA 계획을 강제하지 않음 |
| `doc-maintenance` | 기존 스킬 유지·선별 보강 | AgentOS판이 이미 존재. Paperclip판의 변경범위→관련 문서 추적·부분 수정 절차만 비교 | 같은 이름의 두 스킬 설치 방지 |
| `para-memory-files` | 보류 또는 선택 reference, P3 | `knowledge-curator`와 중복 비교 후 결정. `$AGENT_HOME` 가정 제거·저장범위 명시 | 작업 계획·개인 메모리·장기 지식의 권위와 보존 정책 구분 |
| `release-changelog`, `release-announcement`, `simplified-english` | 필요 시 선택, P3 | Paperclip 태그·브랜드·배포 채널을 프로젝트 설정으로 분리 | 해당 프로젝트의 릴리스 규칙으로 결과 생성 |
| `graphify`, `project-document-bootstrap`, `wireframe`, `design-critique`, `agent-browser` | 기존 자원 재사용 | 신규 이식보다 설치·문서 연결과 중복 확인 | 공통 기능에 단일 관리 경로 유지 |
| Paperclip API·Runner·회사 운영 전용 스킬 | 공통 기본팩에서 제외 | 필요하면 별도 Paperclip 통합팩으로 관리 | API·인증이 없을 때 실행 가능하다고 표시하지 않음 |

`release`, `deal-with-security-advisory`, `garden-inbox`, `setup-code-maintenance-bot`, `paperclip-page` 등은 권한·비밀정보·외부 쓰기·서비스 계약이 강하므로 초기 이식 대상에서 제외한다. 스킬 보유만으로 원격 변경 권한을 부여하지 않는다.

## 5. 도입할 관리 계약

### 5.1 소유권과 데이터 흐름

`AgentOS 원본 카탈로그 → 선택·검증 → 설치 staging → 프로젝트의 관리 스킬 + 설치 manifest → 호스트가 필요한 본문을 읽음`

- 원본 스킬과 스킬 검증: AgentOS 카탈로그 담당.
- 파일 배치·업데이트·백업·복구: 기존 `install.py`와 `catalog_install.py` 담당.
- 프로젝트 지침·작업기록·사용자 작성 스킬: 해당 프로젝트 담당. 설치기가 자동 흡수하지 않음.
- 모델 실행·도구 인증·권한: 호스트 담당. 역할 문서나 설치 목록은 실행 권한이 아님.
- 일반 설치 과정에서 스킬 스크립트·hook·의존성 설치 명령을 실행하지 않는다. 기존 명시적 호스트 hook 옵션과 스킬 내부 실행물은 구분한다.

### 5.2 최소 메타데이터 확장안

아래 항목은 **제안 계약**이며 아직 구현되어 있지 않다. 먼저 기존 JSON 필드와 `skills-lock.json` 소비자를 조사하고, 동일 정보의 병렬 원장을 만들지 않는 위치를 정한다.

| 계약 | 입력 → 출력 | 의미 |
| --- | --- | --- |
| 출처 기록 | 원본 repo·path·고정 revision·license → provenance | 원본 출처와 AgentOS가 수정한 부분 구분 |
| 번들 inventory | 로컬 파일 트리 → 정렬된 path·size·mode·SHA-256와 `content_hash` | `SKILL.md`뿐 아니라 실제 배포하는 전체 파일을 대상으로 결정적으로 계산 |
| 파일 분류 | inventory → `markdown_only` / `assets` / `scripts_executables` | 선언값보다 실제 파일을 기준으로 표시. 실행 비트·알 수 없는 실행물도 보수적으로 분류 |
| 요구사항 | 스킬 metadata → 외부 도구·환경·관련 스킬 목록 | 설치 성공과 실행 준비 완료를 구분. credential 값은 기록하지 않음 |
| 설치 영수증 | 선택 항목·원본 revision·inventory → 기존 설치 manifest 확장 | 설치 당시 내용과 나중의 로컬 편집 구분 |
| 변경 사전보기 | 이전 영수증·현재 설치 파일·새 원본 → 유지/갱신/로컬 편집/충돌 목록 | 실제 쓰기 전에 영향 표시. CLI 명령명은 구현 시 결정 |

기존 schema v1을 읽을 때 새 필드가 없으면 `unknown`으로 처리한다. 과거 설치 내용을 현재 원본으로 덮어 추정한 해시를 “이전 설치 해시”로 기록하지 않는다. 파일 해시는 변조 감지·재현성을 돕지만 공급자 신뢰나 안전성 인증을 대신하지 않는다.

### 5.3 갱신과 충돌 처리

1. 기존 manifest로 관리 소유권과 설치 선택을 읽는다.
2. 원본 번들을 검증하고 새 해시·신뢰 분류·의존성 변화를 계산한다.
3. 설치 당시 해시와 현재 파일을 비교하여 로컬 편집을 식별한다. 기존 영수증이 없으면 불확실성을 표시한다.
4. 새 원본과 같으면 불필요한 파일 교체를 줄인다. 로컬 편집이 있으면 기본 보존하고 충돌 위치를 보고한다. 명시적 덮어쓰기 선택 시 기존 백업 경로를 재사용한다.
5. 기존 staging·백업·실패 복구 경로로 반영한다. manifest와 설치 트리의 불일치가 생기지 않게 함께 처리한다.
6. 삭제·중단된 배포 항목을 자동 제거하지 않는다. 기존 `--prune` 계약을 유지한다.

현재 AgentOS에는 설치 당시 파일별 해시가 공통으로 없으므로 3번은 새 구현이 필요하다. 기존 백업이 곧 로컬 변경 충돌 감지라는 뜻은 아니다. 새 검증 명령이 생기더라도 매 세션 전체 파일을 반복 해싱하도록 강제하지 않는다.

## 6. 단계별 적용 계획

| 단계 | 작업·소유 위치 | 완료 기준 |
| --- | --- | --- |
| A. 중복·출처 확정 | AgentOS 원본 `catalog/skills/`와 Paperclip 후보 비교 | 후보별 기존 자원/신규/보류 결정, 원본 full revision·license·NOTICE·변경범위 기록 |
| B. 소규모 스킬 파일럿 | AgentOS 원본의 선택 카탈로그에 `test-audit`, 검증 스킬 2개 | 표준 진입점·범위·의존성·예제·성공 조건 존재. 기본 starter 확장 없이 명시 선택으로 설치 |
| C. 관리 메타데이터 | 원본 `catalog_install.py`, 카탈로그 검증과 기존 manifest | 결정적 inventory, provenance, 호환성 처리, 생성 인덱스 일관성 검증 |
| D. 갱신 보호 | 원본 `install.py`, `catalog_install.py`, 필요 시 TUI | 로컬 수정 충돌 감지, 변경 사전보기, 백업·복구·unmanaged 보호 회귀 통과 |
| E. 통합 검증·운영 문서 | 원본 테스트·기여 문서와 격리된 대상 프로젝트 | 두 종류 프로젝트에서 설치→사용→업데이트→복구 증거. 기록을 남긴 뒤 Paperclip에 선택 적용 검토 |

B는 C·D 전체를 기다리지 않아도 기존 안전한 선택 설치 경로로 검증할 수 있다. C가 완료되어야 D의 세 방향 비교가 가능하다. P2·P3 스킬 추가는 파일럿 결과에 따라 별도 범위로 진행한다.

초기 적용 대상은 별도 임시 디렉터리의 최소 프로젝트와 Paperclip 모양의 충돌 fixture다. 현재 Paperclip 작업 디렉터리는 미커밋 작업과 동일 이름 스킬이 많아 첫 설치 실험 대상으로 쓰지 않는다. 신규 구현과 테스트는 AgentOS 원본에 두고, 이 저장소에는 Paperclip 고유 정책을 유지한다.

## Acceptance evidence

### 후속 구현에서 필요한 검증

- 원본 설치기 변경: AgentOS 규칙에 따라 `python3 -m unittest discover -s tests -v`.
- 카탈로그: 미등록·중복·버전 불일치·누락 reference 실패, 파일 순회 순서가 달라도 같은 해시, 파일 내용·실행 비트 변경 시 해시 변화.
- 설치 보호: unmanaged 경로 충돌 시 보존, symlink/path escape 거부, 실패를 주입한 갱신에서 기존 파일·manifest·프로젝트 문서 복구.
- 호환성: 기존 schema v1 설치의 정보 부재를 `unknown`으로 표시하고 안전하게 갱신. `AGENTS.md`, `.agentos/project/`, 사용자 스킬을 보존.
- 오프라인: 네트워크·인증 없이 준비된 로컬 번들 설치. 의존 도구가 없어도 자동 설치하지 않고 실행 전 요구사항을 명확히 표시.
- 갱신: 변경 없음, 원본만 변경, 로컬만 변경, 양쪽 변경, 새 파일 충돌, 삭제 항목, 신뢰 등급 상승을 각각 검증. 이전 설치를 실제 복구할 수 있어야 함.
- 실사용: `test-audit`의 retain/remove 판단과 유지되는 회귀 증거, 검증 스킬 생성 후 샘플 여정 실행·cleanup 후 증거 보존, 유지보수 시 미실행 범위의 정확한 보고.
- 최종 사용자는 등록·설치·호스트 인식·실행 준비 상태를 구분할 수 있어야 함. 테스트 수·스킬 수 증가만으로 개선 성공을 주장하지 않음.

### 이번 문서의 확인 범위

디렉터리 수량과 생성 manifest의 17개 항목, 설치된 AgentOS의 스킬 4개·역할 2개, 두 저장소의 HEAD, 설치기 보호·검증 경로를 읽어 확인했다. 후보 목록은 본문과 주요 reference를 표본 조사한 분석이며 모든 후보를 실행한 결과가 아니다.

문서 변경 검증 결과: 파일 존재, 로컬 링크 21개 대상 존재, 위 수량의 재계산을 확인했다. `git diff --no-index --check /dev/null doc/plans/2026-11-14-paperclip-skills-agentos-adoption.md`는 공백 오류 진단 없이 완료했다(새 파일 차이를 나타내는 종료 코드 1). 제품 코드가 바뀌지 않으므로 Paperclip 전체 typecheck·테스트·build 및 AgentOS 설치기 테스트는 실행하지 않았다. 이 문서는 PR-ready 구현이나 실제 운영 검증 완료를 뜻하지 않는다.

현재 세션에는 `PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY`, 회사·이슈·run 문맥이 주어지지 않았다. 따라서 아티팩트 업로드와 issue work product 등록은 수행할 수 없으며 이 파일은 저장소 내 계획문서로 남는다. Paperclip 이슈에 연결해 배포할 경우 `skills/paperclip/scripts/paperclip-upload-artifact.sh` 또는 해당 실행환경의 `register_deliverable`로 등록하고 실제 영수증 링크를 남겨야 한다. 업로드 완료로 보고하지 않는다.

## Current state

- **Completed**: Paperclip 스킬 계층·수량, 카탈로그 계약, AgentOS 설치 구조·중복 자원·업데이트 보호를 조사하고 적용 후보와 단계별 검증안을 작성했다.
- **Remaining**: 후속 구현 요청 시 AgentOS 원본에서 후보별 전체 의존 파일·라이선스·동명 스킬 비교를 확정하고 단계 A부터 진행한다. 구현·설치·실사용 검증은 수행하지 않았다.
- **Next concrete action**: 후속 구현이 요청되면 AgentOS 원본에서 `test-audit`, `create-verification-skill`, `maintain-verification-skill`의 전체 번들과 기존 대체 자원을 비교해 단계 A의 도입 목록을 확정한다.

## Decisions and evidence

### 권고 결정

1. 공통 harness는 간결하게 유지하고 신규 도메인 스킬은 선택 설치한다.
2. 기존 AgentOS 카탈로그·설치기·백업을 확장하며 서버·DB·원격 registry를 새로 만들지 않는다.
3. 출처·파일 해시·신뢰 분류·갱신 비교를 우선 도입하고, 회사별 승인·권한·실행 pin·캐시 수명주기는 Paperclip 통합 영역에 남긴다.
4. 설명과 예제·검증 증거를 함께 이식한다. 스킬 파일만 복사해 사용할 수 있다고 주장하지 않는다.
5. 계획 위치와 PR 템플릿·UI 증거 요구 등은 대상 프로젝트 지침을 우선한다. Paperclip 카탈로그의 `github-pr-workflow`에 있는 자체 PR 형식·UI 스크린샷 요구를 AgentOS 공통 규칙으로 복사하지 않는다.

### 근거 파일

아래 링크는 이 저장소 기준이다. AgentOS 원본은 위에 적은 별도 로컬 체크아웃의 파일을 조사했으며 구현 전에 다시 존재와 revision을 확인한다.

- [AgentOS 설치 자원](../../.agentos/catalog.md), [설치 manifest](../../.agentos/catalog.json), [프로젝트 지침](../../.agentos/project/project.md).
- [harness](../../.agents/skills/harness/guidance/SKILL.md), [writing-plans](../../.agents/skills/harness/writing-plans/SKILL.md).
- [카탈로그 타입](../../packages/skills-catalog/src/types.ts), [생성기](../../packages/skills-catalog/scripts/build-catalog-manifest.ts), [출하 목록 검증](../../packages/skills-catalog/src/shipped-catalog.test.ts).
- [카탈로그 작성 절차](../../.agents/skills/create-paperclip-bundled-skill/SKILL.md), [회사 라이브러리와 할당](../../skills/paperclip/references/company-skills.md), [런타임 라이브러리 상태 표현](../../packages/adapter-utils/src/skill-library-manifest.ts).
- [패키지 저장·복구·pin](../skill-package-storage.md), [회사 스킬 정책](../../server/src/services/company-skill-policy.ts), [회사 스킬 schema](../../packages/db/src/schema/company_skills.ts).
- [test-audit](../../.agents/skills/test-audit/SKILL.md), [검증 스킬 생성](../../.agents/skills/create-verification-skill/SKILL.md), [검증 스킬 유지보수](../../.agents/skills/maintain-verification-skill/SKILL.md).
- [test-audit 출처·라이선스](../../.agents/skills/test-audit/NOTICE.md), [검증 스킬 출처·라이선스](../../.agents/skills/create-verification-skill/NOTICE.md), [아티팩트 계약](../AGENT-ARTIFACTS.md).
- AgentOS 원본의 `README.md`, `AGENTS.md`, `.agentos/project/project.md`, `install.py`, `catalog_install.py`, `catalog/skills/catalog.json`, `skills-lock.json`, `catalog/skills/{doc-maintenance,github-pr-workflow,skill-catalog-viewer}/SKILL.md`.

주의: [Skills Store 안내](../../docs/guides/agent-developer/skills-store.md) 일부 source badge·key 설명은 현재 타입·저장 구조와 차이가 있다. 관리형 소스와 canonical key는 구현 타입·테스트·최신 패키지 문서를 우선해 판단했다. 문서에 있는 과거 표현을 새 AgentOS 계약에 그대로 옮기지 않는다.
