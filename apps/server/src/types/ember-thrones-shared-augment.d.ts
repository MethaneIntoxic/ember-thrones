declare module "@ember-thrones/shared" {
  export {
    applyFreeQuestRetrigger,
    applyStanceWinModifier,
    bonusSessionActionRequestSchema,
    collectBonusSessionJackpotTiers,
    consumeFreeQuestSpin,
    createFreeQuestState,
    getFreeQuestRetriggerChance,
    rollFreeQuestRetrigger,
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
    type FreeQuestStance,
    type FreeQuestState,
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

  export {
    applyFreeQuestRetrigger,
    applyStanceWinModifier,
    consumeFreeQuestSpin,
    createFreeQuestState,
    getFreeQuestRetriggerChance,
    rollFreeQuestRetrigger,
    type FreeQuestStance,
    type FreeQuestState,
  } from "../../../../packages/shared/dist/domain/features/freeQuest.js";

  export {
    evaluatePaylines,
    DEFAULT_PAYLINES,
    PAYOUT_TABLE,
    SCATTER_PAYOUT_MULTIPLIERS,
    type PayableSymbol,
    type LinePattern,
    type LineWin,
    type PayoutResult,
  } from "../../../../packages/shared/dist/domain/payout.js";

  export {
    REEL_COUNT,
    ROW_COUNT,
    SLOT_SYMBOLS,
    MEDIUM_REEL_COMPOSITIONS,
    MEDIUM_REEL_STRIPS,
    generateSpin,
    generateSpinFromSeed,
    countSymbol,
    listSymbolPositions,
    positionToReelRow,
    symbolAtPosition,
    toRows,
    type SlotSymbol,
    type ReelColumn,
    type SpinColumns,
    type ReelStops,
    type SpinGrid,
  } from "../../../../packages/shared/dist/domain/reels.js";
}