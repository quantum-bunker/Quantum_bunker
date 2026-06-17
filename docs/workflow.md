# Branch Map & CI/CD Workflow

## Branch Strategy

```
main      ← production; protected; no direct commits; linear history required
staging   ← pre-release smoke + integration gate
develop   ← active development; all features merge here first
feature/* ← one feature/fix per branch; PRs target develop
```

Branch creation order:
- `develop` from `main`
- `staging` from `main`
- `feature/<name>` from `develop`

---

## Merge Flow

```
feature/* → develop → staging → main
```

- **feature → develop**: Squash merge. PR title must use a prefix: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`
- **develop → staging**: Merge commit (preserves history for smoke + release audit)
- **staging → main**: Merge commit; triggers production deploy after all checks pass

---

## CI Jobs

| Job | Triggered by | What it runs |
|---|---|---|
| `ci-quick` | All PRs to develop; develop push | Install, lint (`tsc --noEmit`), typecheck, unit tests |
| `ci-integration` | develop push; staging push | HTTP route tests, WS adapter tests, store tests, expiry/reconnect |
| `ci-e2e-relay` | staging push; main push | Create session, 2 peers connect, send/receive, full-session reject, expired-session reject |
| `ci-smoke` | staging push; main push | Server boots, `/health` responds, session creation succeeds |
| `deploy` | main push (via Environment gates); staging push | Deploy to production (main) or staging environment |

---

## Required Checks per Branch

| Branch | Required checks |
|---|---|
| `develop` | `ci-quick`, `ci-integration` |
| `staging` | `ci-quick`, `ci-integration`, `ci-e2e-relay`, `ci-smoke` |
| `main` | `ci-quick`, `ci-integration`, `ci-e2e-relay`, `ci-smoke` |

---

## Branch Protection Rules (GitHub Rulesets)

**`main`:**
- Require PR
- Require status checks (all 4 CI jobs)
- Require conversation resolution
- Block force pushes
- Block deletion
- Require linear history

**`staging`:**
- Require PR
- Require status checks
- Require conversation resolution
- Block force pushes
- Block deletion

**`develop`:**
- Require PR
- Require status checks
- Block force pushes
- Block deletion

---

## Environments

| Environment | Allowed branch | Purpose |
|---|---|---|
| `staging` | `staging` only | Pre-production; smoke-tested; may spin down on idle |
| `production` | `main` only | Live; full CI gate before deploy |

Note: Free hosting tiers (Render, Railway free) spin down after ~15 min idle. These are suitable for staging/demo but not production.

---

## Review Policy

- **Solo development**: Require PR, 0 required reviewers. The CI gate is the quality bar.
- **Community contributions**: Require 1 approving review on `main` and `staging`.

---

## PR Conventions

PR title format: `<prefix>: <short description>`

| Prefix | Use for |
|---|---|
| `feat:` | New feature |
| `fix:` | Bug fix |
| `refactor:` | Code change with no behavior change |
| `test:` | Tests only |
| `docs:` | Documentation only |
| `chore:` | Build, CI, dependency updates |

PR body should include:
- What changed and why
- Testing done
- Any breaking changes or migration notes
