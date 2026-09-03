# Tasks: Multi-user auth & tenant isolation

**Feature**: `specs/002-multi-user-auth`  
**Status**: Implemented (no roles — all users equal)

## Phase 1 — Setup

- [x] T001 Document `AUTH_REQUIRED=true` + seed creds in `.env.example` / context
- [x] T002 Seed `admin@example.com` + `user@example.com` (equal users; no roles)

## Phase 2 — Foundational schema & auth

- [x] T003–T008 `user_id` on batches/runs, ExtensionPresence table, AUTH_REQUIRED default true, ownership helpers

## Phase 3 — API ownership

- [x] T009–T012 Batches/rows/emails scoped; isolation tests

## Phase 4 — Per-user runs

- [x] T013–T015 Per-user lock/presence; concurrent + cross-claim 404 tests

## Phase 5 — Dashboard + extension

- [x] T016–T019 Dashboard login + token bridge; extension Bearer + 401 clear

## Phase 6 — Polish

- [x] T020–T022 Docs + pytest green (34 passed)
