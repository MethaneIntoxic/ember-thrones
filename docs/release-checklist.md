# Release Checklist

## Build and Test Gates
- [ ] npm run build passes at workspace level.
- [ ] npm run test passes at workspace level.
- [ ] Simulation report produced for target spin count.
- [ ] No P0/P1 defects open.

## Style Fidelity Gates
- [ ] Ember Lock core loop verified in manual QA.
- [ ] Free Quest retrigger verified in manual QA.
- [ ] Jackpot ladder permanently visible in all layouts.
- [ ] Dragon-style animation and audio pass review.

## Platform Gates
- [ ] Desktop launch flow validated.
- [ ] Mobile viewport controls validated.
- [ ] PWA install and relaunch validated.
- [ ] Offline cache behavior validated.

## Security Gates
- [ ] Outcome signature verification path validated.
- [ ] Replay guard validated with nonce replay test.
- [ ] Persistence rollback scenario tested.

## Go/No-Go
- [ ] All gates green.
- [ ] Rollback build available.
- [ ] Stabilization owner assigned.
