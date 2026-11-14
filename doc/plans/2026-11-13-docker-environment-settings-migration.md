---
status: draft
priority: high
updated: 2026-11-14T03:08:20+09:00
authorization: Implementation authorized
reviewed_by: [qa_local_plan]
---

# 기존 Docker 환경 설정의 로컬 서비스 적용 계획

## Outcome and scope

현재 Docker 운영에서 사용하던 Slack 연결, 스킬, 에이전트·Runner, 도구 로그인, 저장소·인증 설정을 로컬 Paperclip 서비스에서도 이어 사용한다. 성공 기준은 설정 파일 복사 자체가 아니라 동일한 회사·연결·스킬 버전으로 기존 작업을 수행할 수 있는 것이다.

이 문서는 [서비스 전환 계획](2026-11-13-devel-local-service-migration.md)의 설정 이관 세부 계획이다. 서비스 배치, DB/HOME 백업, writer 정지, 트래픽 전환과 복구 순서는 상위 계획을 따른다. 이 문서에는 설정 조사·적용·검증만 기록해 전환 절차를 중복 운영하지 않는다. 앞선 직접 전환 지시는 유지하며, 이번 요청은 1인 검증용 devel 직접 개발 방식에 맞춘 계획 업데이트·QA다. 별도 시험 앱·복제 DB를 구성하지 않고 같은 devel에서 준비·정지·백업·적용·검증한다. 이번 문서 작업에서 서비스 변경·비밀 복사·Slack 발송은 수행하지 않는다.

## Decisions and evidence

### 확인한 근거와 미확인 사항

- 저장소의 `docker/docker-compose.private-slack.yml`, `docker/slack-callback/nginx.conf`, `Dockerfile` 및 관련 문서를 읽었다. 실제 실행 이미지의 추가 패키지·수동 설치·볼륨 내용·환경 override는 조사 전이다.
- Compose의 DB 호스트명은 `db`, 앱 HOME은 `/paperclip`, 컨테이너 앱 포트는 3100이다. 로컬 전환 후에는 상위 계획에 따라 DB 접속을 loopback publish 포트로, 앱 포트를 3110으로 변경한다.
- Dockerfile은 `HOME=/paperclip`, `PAPERCLIP_HOME=/paperclip`, 기본 instance와 config 경로를 설정한다. 호스트 systemd 사용자의 HOME과 다르므로 앱 데이터와 CLI 인증 경로를 따로 확인한다. 호스트의 HOME을 통째로 교체하지 않는다.
- 실제로 사용 중인 스킬·연결·CLI 목록은 아직 확정하지 않았다. 아래 표의 선택 항목은 사용이 확인된 경우에만 적용한다. Docker 이미지에 포함됐다는 사실만으로 사용 중이라고 간주하지 않는다.

근거: [Docker 운영](../DOCKER.md), [Slack 설정](../connections/slack-setup.md), [스킬 패키지 저장소](../skill-package-storage.md), [스킬 호환성·변환](../skill-ephemeral-web-servers.md).

### 확인된 Slack 콜백 원본과 로컬 적용

2026-11-14 세션의 읽기 전용 확인에서 원본 환경 파일과 실행 컨테이너의 환경변수 값이 아래와 일치했다. 공개 origin만 기록하며 토큰·서명 키는 포함하지 않는다. 구현 직전 원본 값을 다시 대조한다.

| 항목 | 확인된 값·적용 계약 |
| --- | --- |
| 원본 파일 | `docker/.env.private-slack:6` (확인 당시 행 번호) |
| 설정 | `PAPERCLIP_CHAT_WEBHOOK_PUBLIC_URL=https://slack-hook.ebooks.ai.kr` |
| Docker 전달 | `docker/docker-compose.private-slack.yml`이 해당 값을 앱 컨테이너의 환경변수로 전달 |
| Slack 자동 등록 | 앱이 origin에 `/api/chat-webhooks/<publicId>/slack`을 붙여 Slack 앱 manifest의 이벤트·interactivity·slash command 수신 주소에 등록 |
| 로컬 적용 | systemd drop-in의 `EnvironmentFile=` 또는 상위 계획의 launcher가 읽는 서비스 전용 환경 파일에 동일 설정을 명시적으로 전달. 실제 파일 경로는 구현 때 확정하며 Docker env 파일을 자동 상속한다고 가정하지 않음 |
| 전환 후 연결 | `https://slack-hook.ebooks.ai.kr` → 기존 Cloudflare Tunnel → 호스트 콜백 프록시 `127.0.0.1:3111` → 로컬 앱 `127.0.0.1:3110` |

실행 중인 Docker DB에서 활성 Slack 연결 6개 모두 `slackSetupMethod=automatic`을 확인했고, 콜백 nginx 로그에서 Slack의 POST 요청과 HTTP 200 응답을 확인했다. 이는 기존 콜백의 사용 증거이며 로컬 전환 성공 증거는 아니다. Slack 관리 화면의 현재 manifest를 직접 조회한 것은 아니다. 전환 시 기존 public origin·endpoint ID를 유지하고, 실제 서비스 환경변수와 수신 경로를 검증한다.

### 설정별 원본과 적용 계약

비밀값 대신 설정 이름·존재 여부·저장 위치·소유자·적용 대상·검증 결과만 기록한다. 회사 및 에이전트별 목록에는 식별자를 함께 기록해 다른 회사의 연결이나 스킬이 섞이지 않도록 한다.

| 대상 | Docker 측 조사 원본 | 로컬 적용 방법 | 확인 기준 |
| --- | --- | --- | --- |
| DB | Compose 연결 설정, 실제 DB·volume | 기존 DB 유지, `DATABASE_URL`과 config connectionString을 같은 loopback DB로 설정 | 기존 회사·연결·작업 식별자 일치 |
| 앱 HOME·instance | `/paperclip`, 실제 instance/config, 별도 mount | 전용 호스트 `PAPERCLIP_HOME`, `PAPERCLIP_CONFIG`, 동일 운영 instance 명시 | onboarding 없이 기존 설정 로드 |
| 인증·암호화 | 세션 secret, 도구 서명 secret, master key의 실제 설정 위치 | 기존 값을 안전한 env/key 파일 또는 기존 secret backend로 전달 | 기존 로그인·자격증명 복호화·도구 인증 정상 |
| 보드·콜백 주소 | `PAPERCLIP_PUBLIC_URL`, `PAPERCLIP_CHAT_WEBHOOK_PUBLIC_URL` | 기존 private 보드·public 콜백 origin 유지 | 로그인·콜백 모두 정상 |
| bind·호스트 허용 | `HOST`, `PORT`, `PAPERCLIP_BIND`, `PAPERCLIP_ALLOWED_HOSTNAMES`, `BETTER_AUTH_TRUSTED_ORIGINS` | 3110과 실제 프록시/에이전트 경로에 맞춰 조정 | 접근 허용 범위와 secure cookie 유지 |
| 배포 모드 | `PAPERCLIP_DEPLOYMENT_MODE`, `PAPERCLIP_DEPLOYMENT_EXPOSURE`, `PAPERCLIP_AUTH_BASE_URL_MODE` | 기존 authenticated/private/explicit 설정 유지 | 비인증 보드 접근 거부 |
| Slack | DB의 회사별 연결·endpoint·채널·에이전트 매핑, 기존 vault 및 앱 설정 | DB·키·연결 ID 보존, 콜백 upstream만 로컬 앱으로 변경 | 기존 bot으로 동일 대화 경로 수신·응답 |
| 관리형·설치형 스킬 | DB의 설치·버전·할당·pins, 콘텐츠 저장 provider | DB와 실제 콘텐츠를 함께 보존, 로컬 provider 경로 대응 | 버전·파일·할당 일치 및 실제 실행 |
| linked-local·CLI 스킬 | 원본 workspace, runtime HOME의 스킬 경로·symlink | 명시적 호스트 경로 또는 runtime mount 대응 | 참조 파일·스크립트 접근 가능 |
| Runner·어댑터 | 에이전트 설정, 이미지 도구·provider pack·binary | 사용하는 실행 환경별 의존성·실행 파일 경로 준비 | 기존 harness·모델·account binding으로 실행 |
| 모델 자격증명 | AI connections, env의 `OPENAI_API_KEY`·`ANTHROPIC_API_KEY` 등 실제 사용 항목 | 기존 secret 참조 유지, 서비스 env에 필요한 항목만 전달 | 기존 계정으로 최소 실행 성공 |
| CLI·MCP·외부 도구 | 실제 로그인·설정·keyring·MCP 명령 및 env | 서비스 사용자 및 해당 runtime에서 경로·인증 설정 | 기존 권한 범위의 읽기 호출 성공 |
| 첨부·산출물·저장소 | storage provider, 파일 경로, 접근 키 참조 | 기존 provider 유지, 로컬 파일은 경로·소유권 이관 | 기존 첨부·스킬 콘텐츠 읽기 정상 |
| 시간대·운영 환경 | `TZ`, production/UI 설정, systemd 환경 | `Asia/Seoul`, 빌드 UI·명시적 서비스 env 적용 | 스케줄의 저장 시간대 유지, 재로그인 후 실행 정상 |

`PAPERCLIP_DB_PASSWORD`, `PAPERCLIP_BOARD_PORT`, `PAPERCLIP_CALLBACK_PORT` 등 Compose 치환용 변수와 앱이 직접 읽는 환경변수를 구분한다. `.env.private-slack`을 그대로 systemd에 넣거나 DB의 모든 비밀을 env로 평탄화하지 않는다. systemd용 파일은 해당 구문으로 작성하고 권한 0600을 적용한다. 환경변수와 저장 config의 우선순위는 실행 코드와 doctor 동작으로 확인한다.

## Approach

### 1. 실제 사용 환경 목록화

1. 상위 계획의 사전 준비 단계에서 실행 Compose 프로젝트·이미지 digest·mount·사용자·override를 식별한다. 전체 `docker inspect`, `compose config`, `env` 출력을 작업 로그에 남기지 않고 필요한 비밀 없는 필드만 추출한다.
2. 회사별 Slack 연결, 활성 agent, 할당 스킬·버전, 사용 도구·모델·storage provider를 목록화한다. 운영 DB에는 읽기만 수행한다.
3. 각 설정을 그대로 보존할 값, 주소·경로를 바꿀 값, 호스트에서 새로 준비할 의존성으로 분류하고 위 표에 실제 위치와 결과를 추가한다. 미확인 항목은 추정하지 않는다.
4. CLI·외부 도구 인증의 원본 HOME·keyring·파일 권한을 조사한다. 파일 복사 가능한 인증인지, OS keyring 또는 기기 종속 인증이라 서비스 사용자로 재로그인이 필요한지 구분한다.

### 2. 호스트 설정과 실행 환경 준비

1. DB/HOME 복사와 기존 키 보존은 상위 계획의 백업·복원 절차를 따른다. `/paperclip`, `/app`, Docker DNS 및 symlink를 실제 호스트 경로와 대응시키며 원본은 보존한다.
2. launcher 또는 systemd drop-in으로 env를 명시적으로 전달한다. `PAPERCLIP_HOME`과 CLI의 HOME/XDG 설정 경로는 분리해서 정하고, 사용자 개인 설정을 덮어쓰지 않는다. 비밀 파일을 Git·문서·산출물에 포함하지 않는다.
3. 에이전트별 PATH, Node·CLI 버전, workspace, Runner vendor/provider pack·실행 파일을 준비한다. Dockerfile의 `/opt/...` 경로가 호스트에도 있다고 가정하지 않는다. 기존 실행 설정의 sandbox 경계를 유지한다.
4. 실제 사용하는 Google Workspace CLI가 있으면 Compose의 `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file`과 기존 credential 위치·추가 암호화 키 의존성을 확인한다. Claude/Codex 등도 해당 서비스 사용자로 인증 상태를 확인하고 필요할 때만 재인증한다.
5. `PAPERCLIP_API_URL`은 실제 실행 환경에서 도달 가능하도록 정한다. 컨테이너에는 검증한 host gateway와 앱 bind를 사용하고, API 인증·회사 경계는 그대로 적용한다.

### 3. Slack 연결과 프록시 설정

1. 기존 Slack workspace·app/bot·연결·endpoint ID·setup method·채널 매핑과 token/secret 참조를 보존한다. 이전을 이유로 새 Slack 앱을 생성하거나 재설치하지 않는다. 자격증명 만료·누락·권한 부족은 별도 원인으로 기록한다.
2. 기존 private 보드 origin은 로그인 및 OAuth 복귀 경로로, public callback origin은 이벤트 수신 경로로 유지한다. 실제 Slack 앱 설정에 사용 중인 URL을 대조한다. 진행 중 OAuth 설정은 전환 전에 정리한다.
3. 상위 계획의 host callback 기본안에 맞춰 upstream을 `http://127.0.0.1:3110`으로 설정하고, POST Slack endpoint만 통과시키며 원문 body·필요 헤더를 보존한다.
4. 기존 Cloudflare Tunnel의 실제 hostname route가 `127.0.0.1:3111`을 가리키는지 확인한다. token 기반 tunnel은 로컬 config 파일만으로 유효 설정을 판단하지 않는다.
5. 운영 재개 후 기존 대화 경로에서 수신·응답을 검증한다. 실제 Slack 메시지 전송은 지정된 테스트 채널과 명시적 전송 권한이 확보된 경우에만 수행하고, 미확보 시 해당 인수 항목을 미검증으로 기록한다.

### 4. 스킬 및 도구 적용

1. 회사·스킬 ID별 현재 버전, 파일 목록, 할당과 활성 run pin을 기준으로 보존을 확인한다. Markdown 한 파일만으로 스크립트·참조 파일이 포함된 패키지를 대체하지 않는다.
2. managed/installed 콘텐츠의 DB·실제 provider 객체를 확인하고, linked-local 원본과 symlink는 실행 위치별 접근을 검증한다. 캐시는 필요할 때 재생성하되 원본 콘텐츠와 구분한다.
3. 레거시 형식이 실제로 확인된 경우에만 기존 스킬 변환 runbook을 따른다. 저장소 provider 변경이나 일괄 최신 버전 업데이트는 이관 작업에 포함하지 않는다.
4. 대표 스킬이 사용하는 CLI·MCP·환경변수·인증을 실제 서비스 사용자 또는 sandbox에서 검증한다. 로컬 개인 스킬과 Paperclip 회사 스킬은 자동으로 같은 목록이 되지 않으므로, Docker에서 실제 사용하던 범위를 기준으로 적용한다.

### 5. 단일 devel 환경에서 최종 설정 적용과 upstream 대응

상위 계획에 따라 운영 앱·동일 checkout을 참조하는 에이전트를 정지하고 DB/HOME·env를 백업한 후, 기존 DB와 전용 호스트 HOME·동일 instance·3110에 설정을 적용한다. 추가 시험 DB·instance·임시 포트는 만들지 않는다. 첫 로컬 기동 후 기존 데이터·키·스킬·CLI 인증을 확인하고, 제한된 Slack 수신 검증을 거쳐 자동 실행과 외부 유입을 한쪽 앱에만 재개한다. 실패 시 원인·수정·재시도 결과를 남기고 상위 계획의 복구 절차를 따른다.

반복 upstream merge의 실행 순서는 상위 계획 5단계를 따른다. 실제 env·키·HOME은 checkout 밖에 두고 예제·launcher·override만 로컬 전용 경로에서 관리한다. merge 후 config schema·환경변수 이름·CLI 로그인 경로·Runner 의존성·스킬 저장 호환성·Slack manifest 처리 변경을 확인해 대응표를 갱신한다. 기존 공개 콜백 주소와 회사별 ID를 보존하며 upstream 기본값이나 예제로 실제 설정을 덮어쓰지 않는다.

## Acceptance evidence

| 항목 | 통과 증거 |
| --- | --- |
| 설정 전달 | 실제 서비스 사용자·instance·config 경로와 필요한 env의 존재 확인, 비밀 원문 노출 없음 |
| 인증·DB | 기존 회사·사용자·연결 식별자 일치, 기존 세션 및 secret 복호화 정상 |
| Slack | 기존 bot/endpoint 수신·동일 대화 응답, 중복 이벤트 중복 작업 없음, 잘못된 서명 거부 |
| 공개 경계 | callback 이외 일반 API·보드 경로 거부, private 보드 로그인 정상 |
| 스킬 | 목록·할당·선택 버전·참조 파일 일치, 대표 스킬 작업 성공과 로그 증거 |
| 도구·모델 | 사용하는 각 인증 방식의 최소 호출, 대표 에이전트 실행·취소·자식 종료 정상 |
| runtime 도달성 | 실제 사용 중인 호스트·컨테이너 각각에서 health 및 권한 있는 API 호출 성공 |
| 영속성 | 재시작·로그아웃 후 설정·인증·파일 접근 유지, 저장된 스케줄 시간대 유지 |

결과에는 대상 ID·버전·실행 시각·성공/실패·비밀을 제거한 증거 위치를 남긴다. 설정 검사 성공과 실제 여정 성공을 구분하고, 실패 후 재시도 결과도 함께 기록한다. 이 문서 작성에는 빌드·테스트를 실행하지 않는다. 구현 시 관련 설정·운영 스크립트의 최소 검사부터 시작하고 PR-ready 검증은 상위 계획을 따른다.

## 실패 및 복구

키·DB·스킬 콘텐츠 불일치, 필수 CLI 인증 실패 또는 대표 실행 실패가 남으면 운영 준비 완료로 표시하지 않는다. 설정 파일은 변경 전 사본을 보존하며 트래픽·서비스·DB/HOME 복구는 상위 계획의 단일 절차로 수행한다. 최초 전환은 Docker 기준 세트, 이후 upstream 업데이트는 그 업데이트 직전 정상 devel 코드·의존성·설정·DB/HOME 세트를 사용한다. Slack 토큰 재발급·재인증 등 외부 상태가 바뀐 경우 이를 별도 기록한다. 파일을 되돌리는 것만으로 외부 상태가 복구되었다고 판단하지 않는다.

## Current state

- 완료: 사전 격리 없이 같은 devel에서 정지·백업·적용·검증하고 반복 upstream 동기화 시 개인 설정을 보존하는 절차를 반영했다. 공개 콜백의 실제 값·원본 파일 위치·Docker 전달 경로·로컬 서비스 적용 계약과 읽기 전용 운영 확인 근거를 추가했다. 저장소 Compose·Dockerfile·콜백 설정 및 Slack·스킬 문서를 바탕으로 설정 대응표와 적용·인수 절차를 작성했다.
- 남음: 실제 Docker 사용 목록·secret 저장 위치·CLI 인증 방식·runtime 배치 조사와 로컬 적용·검증 전체. 현재 문서의 위치·포트는 상위 계획의 기본안이며 실제 환경 조사가 필요하다.
- Next concrete action: 다음 구현 턴의 상위 계획 사전 준비 단계에서 실행 이미지·mount·비밀 없는 설정 필드와 회사별 사용 연결·스킬·에이전트를 읽기 전용으로 조사해 이 문서의 대응표에 실제 원본 위치를 기록한다.
- 전달: 저장소 계획문서로 제공한다. Paperclip issue 인증 환경이 있으면 `skills/paperclip/scripts/paperclip-upload-artifact.sh`로 업로드하고 artifact work product 및 최종 issue 링크를 등록한다. 인증 환경이 없으면 로컬 경로와 미등록 사유를 명시한다.

## QA 검토 및 반영 기록

2026-11-14 `qa_local_plan`이 이 문서와 상위 계획을 함께 검토했다. 백업 뒤 install/build 순서와 최초 전환/반복 업데이트 복구 기준을 상위 계획에서 수정하고 이 문서의 복구 기준도 동기화했다. 상세 결과는 [상위 계획 QA 기록](2026-11-13-devel-local-service-migration.md#2026-11-14-단일-devel-개발-방식-qa)을 따른다. 실제 환경 변경·실행 검증은 미수행이다.
