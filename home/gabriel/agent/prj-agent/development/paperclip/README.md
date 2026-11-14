# Paperclip 커넥터·OpenCode MCP 전자책 원고

AgentOS `ebookshelf-authoring` 0.1.0 형식으로 작성한 로컬 원고다.
`index.md`는 책 정보와 목차, `chapters/`는 6개 장이다.
2026-11-14 조사 결과와 독립 리뷰를 반영한 계획을 정리했으며, 실행 가능한 플러그인 패키지는 포함하지 않는다.

## 현재 상태

- 목차와 각 장을 authoring CLI의 `local inspect`로 확인했다.
- 원고에는 인증 키, 사용자 계정, 내부 서비스 주소를 넣지 않았다.
- 기존 온라인 책과 연결된 ID는 없고, `.ebookshelf/sync-state.json`도 임의로 만들지 않았다.
- ebookshelf CLI는 미인증이어서 책 생성·본문 업로드·공개 게시를 수행하지 않았다.
- 지정된 경로의 중복 부분을 그대로 유지해 저장했다. Git 저장소를 추가로 만들거나 소스 코드를 복제하지 않았다.

## 로컬 검사

현재 파일이 있는 폴더에서 다음 명령을 실행한다.

```sh
node /home/gabriel/agent/prj-agent/agentos-workspace/agentos-private/catalog/skills/ebookshelf-authoring/ebookshelf.mjs local inspect --index ./index.md --json
```

## 온라인 연결

사용자 터미널에서 같은 CLI의 `auth login --json`을 실행하고 브라우저에서 승인한다.
기존 책을 갱신하려면 책 ID와 각 문서 ID의 매핑을 먼저 확인한다. 제목만으로 기존 책이나 장을 연결하지 않는다.
새 책을 만들려면 새 책 생성 의도를 확인한 뒤 책·목차·본문 순서로 개별 저장하고, 확인된 ID·revision·hash만 기록한다.
공개 책 변경과 새 책 공개는 로컬 원고 검사와 별도 작업이다. 새 책 공개는 웹 앱에서 수행한다.

CLI 설치 안내의 Node 요구 버전은 24.21 이상이다. 이번 로컬 inspect는 호스트 Node 24.15.0에서 성공했으나,
이를 모든 온라인 명령의 호환성 보장으로 해석하지 않는다.
