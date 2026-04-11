# Math Model

## Volatility
- Selected profile: medium.
- Target RTP operating band: 92-96%.
- Recommended live target: 95.0%.

## Feature Constraints
- Ember Lock trigger condition: at least 6 orb symbols.
- Ember Lock respins: starts at 3 and resets to 3 on new orb landing.
- Free Quest retrigger model uses bounded probability to prevent runaway loops.

## Simulation
- Simulation entry point: tools/sim/run-sim.ts.
- Shared simulation function: runSpinSimulation in shared domain.
- Required release evidence: >= 1,000,000 spins per profile with summary report.

## Jackpot Rails
- Tiers: ember, relic, mythic, throne.
- Contribution and payout rails are bounded to avoid economic blowout.
