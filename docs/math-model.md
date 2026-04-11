# Math Model

## Volatility
- Selected profile: medium.
- Target RTP operating band: 92-96%.
- Recommended live target: 95.0%.

## Feature Constraints
- Ember Lock trigger condition: at least 6 orb symbols.
- Wheel Ascension trigger condition: at least 4 scatter symbols and at least 1 dragon symbol.
- Relic Vault trigger condition: at least 4 dragon symbols and at least 2 wild symbols.
- Ember Lock respins: starts at 3 and resets to 3 on new orb landing.
- Free Quest retrigger model uses bounded probability to prevent runaway loops.

## Simulation
- Simulation entry point: tools/sim/run-sim.ts.
- Reel-trigger cadence entry point: tools/sim/run-bonus-cadence.ts.
- Shared simulation function: runSpinSimulation in shared domain.
- Required release evidence: >= 1,000,000 spins per profile with summary report.

## Cadence Tuning Snapshot (Server-Driven)
- Baseline (before tuning), medium profile, 50,000 spins:
	- Ember: 0.126% (1 in 793.65)
	- Wheel: 4.554% (1 in 21.96)
	- Relic: 26.804% (1 in 3.73)
	- Any reel-triggered bonus: 30.104% (1 in 3.32)
- Tuned (current), measured at 100,000 spins per profile:
	- Low:
		- Ember: 0.004% (1 in 25,000)
		- Wheel: 0.415% (1 in 240.96)
		- Relic: 0.178% (1 in 561.80)
		- Any reel-triggered bonus: 0.597% (1 in 167.50)
	- Medium:
		- Ember: 0.125% (1 in 800.00)
		- Wheel: 0.907% (1 in 110.25)
		- Relic: 0.679% (1 in 147.28)
		- Any reel-triggered bonus: 1.705% (1 in 58.65)
	- High:
		- Ember: 0.686% (1 in 145.77)
		- Wheel: 1.867% (1 in 53.56)
		- Relic: 2.197% (1 in 45.52)
		- Any reel-triggered bonus: 4.737% (1 in 21.11)

## Notes
- This tuning pass intentionally reduced over-triggering from relic-heavy states to restore anticipation and spacing between high-impact bonus sessions.
- Free Quest remains on a separate cadence track (scatter >= 3) and is not counted in the reel-triggered bonus cadence above.

## Jackpot Rails
- Tiers: ember, relic, mythic, throne.
- Contribution and payout rails are bounded to avoid economic blowout.
