# Game Design - Ember Thrones

## Pillars
- Dragon-themed high-drama slot experience with premium presentation.
- Server-authoritative connected runtime for spins, bonuses, jackpots, and claims.
- Explicit demo disclosure for static Pages builds.
- Three reel-triggered premium bonuses anchored to the reel result.
- Four-tier jackpot ladder always visible.
- Free Quest retrigger loop as a secondary feature layer.

## Runtime Model
- Connected app: spins settle on the server, bonus sessions are durable and resumable, and jackpot claims are authoritative.
- GitHub Pages demo: spins resolve locally for showcase purposes, with no live event stream or queue replay.

## Core Loop
1. Bootstrap runtime capabilities and wallet state.
2. Place bet and spin.
3. Resolve paylines and trigger flags.
4. Reserve a bonus session when a reel-triggered premium feature lands.
5. Present and advance the feature through authoritative state transitions or disclosed demo behavior.
6. Claim awards, then update wallet, jackpots, progression, and telemetry.

## Feature Set
- Ember Respin: collector-lock hold-and-respin feature triggered by dense orb landings.
- Wheel Ascension: reel-triggered second-screen wheel feature with repeatable stop reveals.
- Relic Vault: key-based reveal chamber tied to reel outcome and jackpot emblems.
- Free Quest: secondary scatter-driven retrigger loop.

## Design Constraints
- Bonus outcomes are seeded at trigger time and then revealed through presentation.
- Bonus sessions must survive refresh or reconnect in the connected runtime.
- Demo builds must never imply live event, queue replay, or authoritative recovery behavior they do not support.
- Arcade-style mini-games are retired; all premium features are reel-authentic and jackpot-aware.
- Feature cadence and balance are validated through shared simulation gates.
