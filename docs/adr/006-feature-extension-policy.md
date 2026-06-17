# ADR-006 — Feature Extension Policy

**Status:** Accepted
**Date:** 2026-04-25

---

## Context

As features are added, the natural instinct is to grow existing use cases (`RelayMessage`, `CreateSession`) to accommodate new behavior. ADR-004 prevents infrastructure leakage technically, but teams need an explicit policy for *how* to add features — not just what is forbidden.

Without this, "small additions" accumulate inside use cases until they become impossible to test or reason about in isolation.

---

## Decision

Every new feature must pass this gate before any code is written:

| Question | If YES |
|---|---|
| Does it change the wire protocol? | Update `shared/contracts/v1/` first (or create `v2/` if breaking). Commit before implementation. |
| Does it change domain rules? | Add or modify a policy in `core/policies/`. |
| Does it change or add behavior? | Add a **new** use case in `application/use-cases/`. Never modify an existing use case. |
| Does it need new infrastructure? | Add a new adapter in `adapters/`. Wire only in `entrypoints/container.ts`. |
| Does it cross architectural boundaries in a new way? | Write an ADR first. No implementation without it. |

**Binding rule:** No feature may be implemented by editing an existing use case to "also handle" new behavior. Features are additive only. Existing use cases are **open for extension via events, closed for modification**.

This applies even to "small" changes. A new condition inside `RelayMessage` is a new use case that calls `RelayMessage` internally, not an edit to `RelayMessage`.

---

## Consequences

**Positive:**
- Existing use cases remain stable and testable.
- Features are independently deployable and testable.
- Architectural violations are detectable at review time (new import, not an edit).

**Negative:**
- Small behavior changes require more files than a direct edit would.
- Judgment is required to decide when something is "new behavior" vs. a bug fix.
