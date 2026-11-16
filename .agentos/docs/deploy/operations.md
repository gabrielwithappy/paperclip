# 운영·재적용·복구 절차

기준: 2026-11-16. 저장소 루트에서 실행한다. 사용자 서비스는 `gabriel` 사용자 세션에서 관리한다.
명령 예시는 운영 절차이며 이 문서를 읽는 것만으로 서비스 변경을 승인하는 것은 아니다.

## 빠른 상태 확인

```bash
systemctl --user status paperclipai.service paperclip-slack-callback.service --no-pager
systemctl status docker.service cloudflared.service tailscaled.service --no-pager
systemctl --user is-enabled paperclipai.service paperclip-slack-callback.service
loginctl show-user gabriel -p Linger
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
docker inspect paperclip-private-slack-db-1 --format '{{.State.Health.Status}} {{.HostConfig.RestartPolicy.Name}}'
docker exec paperclip-private-slack-db-1 pg_isready -U paperclip -d paperclip
ss -ltn | rg '3110|3111|55432'
curl --fail-with-body http://127.0.0.1:3110/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3110/
tailscale serve status
tailscale funnel status
curl -I --max-time 15 https://slack-hook.ebooks.ai.kr/
```

합격 기준: DB healthy, 앱·콜백 active, health `ok` 및 bootstrap `ready`, UI 200.
공개 Slack 루트의 404는 정상이며 실제 서명된 Slack 이벤트 수신 성공을 대신하지 않는다.
UI 로그인, 기존 데이터·첨부파일 조회, 에이전트 실행 및 Slack 회신까지 확인해야 전체 사용자 경로가 검증된다.

포트 소유자도 확인한다. 다른 checkout이 응답하는 것을 정상으로 오인하지 않는다.

```bash
systemctl --user show paperclipai.service -p MainPID
lsof -nP -iTCP:3110 -sTCP:LISTEN
# 위에서 확인한 실제 listener PID 사용
readlink /proc/<PID>/cwd
```

현재 source CLI 경로는 이 checkout을 향해야 한다. systemd MainPID가 launcher 부모인 경우 listener PID를 따로 확인한다.

## 로그와 장애 분리

```bash
journalctl --user -u paperclipai.service --since '30 minutes ago' --no-pager
journalctl --user -u paperclip-slack-callback.service --since '30 minutes ago' --no-pager
journalctl -u cloudflared.service --since '30 minutes ago' --no-pager
docker logs --tail 100 paperclip-private-slack-db-1
```

| 증상 | 먼저 볼 항목 | 조치 방향 |
|---|---|---|
| Slack 무반응, webhook 500 | `database_unreachable`, `ECONNREFUSED`, DB port | DB 컨테이너·볼륨 존재와 readiness부터 확인 |
| Slack 무반응, 앱에 수신 로그 없음 | Cloudflare 연결, 원격 ingress, 3111, Slack Request URL | 도메인 → 터널 → 프록시 순으로 추적 |
| Slack 재시도 `http_error` | webhook HTTP status, 요청 처리 시간 | 최초 오류를 찾고 중복 처리 여부 확인 |
| 서명 오류 | signing secret, 원문 body 보존, 호스트 시간 | 비밀 원본·프록시·시간 동기화 확인 |
| webhook 성공, 회신 없음 | inbound 분류, 채널/agent 연결, 실행·delivery 로그 | 실제 이벤트 대상과 실행·발행 단계를 구분 |
| UI 접속 불가, 로컬 health 정상 | Tailscale Serve, tailnet 연결, 8443 | 기본 443의 다른 앱 설정을 건드리지 않음 |
| 재시작 후 시작 실패 | env/config 일치, build prerequisites, Node 경로 | 런처 오류 해결, 임의 신규 onboarding 금지 |
| DB 컨테이너 없음 | `docker volume ls`, 원본 pgdata, 백업 | 빈 DB를 정상 복구로 오인하지 않음 |

Slack 요청 본문·토큰·DB connection string 원문을 공유 로그/문서에 붙이지 않는다.
`/etc/cloudflared/config.yml`보다 실제 unit 실행 인수와 `Updated to new configuration` 로그를 우선한다.
Cloudflare 원격 DNS/Access 정책은 현재 로컬 조사만으로 완전히 검증되지 않았다.

## 시작·중지 순서

시작 전 원래 볼륨이 있는지 확인한다. `compose up`은 없는 볼륨을 새로 만들기 때문에 데이터가 사라진 상황에서 무조건 실행하면 안 된다.

```bash
docker volume inspect paperclip-private-slack_pgdata
docker compose -p paperclip-private-slack --env-file docker/.env.private-slack \
  -f docker/docker-compose.private-slack.yml -f docker/docker-compose.local-service.yml \
  up -d --no-deps db
docker exec paperclip-private-slack-db-1 pg_isready -U paperclip -d paperclip
scripts/local-service/manage start
systemctl --user start paperclip-slack-callback.service
```

Cloudflare와 Tailscale은 호스트의 다른 서비스와 공유될 수 있다. Paperclip만 중지할 때 전체 터널/daemon을 중지하지 않는다.
변경·업데이트 전에는 task-drain으로 신규 실행·writes/ingress를 차단하고 활성 run 종료를 확인한다.

```bash
systemctl --user stop paperclip-slack-callback.service
scripts/local-service/manage stop
```

DB 중지가 필요할 때만 위 순서 다음에 DB를 중지한다. 정상 운영 중 DB부터 중지하지 않는다.
`After=`는 실행 순서이며 DB readiness나 장애 복구를 보장하는 의존성은 아니다.
현재 사용자 app unit과 Docker DB 사이의 readiness 연결은 자동화되어 있지 않다.

## 백업 선택·복구

1. 자동 백업 디렉터리를 **먼저** 확인하고 수동 migration dump와 시간을 비교한다. 파일명 시각과 파일 완료 시각은 다를 수 있다.
2. writer를 중지하고 원본 DB·HOME·설정·암호화 키를 보존한다. 원본 데이터가 없으면 최신 복구 지점과 손실 가능 시간을 명시한다.
3. `.sql.gz`는 `gzip -t`, custom `.dump`는 checksum 및 `pg_restore --list`로 검사한다.
4. 실패 상태를 덮어쓰지 않고 별도 볼륨 또는 별도 DB에 복원한다. DB schema만이 아니라 전체 데이터·sequence·권한을 확인한다.
5. 오류 없는 복원을 확인한 후 기존 DB를 보존한 채 대상 DB를 전환하고 서비스를 재개한다.

현재 복구처럼 plain SQL gzip을 **새 DB**에 복원하는 예:

```bash
# <BACKUP>는 확인한 절대 경로, <NEW_DB>는 충돌하지 않는 새 이름으로 치환
# 앱/콜백과 모든 writer를 먼저 중지한다.
gzip -t <BACKUP>
docker exec paperclip-private-slack-db-1 createdb -U paperclip <NEW_DB>
# bash pipefail로 압축 해제 실패까지 포착한다. SQL 출력에는 private 데이터가 포함될 수 있다.
set -o pipefail
gzip -dc <BACKUP> | docker exec -i paperclip-private-slack-db-1 \
  psql -X -v ON_ERROR_STOP=1 -U paperclip -d <NEW_DB> > /private/path/restore.log 2>&1
```

custom dump는 `pg_restore --exit-on-error --no-owner -U paperclip -d <NEW_DB>`를 사용한다.
복원 대상에 기존 schema/data가 있으면 그대로 중복 restore하지 않는다.
복원 중에는 앱을 켜지 않는다. 전환은 연결 세션이 없는 상태에서 진행하며 이전 DB를 즉시 삭제하지 않는다.
원래 DB 포트/사용자/비밀번호를 유지하면 앱 env와 config를 바꾸지 않아도 된다.
DB 백업은 HOME의 첨부파일·로컬 secret key 파일을 포함하지 않으므로 대응 HOME 백업도 필요하다.

운영 runbook: [local-service README](../../../scripts/local-service/README.md).
수동 backup helper는 writer 정지 후 `scripts/local-service/backup /absolute/new-private-directory /home/gabriel/.local/share/paperclip-devel`을 사용한다.
두 번째 인자를 생략하면 과거 Docker HOME volume을 선택하므로 현재 host 서비스 백업에서는 반드시 지정한다.

## 다른 호스트/서비스에 재적용

1. 기존 호스트에서 일관된 DB/HOME 백업, private config/env, unit·drop-in, source SHA·dirty diff·lockfile을 확보한다. 체크섬 검사와 별도 복원 리허설을 수행한다.
2. 대상에 지원 Node/pnpm, Docker Compose, systemd user manager, cloudflared, tailscale을 준비한다. 현재 버전을 기준으로 호환성을 검증한다.
3. 대상의 사용자·checkout·PAPERCLIP_HOME·instance·포트·도메인·Docker gateway를 표로 매핑한다. 다른 운영 instance와 DB/포트를 공유하지 않는다.
4. DB를 새 볼륨에 복원하고 HOME 전체를 복사한다. 기존 암호화·세션·JWT·tool signing secret을 보호된 수단으로 이전한다. 파일 소유권과 0700/0600 권한을 맞춘다.
5. `runtime.env.example`을 참고해 private runtime.env와 node-path를 만들고 config DB URL/port와 일치시킨다. secret 값을 템플릿 placeholder로 덮어쓰지 않는다.
6. agent instructions/workspaces/CLI 인증의 절대 경로를 대상 환경에 맞춘다. 기존 지침 경로 문제는 `scripts/local-service/repair-instructions`의 dry-run과 공식 절차를 따른다.
7. app 중지 상태에서 `scripts/local-service/prepare` 및 migration 검토를 수행한다. 스키마 변경 전 복구 세트가 있어야 하며 구버전 앱을 신규 schema에 임의 연결하지 않는다.
8. `scripts/local-service/launcher doctor`, `scripts/local-service/manage install`로 사용자 unit을 등록한다. callback 템플릿의 `@LAUNCHER@`를 대상 절대 경로로 바꾸어 unit을 설치한다. daemon-reload와 enable을 적용하고 linger 필요 여부를 확인한다.
9. Cloudflare에 새 hostname → 로컬 3111 ingress와 DNS를 구성한다. token은 `/etc/cloudflared/token` 같은 보호 파일로 설치한다. 실제 Slack Request URL은 연결의 publicId를 포함한 `/api/chat-webhooks/<publicId>/slack`이어야 한다.
10. Slack 앱의 Event Subscriptions/필요 권한/채널 연결을 확인하고 Request URL 검증을 수행한다. 서명 비밀·OAuth 자격증명은 보호된 앱/instance 설정에서 관리한다.
11. 운영 UI는 대상 tailnet의 Serve 8443 → 3110으로 구성하고 public URL, allowed hostnames, trusted origins, container API URL을 일치시킨다. 대상 방화벽/Access 정책을 별도 검증한다.
12. DB → 앱 → callback 순서로 시작하고 health, 로그인, 데이터·첨부파일·복호화, agent 실행, 서명된 Slack 수신·중복 처리·이모티콘·회신을 확인한 뒤 ingress와 작업을 재개한다.

재적용 전 참고: [migration 계획/실행 기록](../../../doc/plans/2026-11-13-devel-local-service-migration.md), [Slack 연결 문서](../../../doc/connections/slack-setup.md).
현재 문서화 작업에서 인프라 설정·DNS·unit·프로덕션 코드는 변경하지 않았다.
