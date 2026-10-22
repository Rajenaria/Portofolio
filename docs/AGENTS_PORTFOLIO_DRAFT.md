# AGENTS.md — DRAFT (ADAPT AFTER REPOSITORY AUDIT)

> Template usulan, bukan instruksi untuk langsung menimpa `AGENTS.md` existing. Lengkapi bagian TBD setelah inspeksi repository dan dapatkan persetujuan pemilik.

## Context
- Project: Existing personal portfolio website, public frontend, backend/API, and admin panel.
- Actual tech stack: **TBD — verify from manifests/configuration**.
- Repository structure and critical entry points: **TBD**.
- Approved decisions, API contracts, and relevant docs: **TBD**.
- Working language for user-facing reports: Bahasa Indonesia.

## Operating workflow
1. Read repository instructions and relevant docs before editing.
2. Begin with read-only audit and inspect `git status`, `git branch --show-current`, and `git diff` (no mutative Git operations).
3. Categorize: KEEP / FIX / REFACTOR / BUILD / DEFER; distinguish FACT, PROPOSED, APPROVED, OPEN, BLOCKED.
4. Propose one scoped subtask with rationale, touched files, acceptance criteria, tests, and risk. Wait for explicit approval for implementation.
5. Make narrow changes, preserve backward compatibility and existing working UX, then verify and report honestly.
6. Stop at the checkpoint; do not automatically proceed through multiple milestones.

## Code standards
- Follow established conventions and framework idioms rather than forcing a new stack.
- Clear names, small cohesive modules, separation of concerns, one source of truth, no copy-paste logic.
- Reuse only where useful; avoid premature abstraction and unnecessary dependencies.
- Favor semantic HTML, accessible focus/keyboard behavior, labels, alternative text, and appropriate UI states.
- Comments explain *why*, invariants, non-obvious trade-offs, and constraints; do not narrate obvious code.
- Avoid magic numbers, fragile absolute positioning, z-index patches, stale comments, dead code, and unused imports.
- For animations support reduced motion and test layout stability, touch and keyboard where relevant.
- Do not rewrite working functionality or change visual identity without authorization.

## Security
- Treat all external input as untrusted; enforce validation and authorization on server-side boundaries.
- Review auth/session, access control, XSS/injection/CSRF as relevant, rate limits, upload handling, spam/bot controls, and dependencies based on actual threat model.
- Never expose or commit credentials, tokens, private keys, `.env`, private content, or sensitive logs.
- Never target production with intrusive security testing without authorization.

## Approval gates
No dependency/framework switch, Tailwind migration, DB migration, destructive file/data operation, secret change, production access, deployment, or mutative Git action (`add`, `commit`, `push`, `merge`, `reset`, `rebase`, `checkout`, `switch`, `stash`, `clean`) without explicit permission. Read-only audit does not imply modification permission.

## Verification and reporting
- Relevant validation: format, lint, typecheck, tests, build, responsive, accessibility, performance, security, regression, as applicable.
- Report exact commands and results using PASS / FAIL / NOT RUN / NOT VERIFIED; never fabricate test evidence.
- Summarize why changed, files affected, contracts preserved, risks, outstanding items and next checkpoint.
- Milestone is DONE only after acceptance criteria and verification are satisfied.

## Project-specific settings to fill after audit
- Frontend directory and commands: **TBD**
- Backend directory and commands: **TBD**
- Admin directory and commands: **TBD**
- Shared UI or styles: **TBD**
- Package manager: **TBD**
- Test/build/lint/typecheck commands: **TBD**
- Environment and deployment distinctions: **TBD**
- API/auth/data contracts: **TBD**
- Existing design tokens and animation conventions: **TBD**
- Repo-specific prohibited/approved changes: **TBD**
