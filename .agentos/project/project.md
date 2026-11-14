# Paperclip project context

Paperclip is a control plane for companies of AI agents: company-scoped task
assignment, agent orchestration, budgets, approvals, and activity history.

Read the repository's [AGENTS.md](../../AGENTS.md) first, including its required
reading order and scoped `rules/*.mdc`. Existing project rules take precedence
over generic skill defaults. Product and implementation contracts remain in
[doc/PRODUCT.md](../../doc/PRODUCT.md) and
[doc/SPEC-implementation.md](../../doc/SPEC-implementation.md).

The project is a TypeScript/pnpm monorepo with an Express server, React/Vite UI,
Drizzle database packages, agent adapters, and a CLI. See
[doc/DEVELOPING.md](../../doc/DEVELOPING.md) and
[doc/DATABASE.md](../../doc/DATABASE.md) for current setup and database guidance.

Preserve company isolation, single-assignee tasks, atomic checkout, approval
gates, budget controls, and mutation audit history. Use focused verification
appropriate to the change and the repository's existing instructions.

Repository plan documents follow the existing `AGENTS.md` convention under
`doc/plans/YYYY-MM-DD-slug.md`; link existing plans rather than duplicating them
in AgentOS work records. `.agentos/project/work/` is available for AgentOS
installation and session records when needed.

AgentOS installs portable guidance and selected resources under `.agents/`.
See [installed resources](../catalog.md). Keep project customizations outside
installer-managed skill and role bundles. Existing Paperclip skills remain
project-owned; role documents do not create running agents.
