---
status: active
priority: high
updated: 2026-11-19
authorization: Implementation, QA review, commit, push to fork and server restart authorized
reviewed_by: [qa_review]
---

# Legacy review reliability

## Outcome and scope

Make the actual operational skill entrypoint available to OpenCode reviews and preserve actionable review-recovery guidance. Existing diagnostic changes are included. Keep company/participant checks, approval gates, bounded retries and Native Runner semantics intact. User requested QA validation, commit/push and restart. Follow repository plan placement over generic skill placement.

## Approach

1. Render the selected runtime operational skill path in OpenCode input, using actual local/remote skills home rather than a hardcoded user path. Explain that prose/file edits do not submit decisions.
2. Preserve server-created review recovery instruction in the existing disposition-repair payload; reconstruct authoritative stage context where appropriate rather than treating arbitrary payload as authority.
3. Prove normal and recovery input, absent skill, remote path and secret-free logs with focused tests. QA reviews implementation and evidence.
4. Build affected packages sequentially; commit and push to the existing fork branch; restart managed server and verify health/loading.

## Acceptance evidence

Focused adapter and wake preparation tests; relevant shared prompt tests; package-scoped typecheck/build where contracts change; git diff --check; independent QA report. Live previous GAB-150/151 comparison supports the entrypoint approach, not a general success rate. After restart validate a fresh authorized test review without a manual skill path and inspect persisted decision.

## Current state

Next concrete action: implement the OpenCode operational skill entrypoint and bounded recovery guidance using existing runtime paths and payload fields.

## Verification constraint

All tests, typechecks and builds must run sequentially, only affected essential scope (explicit user instruction). Server package typecheck exited 137 (killed); do not automatically retry. Adapter build passed before that run. QA remote matrix passed 4 cases after typecheck stopped; no blocking review findings. Revised server negative cases and adapter local assertions still need final sequential runs.

## Implementation and QA evidence

Implemented the actual selected local/remote operational skill entrypoint and server receipt guidance. Review recovery now reads the current company-scoped issue and restores only the pending matching participant, with a static bounded repair instruction. It ignores arbitrary instruction strings and discards stale stage payloads. No authority changes. Optional structured diagnostic sink failure is nonfatal.

Sequential final checks: local adapter 13 passed; QA remote matrix 4 passed; recovery builder/renderer test passed including other/missing agent, terminal/missing/nonpending state and approval. Adapter TypeScript build passed. Server scoped typecheck was killed (137); not retried per host rule and user constraint. QA reported no blocking findings.

Next concrete action: commit/push to fork/devel, restart managed server and verify a fresh normal and forced-recovery review through the real configured PO.
