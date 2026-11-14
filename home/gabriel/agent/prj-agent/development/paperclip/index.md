---
title: "Paperclip 커넥터와 OpenCode MCP 연동 실무"
description: "커넥터 인증과 에이전트 도구 전달의 차이, OpenCode 장애 진단, 외부 어댑터 설계 및 검증 계획"
topics: ["Paperclip", "OpenCode", "MCP", "외부 어댑터", "인증"]
updated: "2026-11-14"
---

# Paperclip 커넥터와 OpenCode MCP 연동 실무

이 원고는 2026년 11월 14일의 저장소 조사와 실제 읽기 호출, 독립 계획 리뷰를 바탕으로 작성했다.
외부 어댑터는 아직 구현·설치되지 않았다. 코드에서 확인한 사실, 운영 관측, 구현 후보를 구분한다.

독자는 Paperclip 운영자와 에이전트 어댑터 개발자다. 인증 키·계정 식별자·내부 접속 주소는 원고에 넣지 않았다.

## 목차

- [1장. 커넥터에서 에이전트 도구까지](chapters/01-connection-to-tools.md)
- [2장. Todoist 재인증 안내의 실제 원인](chapters/02-todoist-incident.md)
- [3장. 외부 어댑터 플러그인의 적용 구조](chapters/03-external-adapter.md)
- [4장. 리뷰한 구현 계획과 검증 기준](chapters/04-reviewed-plan.md)
- [5장. 실행 환경과 인증 백업](chapters/05-runtime-and-backup.md)
- [6장. 운영 점검과 근거 자료](chapters/06-operations-and-sources.md)
