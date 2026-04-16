# Release Checklist

## Build and Test Gates
- [ ] npm run build passes at workspace level.
- [ ] npm run test passes at workspace level.
- [ ] npm run lint passes where lint scripts exist.
- [ ] npm run sim passes for the shared cadence gate.
- [ ] No P0/P1 defects open.

## Connected Runtime Gates
- [ ] Authoritative spin flow validated against the local server.
- [ ] Bonus reserve, resume, step, and claim flows validated after refresh or reconnect.
- [ ] Queue replay validated when API access drops and returns.
- [ ] Runtime status messaging stays truthful while SSE reconnects or becomes unavailable.

## Demo and Pages Gates
- [ ] GitHub Pages build loads with the correct repo subpath.
- [ ] Demo runtime disclosure is visible and accurate.
- [ ] Pages build never implies live events or queue replay.
- [ ] PWA install, relaunch, and update flow validated.

## Experience Gates
- [ ] Ember Respin, Wheel Ascension, and Relic Vault overlays render without layout collisions.
- [ ] Free Quest secondary loop still behaves correctly.
- [ ] Jackpot ladder remains visible in all supported layouts.
- [ ] Audio, FX, and reel-land timing pass subjective review.
- [ ] Mobile viewport controls validated.

## Security Gates
- [ ] Outcome signature verification path validated.
- [ ] Replay guard validated with nonce replay test.
- [ ] Bonus action journaling persists ordered lifecycle history.
- [ ] Persistence rollback scenario tested.

## Go/No-Go
- [ ] All gates green.
- [ ] Rollback build available.
- [ ] Stabilization owner assigned.
