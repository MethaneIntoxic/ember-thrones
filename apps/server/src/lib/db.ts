import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { BonusJackpotAward, BonusSessionStatus, JackpotTier } from "@ember-thrones/shared";
import {
  DEFAULT_MATH_PROFILE_VERSION,
  DEFAULT_MATH_PROFILE_VERSION_ID,
  JACKPOT_RESET_AMOUNTS,
  resolveWagerSelection,
  type BonusFeatureShell,
  type MathProfileVersionRecord,
  type ServerBonusActionType,
  type ServerBonusOutcome,
  type ServerBonusProgress,
  type ServerBonusType,
  type VolatilityPreset,
  type WagerProfile,
} from "./slotRuntime.js";

export interface ProfileRecord {
  id: string;
  nickname: string;
  level: number;
  xp: number;
  coins: number;
  gems: number;
  lifetimeSpins: number;
  lifetimeWins: number;
  createdAt: string;
  updatedAt: string;
}

export interface WalletState {
  coins: number;
  gems: number;
  lifetimeSpins: number;
  lifetimeWins: number;
}

export interface SessionRecord {
  id: string;
  profileId: string;
  volatility: VolatilityPreset;
  state: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SpinPersistInput {
  id: string;
  sessionId: string;
  profileId: string;
  bet: number;
  totalWin: number;
  payload: Record<string, unknown>;
  wager: WagerProfile;
  mathProfileVersionId: string;
}

export interface SpinRecord {
  id: string;
  sessionId: string;
  profileId: string;
  bet: number;
  totalWin: number;
  payload: Record<string, unknown>;
  wager: WagerProfile;
  mathProfileVersionId: string;
  createdAt: string;
}

export interface JackpotRecord {
  tier: JackpotTier;
  amount: number;
  updatedAt: string;
}

export type JackpotEventType = "RESERVED" | "CLAIMED";

export interface JackpotEventRecord {
  id: string;
  tier: JackpotTier;
  eventType: JackpotEventType;
  amount: number;
  profileId: string | null;
  sessionId: string | null;
  spinId: string | null;
  bonusSessionId: string | null;
  mathProfileVersionId: string | null;
  createdAt: string;
}

export interface ProfileBootstrap {
  id: string;
  nickname: string;
  level?: number;
  xp?: number;
  coins?: number;
  gems?: number;
}

export interface WalletDelta {
  coinsDelta?: number;
  gemsDelta?: number;
  spinsDelta?: number;
  winsDelta?: number;
}

export interface JackpotEventPersistInput {
  tier: JackpotTier;
  eventType: JackpotEventType;
  amount: number;
  profileId?: string;
  sessionId?: string;
  spinId?: string;
  bonusSessionId?: string;
  mathProfileVersionId?: string;
}

export interface AtomicSpinCommitInput {
  spin: SpinPersistInput;
  walletDelta: WalletDelta;
  sessionState: Record<string, unknown>;
  jackpotContributionBet: number;
  jackpotPayoutTier?: JackpotTier;
  jackpotPayoutTiers?: JackpotTier[];
  bonusSession?: BonusSessionCreateInput;
  jackpotEvents?: JackpotEventPersistInput[];
}

export interface SessionUpsertInput {
  id: string;
  profileId: string;
  volatility?: VolatilityPreset;
  state?: Record<string, unknown>;
}

export interface BonusSessionRecord {
  id: string;
  spinId: string;
  sessionId: string;
  profileId: string;
  type: ServerBonusType;
  status: BonusSessionStatus;
  revealSeed: string;
  expectedTotalAward: number;
  actualAward: number;
  jackpotTiersHit: JackpotTier[];
  jackpotAwards: BonusJackpotAward[];
  outcome: ServerBonusOutcome;
  progress: ServerBonusProgress;
  mathProfileVersionId: string;
  entrySnapshot: BonusFeatureShell;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  claimedAt: string | null;
}

export interface BonusSessionCreateInput {
  id: string;
  spinId: string;
  sessionId: string;
  profileId: string;
  type: ServerBonusType;
  status: BonusSessionStatus;
  revealSeed: string;
  expectedTotalAward: number;
  actualAward: number;
  jackpotTiersHit: JackpotTier[];
  jackpotAwards: BonusJackpotAward[];
  outcome: ServerBonusOutcome;
  progress: ServerBonusProgress;
  mathProfileVersionId: string;
  entrySnapshot: BonusFeatureShell;
}

export interface BonusActionRecord {
  id: string;
  bonusSessionId: string;
  actionType: ServerBonusActionType;
  ordinal: number;
  requestPayload: Record<string, unknown>;
  resultPayload: Record<string, unknown>;
  createdAt: string;
}

export interface BonusSessionActionCommitInput {
  bonusSessionId: string;
  actionType: ServerBonusActionType;
  requestPayload: Record<string, unknown>;
  resultPayload: Record<string, unknown>;
  progress: ServerBonusProgress;
  status: BonusSessionStatus;
  actualAward: number;
  walletDelta?: WalletDelta;
  jackpotEvents?: JackpotEventPersistInput[];
}

export interface BonusSessionActionCommitResult {
  session: BonusSessionRecord;
  action: BonusActionRecord;
  wallet: WalletState | null;
}

type ProfileRow = {
  id: string;
  nickname: string;
  level: number;
  xp: number;
  coins: number;
  gems: number;
  lifetime_spins: number;
  lifetime_wins: number;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  profile_id: string;
  volatility: VolatilityPreset;
  state_json: string;
  created_at: string;
  updated_at: string;
};

type SpinRow = {
  id: string;
  session_id: string;
  profile_id: string;
  bet: number;
  total_win: number;
  payload_json: string;
  wager_json: string | null;
  math_profile_version_id: string | null;
  created_at: string;
};

type JackpotRow = {
  tier: JackpotTier;
  amount: number;
  updated_at: string;
};

type BonusSessionRow = {
  id: string;
  spin_id: string;
  session_id: string;
  profile_id: string;
  type: ServerBonusType;
  status: BonusSessionStatus;
  reveal_seed: string;
  expected_total_award: number;
  actual_award: number;
  jackpot_tiers_json: string;
  jackpot_awards_json: string;
  outcome_json: string;
  progress_json: string;
  math_profile_version_id: string | null;
  entry_snapshot_json: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  claimed_at: string | null;
};

type BonusActionRow = {
  id: string;
  bonus_session_id: string;
  action_type: ServerBonusActionType;
  ordinal: number;
  request_payload_json: string;
  result_payload_json: string;
  created_at: string;
};

type JackpotEventRow = {
  id: string;
  tier: JackpotTier;
  event_type: JackpotEventType;
  amount: number;
  profile_id: string | null;
  session_id: string | null;
  spin_id: string | null;
  bonus_session_id: string | null;
  math_profile_version_id: string | null;
  created_at: string;
};

type MathProfileVersionRow = {
  id: string;
  profile_key: string;
  version_tag: string;
  reel_set_id: string;
  checksum: string;
  description: string;
  created_at: string;
};

const defaultEntrySnapshot = (type: ServerBonusType): BonusFeatureShell => ({
  type,
  mode: "server-owned",
  nextAction: "CLAIM",
  totalRounds: 0,
  roundsRemaining: 0,
  intro: "Migrated bonus session shell",
  progressiveQualified: {
    grand: false,
    featureBoost: false,
  },
  entryState: {},
});

const defaultFreeGamesOutcome: ServerBonusOutcome = {
  type: "FREE_GAMES",
  gameVariantId: "dragon-link-flagship",
  modifierId: "ROYALS_REMOVED",
  initialGames: 0,
  totalAwardedGames: 0,
  retriggerCount: 0,
  steps: [],
  finalAward: 0
};

const defaultFreeGamesProgress: ServerBonusProgress = {
  type: "FREE_GAMES",
  spinCursor: 0,
  totalSpins: 0,
  revealedSpins: [],
  runningAward: 0,
  retriggerCount: 0,
  gamesRemaining: 0,
  completed: true,
  claimed: false,
  nextAction: "CLAIM"
};

const parseJsonObject = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const toProfileRecord = (row: ProfileRow): ProfileRecord => ({
  id: row.id,
  nickname: row.nickname,
  level: row.level,
  xp: row.xp,
  coins: row.coins,
  gems: row.gems,
  lifetimeSpins: row.lifetime_spins,
  lifetimeWins: row.lifetime_wins,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toSessionRecord = (row: SessionRow): SessionRecord => ({
  id: row.id,
  profileId: row.profile_id,
  volatility: row.volatility,
  state: parseJsonObject<Record<string, unknown>>(row.state_json, {}),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toSpinRecord = (row: SpinRow): SpinRecord => ({
  id: row.id,
  sessionId: row.session_id,
  profileId: row.profile_id,
  bet: row.bet,
  totalWin: row.total_win,
  payload: parseJsonObject<Record<string, unknown>>(row.payload_json, {}),
  wager: parseJsonObject<WagerProfile>(row.wager_json, resolveWagerSelection({ bet: row.bet })),
  mathProfileVersionId: row.math_profile_version_id ?? DEFAULT_MATH_PROFILE_VERSION_ID,
  createdAt: row.created_at,
});

const toJackpotRecord = (row: JackpotRow): JackpotRecord => ({
  tier: row.tier,
  amount: row.amount,
  updatedAt: row.updated_at,
});

const toBonusSessionRecord = (row: BonusSessionRow): BonusSessionRecord => ({
  id: row.id,
  spinId: row.spin_id,
  sessionId: row.session_id,
  profileId: row.profile_id,
  type: row.type,
  status: row.status,
  revealSeed: row.reveal_seed,
  expectedTotalAward: row.expected_total_award,
  actualAward: row.actual_award,
  jackpotTiersHit: parseJsonObject<JackpotTier[]>(row.jackpot_tiers_json, []),
  jackpotAwards: parseJsonObject<BonusJackpotAward[]>(row.jackpot_awards_json, []),
  outcome: parseJsonObject<ServerBonusOutcome>(row.outcome_json, defaultFreeGamesOutcome),
  progress: parseJsonObject<ServerBonusProgress>(row.progress_json, defaultFreeGamesProgress),
  mathProfileVersionId: row.math_profile_version_id ?? DEFAULT_MATH_PROFILE_VERSION_ID,
  entrySnapshot: parseJsonObject<BonusFeatureShell>(row.entry_snapshot_json, defaultEntrySnapshot(row.type)),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  completedAt: row.completed_at,
  claimedAt: row.claimed_at,
});

const toBonusActionRecord = (row: BonusActionRow): BonusActionRecord => ({
  id: row.id,
  bonusSessionId: row.bonus_session_id,
  actionType: row.action_type,
  ordinal: row.ordinal,
  requestPayload: parseJsonObject<Record<string, unknown>>(row.request_payload_json, {}),
  resultPayload: parseJsonObject<Record<string, unknown>>(row.result_payload_json, {}),
  createdAt: row.created_at,
});

const toJackpotEventRecord = (row: JackpotEventRow): JackpotEventRecord => ({
  id: row.id,
  tier: row.tier,
  eventType: row.event_type,
  amount: row.amount,
  profileId: row.profile_id,
  sessionId: row.session_id,
  spinId: row.spin_id,
  bonusSessionId: row.bonus_session_id,
  mathProfileVersionId: row.math_profile_version_id,
  createdAt: row.created_at,
});

const toMathProfileVersionRecord = (row: MathProfileVersionRow): MathProfileVersionRecord => ({
  id: row.id,
  profileKey: row.profile_key,
  versionTag: row.version_tag,
  reelSetId: row.reel_set_id,
  checksum: row.checksum,
  description: row.description,
  createdAt: row.created_at,
});

export class ServerDb {
  private readonly db: Database.Database;

  public constructor(filePath: string) {
    if (filePath !== ":memory:") {
      mkdirSync(dirname(filePath), { recursive: true });
    }

    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.initializeSchema();
    this.seedJackpots();
    this.seedMathProfileVersion();
  }

  public close(): void {
    this.db.close();
  }

  public ensureProfile(input: ProfileBootstrap): ProfileRecord {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO profiles (
          id, nickname, level, xp, coins, gems, lifetime_spins, lifetime_wins, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
      `,
      )
      .run(
        input.id,
        input.nickname,
        input.level ?? 1,
        input.xp ?? 0,
        input.coins ?? 50_000,
        input.gems ?? 0,
        now,
        now,
      );

    const profile = this.getProfile(input.id);
    if (!profile) {
      throw new Error("Failed to ensure profile record");
    }

    return profile;
  }

  public getProfile(profileId: string): ProfileRecord | null {
    const row = this.db
      .prepare("SELECT * FROM profiles WHERE id = ?")
      .get(profileId) as ProfileRow | undefined;

    return row ? toProfileRecord(row) : null;
  }

  public getWallet(profileId: string): WalletState | null {
    const profile = this.getProfile(profileId);
    if (!profile) {
      return null;
    }

    return {
      coins: profile.coins,
      gems: profile.gems,
      lifetimeSpins: profile.lifetimeSpins,
      lifetimeWins: profile.lifetimeWins,
    };
  }

  public applyWalletDelta(profileId: string, delta: WalletDelta): WalletState {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const nextCoins = Math.max(0, profile.coins + (delta.coinsDelta ?? 0));
    const nextGems = Math.max(0, profile.gems + (delta.gemsDelta ?? 0));
    const nextSpins = Math.max(0, profile.lifetimeSpins + (delta.spinsDelta ?? 0));
    const nextWins = Math.max(0, profile.lifetimeWins + (delta.winsDelta ?? 0));

    this.db
      .prepare(
        `
        UPDATE profiles
        SET coins = ?, gems = ?, lifetime_spins = ?, lifetime_wins = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(nextCoins, nextGems, nextSpins, nextWins, new Date().toISOString(), profileId);

    return {
      coins: nextCoins,
      gems: nextGems,
      lifetimeSpins: nextSpins,
      lifetimeWins: nextWins,
    };
  }

  public getSession(sessionId: string): SessionRecord | null {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(sessionId) as SessionRow | undefined;

    return row ? toSessionRecord(row) : null;
  }

  public upsertSession(input: SessionUpsertInput): SessionRecord {
    const now = new Date().toISOString();
    const current = this.getSession(input.id);

    if (current) {
      const nextVolatility = input.volatility ?? current.volatility;
      const nextState = input.state ?? current.state;
      this.db
        .prepare(
          `
          UPDATE sessions
          SET volatility = ?, state_json = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(nextVolatility, JSON.stringify(nextState), now, input.id);
    } else {
      this.db
        .prepare(
          `
          INSERT INTO sessions (id, profile_id, volatility, state_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          input.id,
          input.profileId,
          input.volatility ?? "medium",
          JSON.stringify(input.state ?? {}),
          now,
          now,
        );
    }

    const session = this.getSession(input.id);
    if (!session) {
      throw new Error("Failed to upsert session");
    }

    return session;
  }

  public updateSessionState(sessionId: string, state: Record<string, unknown>): SessionRecord {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    this.db
      .prepare(
        `
        UPDATE sessions
        SET state_json = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(JSON.stringify(state), new Date().toISOString(), sessionId);

    const updated = this.getSession(sessionId);
    if (!updated) {
      throw new Error("Failed to update session state");
    }

    return updated;
  }

  public saveSpin(input: SpinPersistInput): SpinRecord {
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT INTO spins (
          id, session_id, profile_id, bet, total_win, payload_json, wager_json, math_profile_version_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        input.id,
        input.sessionId,
        input.profileId,
        input.bet,
        input.totalWin,
        JSON.stringify(input.payload),
        JSON.stringify(input.wager),
        input.mathProfileVersionId,
        createdAt,
      );

    const row = this.db
      .prepare("SELECT * FROM spins WHERE id = ?")
      .get(input.id) as SpinRow | undefined;

    if (!row) {
      throw new Error("Failed to persist spin");
    }

    return toSpinRecord(row);
  }

  public getBonusSession(bonusSessionId: string): BonusSessionRecord | null {
    const row = this.db
      .prepare("SELECT * FROM bonus_sessions WHERE id = ?")
      .get(bonusSessionId) as BonusSessionRow | undefined;

    return row ? toBonusSessionRecord(row) : null;
  }

  public getLatestBonusSessionForGameSession(
    sessionId: string,
    statuses?: BonusSessionStatus[],
  ): BonusSessionRecord | null {
    if (statuses && statuses.length > 0) {
      const placeholders = statuses.map(() => "?").join(", ");
      const row = this.db
        .prepare(
          `SELECT * FROM bonus_sessions WHERE session_id = ? AND status IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`,
        )
        .get(sessionId, ...statuses) as BonusSessionRow | undefined;

      return row ? toBonusSessionRecord(row) : null;
    }

    const row = this.db
      .prepare("SELECT * FROM bonus_sessions WHERE session_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(sessionId) as BonusSessionRow | undefined;

    return row ? toBonusSessionRecord(row) : null;
  }

  public listBonusActions(bonusSessionId: string): BonusActionRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM bonus_actions WHERE bonus_session_id = ? ORDER BY ordinal ASC")
      .all(bonusSessionId) as BonusActionRow[];

    return rows.map((row) => toBonusActionRecord(row));
  }

  public listJackpotEventsForBonusSession(bonusSessionId: string): JackpotEventRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM jackpot_events WHERE bonus_session_id = ? ORDER BY created_at ASC")
      .all(bonusSessionId) as JackpotEventRow[];

    return rows.map((row) => toJackpotEventRecord(row));
  }

  public getMathProfileVersion(profileVersionId: string): MathProfileVersionRecord | null {
    const row = this.db
      .prepare("SELECT * FROM math_profile_versions WHERE id = ?")
      .get(profileVersionId) as MathProfileVersionRow | undefined;

    return row ? toMathProfileVersionRecord(row) : null;
  }

  public getActiveMathProfileVersion(): MathProfileVersionRecord {
    const active = this.getMathProfileVersion(DEFAULT_MATH_PROFILE_VERSION_ID);
    if (!active) {
      throw new Error("Default math profile version is missing");
    }

    return active;
  }

  public applyBonusSessionAction(input: BonusSessionActionCommitInput): BonusSessionActionCommitResult {
    const bonusSession = this.getBonusSession(input.bonusSessionId);
    if (!bonusSession) {
      throw new Error(`Bonus session not found: ${input.bonusSessionId}`);
    }

    const createdAt = new Date().toISOString();
    let nextOrdinal = 1;
    let wallet: WalletState | null = null;

    const tx = this.db.transaction(() => {
      const ordinalRow = this.db
        .prepare(
          "SELECT COALESCE(MAX(ordinal), 0) + 1 AS next_ordinal FROM bonus_actions WHERE bonus_session_id = ?",
        )
        .get(input.bonusSessionId) as { next_ordinal: number } | undefined;

      nextOrdinal = ordinalRow?.next_ordinal ?? 1;

      this.db
        .prepare(
          `
          INSERT INTO bonus_actions (
            id, bonus_session_id, action_type, ordinal, request_payload_json, result_payload_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          randomUUID(),
          input.bonusSessionId,
          input.actionType,
          nextOrdinal,
          JSON.stringify(input.requestPayload),
          JSON.stringify(input.resultPayload),
          createdAt,
        );

      this.db
        .prepare(
          `
          UPDATE bonus_sessions
          SET status = ?, actual_award = ?, progress_json = ?, updated_at = ?,
              completed_at = CASE WHEN ? IN ('COMPLETED', 'CLAIMED') AND completed_at IS NULL THEN ? ELSE completed_at END,
              claimed_at = CASE WHEN ? = 'CLAIMED' AND claimed_at IS NULL THEN ? ELSE claimed_at END
          WHERE id = ?
        `,
        )
        .run(
          input.status,
          input.actualAward,
          JSON.stringify(input.progress),
          createdAt,
          input.status,
          createdAt,
          input.status,
          createdAt,
          input.bonusSessionId,
        );

      if (input.walletDelta) {
        wallet = this.applyWalletDelta(bonusSession.profileId, input.walletDelta);
      }

      if (input.jackpotEvents) {
        for (const event of input.jackpotEvents) {
          this.insertJackpotEvent(event, createdAt);
        }
      }
    });

    tx();

    const session = this.getBonusSession(input.bonusSessionId);
    if (!session) {
      throw new Error(`Failed to update bonus session: ${input.bonusSessionId}`);
    }

    const action = this.listBonusActions(input.bonusSessionId)[nextOrdinal - 1];
    if (!action) {
      throw new Error(`Failed to persist bonus action for session: ${input.bonusSessionId}`);
    }

    return {
      session,
      action,
      wallet,
    };
  }

  public getJackpotAmount(tier: JackpotTier): number {
    const row = this.db
      .prepare("SELECT amount FROM jackpots WHERE tier = ?")
      .get(tier) as { amount: number } | undefined;

    if (!row) {
      throw new Error(`Unknown jackpot tier: ${tier}`);
    }

    return row.amount;
  }

  public commitSpinAtomic(input: AtomicSpinCommitInput): void {
    const now = new Date().toISOString();

    const tx = this.db.transaction(() => {
      const profile = this.getProfile(input.spin.profileId);
      if (!profile) {
        throw new Error(`Profile not found: ${input.spin.profileId}`);
      }

      const contribution = Math.max(1, Math.floor(input.jackpotContributionBet * 0.05));
      const mini = Math.floor(contribution * 0.4);
      const minor = Math.floor(contribution * 0.3);
      const major = Math.floor(contribution * 0.2);
      const grand = contribution - mini - minor - major;

      this.bumpJackpot("mini", mini, now);
      this.bumpJackpot("minor", minor, now);
      this.bumpJackpot("major", major, now);
      this.bumpJackpot("grand", grand, now);

      const payoutTiers = new Set<JackpotTier>();
      if (input.jackpotPayoutTier) {
        payoutTiers.add(input.jackpotPayoutTier);
      }

      if (Array.isArray(input.jackpotPayoutTiers)) {
        for (const tier of input.jackpotPayoutTiers) {
          payoutTiers.add(tier);
        }
      }

      for (const tier of payoutTiers) {
        this.db
          .prepare("UPDATE jackpots SET amount = ?, updated_at = ? WHERE tier = ?")
          .run(JACKPOT_RESET_AMOUNTS[tier], now, tier);
      }

      const nextCoins = Math.max(0, profile.coins + (input.walletDelta.coinsDelta ?? 0));
      const nextGems = Math.max(0, profile.gems + (input.walletDelta.gemsDelta ?? 0));
      const nextSpins = Math.max(0, profile.lifetimeSpins + (input.walletDelta.spinsDelta ?? 0));
      const nextWins = Math.max(0, profile.lifetimeWins + (input.walletDelta.winsDelta ?? 0));

      this.db
        .prepare(
          `
          UPDATE profiles
          SET coins = ?, gems = ?, lifetime_spins = ?, lifetime_wins = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(nextCoins, nextGems, nextSpins, nextWins, now, input.spin.profileId);

      this.db
        .prepare(
          `
          INSERT INTO spins (
            id, session_id, profile_id, bet, total_win, payload_json, wager_json, math_profile_version_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          input.spin.id,
          input.spin.sessionId,
          input.spin.profileId,
          input.spin.bet,
          input.spin.totalWin,
          JSON.stringify(input.spin.payload),
          JSON.stringify(input.spin.wager),
          input.spin.mathProfileVersionId,
          now,
        );

      if (input.bonusSession) {
        this.db
          .prepare(
            `
            INSERT INTO bonus_sessions (
              id, spin_id, session_id, profile_id, type, status, reveal_seed,
              expected_total_award, actual_award, jackpot_tiers_json, jackpot_awards_json,
              outcome_json, progress_json, math_profile_version_id, entry_snapshot_json,
              created_at, updated_at, completed_at, claimed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(
            input.bonusSession.id,
            input.bonusSession.spinId,
            input.bonusSession.sessionId,
            input.bonusSession.profileId,
            input.bonusSession.type,
            input.bonusSession.status,
            input.bonusSession.revealSeed,
            input.bonusSession.expectedTotalAward,
            input.bonusSession.actualAward,
            JSON.stringify(input.bonusSession.jackpotTiersHit),
            JSON.stringify(input.bonusSession.jackpotAwards),
            JSON.stringify(input.bonusSession.outcome),
            JSON.stringify(input.bonusSession.progress),
            input.bonusSession.mathProfileVersionId,
            JSON.stringify(input.bonusSession.entrySnapshot),
            now,
            now,
            input.bonusSession.status === "COMPLETED" ? now : null,
            input.bonusSession.status === "CLAIMED" ? now : null,
          );

        this.db
          .prepare(
            `
            INSERT INTO bonus_actions (
              id, bonus_session_id, action_type, ordinal, request_payload_json, result_payload_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run(
            randomUUID(),
            input.bonusSession.id,
            "START",
            1,
            JSON.stringify({ spinId: input.spin.id }),
            JSON.stringify({
              status: input.bonusSession.status,
              nextAction: input.bonusSession.progress.nextAction,
              featureShell: input.bonusSession.entrySnapshot,
            }),
            now,
          );
      }

      if (input.jackpotEvents) {
        for (const event of input.jackpotEvents) {
          this.insertJackpotEvent(event, now);
        }
      }

      this.db
        .prepare(
          `
          UPDATE sessions
          SET state_json = ?, updated_at = ?
          WHERE id = ?
        `,
        )
        .run(JSON.stringify(input.sessionState), now, input.spin.sessionId);
    });

    tx();
  }

  public getJackpots(): JackpotRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM jackpots ORDER BY CASE tier WHEN 'mini' THEN 1 WHEN 'minor' THEN 2 WHEN 'major' THEN 3 ELSE 4 END",
      )
      .all() as JackpotRow[];

    return rows.map((row) => toJackpotRecord(row));
  }

  public applyJackpotContribution(sourceBet: number): JackpotRecord[] {
    const contribution = Math.max(1, Math.floor(sourceBet * 0.05));
    const mini = Math.floor(contribution * 0.4);
    const minor = Math.floor(contribution * 0.3);
    const major = Math.floor(contribution * 0.2);
    const grand = contribution - mini - minor - major;

    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.bumpJackpot("mini", mini, now);
      this.bumpJackpot("minor", minor, now);
      this.bumpJackpot("major", major, now);
      this.bumpJackpot("grand", grand, now);
    });

    tx();
    return this.getJackpots();
  }

  public payoutJackpot(tier: JackpotTier): { tier: JackpotTier; amount: number; jackpots: JackpotRecord[] } {
    const row = this.db
      .prepare("SELECT * FROM jackpots WHERE tier = ?")
      .get(tier) as JackpotRow | undefined;

    if (!row) {
      throw new Error(`Unknown jackpot tier: ${tier}`);
    }

    const payoutAmount = row.amount;
    const now = new Date().toISOString();

    this.db
      .prepare("UPDATE jackpots SET amount = ?, updated_at = ? WHERE tier = ?")
      .run(JACKPOT_RESET_AMOUNTS[tier], now, tier);

    return {
      tier,
      amount: payoutAmount,
      jackpots: this.getJackpots(),
    };
  }

  private insertJackpotEvent(input: JackpotEventPersistInput, createdAt: string): void {
    this.db
      .prepare(
        `
        INSERT INTO jackpot_events (
          id, tier, event_type, amount, profile_id, session_id, spin_id, bonus_session_id, math_profile_version_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        randomUUID(),
        input.tier,
        input.eventType,
        input.amount,
        input.profileId ?? null,
        input.sessionId ?? null,
        input.spinId ?? null,
        input.bonusSessionId ?? null,
        input.mathProfileVersionId ?? null,
        createdAt,
      );
  }

  private bumpJackpot(tier: JackpotTier, amount: number, timestamp: string): void {
    this.db
      .prepare("UPDATE jackpots SET amount = amount + ?, updated_at = ? WHERE tier = ?")
      .run(amount, timestamp, tier);
  }

  private seedJackpots(): void {
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO jackpots (tier, amount, updated_at) VALUES (?, ?, ?)",
    );

    insert.run("mini", JACKPOT_RESET_AMOUNTS.mini, now);
    insert.run("minor", JACKPOT_RESET_AMOUNTS.minor, now);
    insert.run("major", JACKPOT_RESET_AMOUNTS.major, now);
    insert.run("grand", JACKPOT_RESET_AMOUNTS.grand, now);
  }

  private seedMathProfileVersion(): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO math_profile_versions (
          id, profile_key, version_tag, reel_set_id, checksum, description, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        DEFAULT_MATH_PROFILE_VERSION.id,
        DEFAULT_MATH_PROFILE_VERSION.profileKey,
        DEFAULT_MATH_PROFILE_VERSION.versionTag,
        DEFAULT_MATH_PROFILE_VERSION.reelSetId,
        DEFAULT_MATH_PROFILE_VERSION.checksum,
        DEFAULT_MATH_PROFILE_VERSION.description,
        now,
      );
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const rows = this.db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>;

    if (rows.some((row) => row.name === columnName)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        nickname TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        xp INTEGER NOT NULL DEFAULT 0,
        coins INTEGER NOT NULL DEFAULT 50000,
        gems INTEGER NOT NULL DEFAULT 0,
        lifetime_spins INTEGER NOT NULL DEFAULT 0,
        lifetime_wins INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        volatility TEXT NOT NULL DEFAULT 'medium',
        state_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(profile_id) REFERENCES profiles(id)
      );

      CREATE TABLE IF NOT EXISTS spins (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        bet INTEGER NOT NULL,
        total_win INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        wager_json TEXT NOT NULL DEFAULT '{}',
        math_profile_version_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id),
        FOREIGN KEY(profile_id) REFERENCES profiles(id)
      );

      CREATE TABLE IF NOT EXISTS jackpots (
        tier TEXT PRIMARY KEY,
        amount INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS math_profile_versions (
        id TEXT PRIMARY KEY,
        profile_key TEXT NOT NULL,
        version_tag TEXT NOT NULL,
        reel_set_id TEXT NOT NULL,
        checksum TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bonus_sessions (
        id TEXT PRIMARY KEY,
        spin_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        reveal_seed TEXT NOT NULL,
        expected_total_award REAL NOT NULL,
        actual_award REAL NOT NULL DEFAULT 0,
        jackpot_tiers_json TEXT NOT NULL,
        jackpot_awards_json TEXT NOT NULL,
        outcome_json TEXT NOT NULL,
        progress_json TEXT NOT NULL,
        math_profile_version_id TEXT,
        entry_snapshot_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        claimed_at TEXT,
        FOREIGN KEY(spin_id) REFERENCES spins(id),
        FOREIGN KEY(session_id) REFERENCES sessions(id),
        FOREIGN KEY(profile_id) REFERENCES profiles(id)
      );

      CREATE TABLE IF NOT EXISTS bonus_actions (
        id TEXT PRIMARY KEY,
        bonus_session_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        ordinal INTEGER NOT NULL,
        request_payload_json TEXT NOT NULL,
        result_payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(bonus_session_id) REFERENCES bonus_sessions(id)
      );

      CREATE TABLE IF NOT EXISTS jackpot_events (
        id TEXT PRIMARY KEY,
        tier TEXT NOT NULL,
        event_type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        profile_id TEXT,
        session_id TEXT,
        spin_id TEXT,
        bonus_session_id TEXT,
        math_profile_version_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(profile_id) REFERENCES profiles(id),
        FOREIGN KEY(session_id) REFERENCES sessions(id),
        FOREIGN KEY(spin_id) REFERENCES spins(id),
        FOREIGN KEY(bonus_session_id) REFERENCES bonus_sessions(id)
      );
    `);

    this.ensureColumn("spins", "wager_json", "TEXT NOT NULL DEFAULT '{}'");
    this.ensureColumn("spins", "math_profile_version_id", "TEXT");
    this.ensureColumn("bonus_sessions", "math_profile_version_id", "TEXT");
    this.ensureColumn("bonus_sessions", "entry_snapshot_json", "TEXT NOT NULL DEFAULT '{}'");

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_profile_id ON sessions(profile_id);
      CREATE INDEX IF NOT EXISTS idx_spins_session_id ON spins(session_id);
      CREATE INDEX IF NOT EXISTS idx_spins_profile_id ON spins(profile_id);
      CREATE INDEX IF NOT EXISTS idx_spins_math_profile_version_id ON spins(math_profile_version_id);
      CREATE INDEX IF NOT EXISTS idx_bonus_sessions_session_id ON bonus_sessions(session_id);
      CREATE INDEX IF NOT EXISTS idx_bonus_sessions_profile_id ON bonus_sessions(profile_id);
      CREATE INDEX IF NOT EXISTS idx_bonus_sessions_status ON bonus_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_bonus_sessions_math_profile_version_id ON bonus_sessions(math_profile_version_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_actions_bonus_session_ordinal ON bonus_actions(bonus_session_id, ordinal);
      CREATE INDEX IF NOT EXISTS idx_jackpot_events_bonus_session_id ON jackpot_events(bonus_session_id);
      CREATE INDEX IF NOT EXISTS idx_jackpot_events_spin_id ON jackpot_events(spin_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_math_profile_versions_profile_key_version_tag ON math_profile_versions(profile_key, version_tag);
    `);
  }
}

export interface CreateServerDbOptions {
  filePath?: string;
}

export const createServerDb = (options: CreateServerDbOptions = {}): ServerDb => {
  const filePath = options.filePath ?? "./data/server.sqlite";
  return new ServerDb(filePath);
};

