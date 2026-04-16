# Ember Thrones Historical Start-to-Ship TODOs

This checklist is historical context for the original prototype program.
It has been superseded by the current product direction: authoritative reel-triggered bonuses, explicit connected-versus-demo runtime channels, and retirement of the old mini-game plan.

## Phase 0 - Program Guardrails
- [x] Lock volatility profile to medium.
- [x] Lock art direction to dragon-style original expression.
- [x] Lock mini-game scope to all three.
- [x] Define Dragon Link-style acceptance gates.

## Phase 1 - Foundations
- [x] Create monorepo with client, server, and shared packages.
- [x] Add workspace scripts for dev/build/test/simulation.
- [x] Implement shared API contracts and domain model schemas.
- [x] Add deterministic RNG and simulation runner.

## Phase 2 - Vertical Slice
- [x] Implement server-authoritative spin endpoint.
- [x] Implement client spin flow calling local API.
- [x] Render reels and win states in Pixi stage.
- [x] Persist profile and wallet state in SQLite.

## Phase 3 - Core Mechanics
- [x] Implement payline evaluator and base payout logic.
- [x] Implement Ember Lock trigger and respin reset-to-3 loop.
- [x] Implement Free Quest trigger and retrigger mechanics.
- [x] Implement jackpot ladder rails and state updates.

## Phase 4 - Mini-Games and Progression
- [x] Implement Lantern Pick deterministic resolver and UI.
- [x] Implement Sky Path deterministic resolver and UI.
- [x] Implement Wyrm Duel deterministic resolver and UI.
- [x] Integrate mini-game rewards into progression loop tuning pass.

## Phase 5 - Platform and Offline
- [x] Add PWA manifest and service worker.
- [x] Add offline queue helper and reconnect replay path.
- [x] Add versioned update toast and forced refresh UX.
- [x] Add install prompt UX flow.

## Phase 6 - Security and Hardening
- [x] Add spin outcome signing utility.
- [x] Add replay nonce guard.
- [x] Add atomic DB transaction around spin + wallet + jackpot writes.
- [x] Add save-state integrity checksum route.

## Phase 7 - QA and Release
- [x] Add unit tests for shared domain modules.
- [x] Add server route integration tests.
- [x] Add client unit tests for platform utilities.
- [x] Add end-to-end flow tests (spin -> bonus -> mini-game -> resume).
- [x] Add long-run simulation report threshold assertions.
- [x] Add release checklist execution notes and go/no-go signoff.

## In Progress Next
- [x] Complete docs pack and release playbook.
- [x] Finalize platform packaging scripts for desktop/mobile.
