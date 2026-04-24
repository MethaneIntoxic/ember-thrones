export * from "./contracts/api";
export * from "./contracts/events";
export * from "./domain/rng";
export { collectBonusSessionJackpotTiers } from "./contracts/api";
export type {
  BonusActionRecord,
  BonusActionType,
  BonusAdvanceActionType,
  BonusJackpotAward,
  BonusOutcome,
  BonusPayload,
  BonusProgress,
  BonusSessionRecord,
  BonusSessionReference,
  BonusSessionStatus,
  BonusType,
  EmberLockStateContract,
  FreeGameSpinReveal,
  FreeGamesModifierId,
  FreeGamesProgress,
  FreeGamesStateContract,
  GameVariant,
  HoldAndSpinProgress,
  HoldAndSpinStateContract,
  JackpotConfig,
  JackpotTier,
  OrbLanding,
  OrbTriggerConfig,
  ScatterTriggerConfig,
  SpinRequest,
  SpinResult
} from "./contracts/api";
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
  toRows
} from "./domain/reels";
export type { ReelColumn, ReelStops, SpinColumns, SpinGrid } from "./domain/reels";
export {
  DEFAULT_PAYLINES,
  PAYOUT_TABLE,
  SCATTER_PAYOUT_MULTIPLIERS,
  evaluatePaylines
} from "./domain/payout";
export type { LinePattern, PayoutResult, PayableSymbol } from "./domain/payout";
export {
  EMBER_LOCK_GRID_SIZE,
  EMBER_LOCK_MIN_ORBS,
  EMBER_LOCK_RESPINS,
  JACKPOT_TIERS,
  DEFAULT_JACKPOT_VALUES,
  isEmberLockTriggered,
  initializeEmberLock,
  stepEmberLock,
  rollOrbLanding,
  generateRespinLandings,
  resolveEmberLockWin
} from "./domain/features/emberLock";
export type { EmberLockResolution, EmberLockState } from "./domain/features/emberLock";
export {
  resolveEmberRespinCollectorLock,
  resolveEmberRespin,
  summarizeEmberJackpotHits
} from "./domain/features/emberRespinCollectorLock";
export type {
  ResolveEmberRespinCollectorLockInput,
  ResolveEmberRespinInput
} from "./domain/features/emberRespinCollectorLock";
export {
  FREE_QUEST_BASE_SPINS,
  FREE_QUEST_MAX_SPINS,
  FREE_QUEST_STANCES,
  FREE_QUEST_TRIGGER_SCATTERS,
  MEDIUM_STANCE_MODIFIERS,
  MEDIUM_VOLATILITY_PROFILE,
  isFreeQuestTriggered,
  calculateInitialFreeQuestSpins,
  createFreeQuestState,
  getFreeQuestRetriggerChance,
  rollFreeQuestRetrigger,
  applyFreeQuestRetrigger,
  consumeFreeQuestSpin,
  applyStanceWinModifier
} from "./domain/features/freeQuest";
export type { FreeGamesModifier, FreeQuestState, FreeQuestStance } from "./domain/features/freeQuest";
export {
  resolveCelestialWheelAscension,
  resolveWheelAscension
} from "./domain/features/celestialWheelAscension";
export type {
  ResolveCelestialWheelAscensionInput,
  ResolveWheelAscensionInput
} from "./domain/features/celestialWheelAscension";
export { resolveRelicVaultPick, resolveVaultPick } from "./domain/features/relicVaultPick";
export type { ResolveRelicVaultPickInput, ResolveVaultPickInput } from "./domain/features/relicVaultPick";
export * from "./domain/features/bonusSession";
export * from "./domain/sim/reportSchema";
export * from "./domain/sim/simulator";
