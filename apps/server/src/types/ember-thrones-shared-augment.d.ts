declare module "@ember-thrones/shared" {
  export {
    bonusSessionActionRequestSchema,
    collectBonusSessionJackpotTiers,
    type BonusActionRecord,
    type BonusActionType,
    type BonusAdvanceActionType,
    type BonusJackpotAward,
    type BonusOutcome,
    type BonusPayload,
    type BonusProgress,
    type BonusSessionRecord,
    type BonusSessionReference,
    type BonusSessionStatus,
    type BonusType,
    type EmberRespinProgress,
    type JackpotTier,
    type OrbLanding,
    type RelicVaultBoardStateSlot,
    type RelicVaultProgress,
    type WheelAscensionProgress,
  } from "../../../../packages/shared/dist/contracts/api.js";

  export {
    resolveCelestialWheelAscension,
    type ResolveCelestialWheelAscensionInput,
  } from "../../../../packages/shared/dist/domain/features/celestialWheelAscension.js";

  export {
    resolveEmberRespinCollectorLock,
    type ResolveEmberRespinCollectorLockInput,
  } from "../../../../packages/shared/dist/domain/features/emberRespinCollectorLock.js";

  export {
    resolveRelicVaultPick,
    type ResolveRelicVaultPickInput,
  } from "../../../../packages/shared/dist/domain/features/relicVaultPick.js";
}