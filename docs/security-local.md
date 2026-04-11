# Security - Local Runtime

## Trust Model
- Server remains authoritative for spin outcomes.
- Client displays outcomes and handles UI only.
- Signed payload protects response integrity.

## Implemented Controls
- HMAC signature per spin outcome payload.
- Replay guard using nonce with TTL.
- Route-level validation through shared schemas.

## Pending Controls
- Atomic DB transaction for wallet/spin/jackpot update consistency.
- Save-state checksum endpoint for additional tamper detection.

## Incident Handling
- If signature mismatch appears, reject state update and require resync.
- If nonce reuse detected, reject request and log telemetry event.
