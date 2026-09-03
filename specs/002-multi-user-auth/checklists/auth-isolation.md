# Requirements checklist: Multi-user auth (domain)

**Purpose**: Unit tests for English requirements  
**Created**: 2026-09-03  
**Feature**: [spec.md](../spec.md)

## Auth & access

- [x] Is it defined which endpoints stay public?
- [x] Is unauthenticated behavior specified (401)?
- [x] Are seed admin credentials documented?
- [x] Is role difference (admin vs operator) explicit?

## Isolation

- [x] Are all tenant-owned resources listed (batches, runs, presence, screenshots, emails)?
- [x] Is cross-user access result specified (404)?
- [x] Is migration of legacy data specified?

## Concurrency

- [x] Is “concurrent” defined as multi-user, one-run-per-user?
- [x] Is same-user multi-extension race called out?
- [x] Is extension-online scoped per user?

## Out of scope

- [x] SSO/password-reset excluded?
- [x] Cross-tenant admin browser deferred?
- [x] Same-tab messaging deferred?

## Consistency

- [x] Spec ↔ plan ↔ tasks agree on per-user lock
- [x] Spec ↔ contracts agree on new `/users` admin APIs
- [x] Quickstart credentials match seed table
