import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  BonusActionRecord as SharedBonusActionRecord,
  BonusActionType,
  BonusJackpotAward,
  BonusOutcome,
  BonusProgress,
  BonusSessionRecord as SharedBonusSessionRecord,
  BonusSessionStatus,
} from "@ember-thrones/shared";

export type VolatilityPreset = "low" | "medium" | "high";
export type JackpotTier = "ember" | "relic" | "mythic" | "throne";

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
}

export interface SpinRecord {
  id: string;
  sessionId: string;
  profileId: string;
  bet: number;
  totalWin: number;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface JackpotRecord {
  tier: JackpotTier;
  amount: number;
  updatedAt: string;
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

export interface AtomicSpinCommitInput {
  spin: SpinPersistInput;
  walletDelta: WalletDelta;
  sessionState: Record<string, unknown>;
  jackpotContributionBet: number;
  jackpotPayoutTier?: JackpotTier;
  jackpotPayoutTiers?: JackpotTier[];
  bonusSession?: BonusSessionCreateInput;
}

export interface SessionUpsertInput {
  id: string;
  profileId: string;
  volatility?: VolatilityPreset;
  state?: Record<string, unknown>;
}

export type BonusSessionRecord = SharedBonusSessionRecord;

export interface BonusSessionCreateInput {
  id: string;
  spinId: string;
  sessionId: string;
  profileId: string;
  type: BonusSessionRecord["type"];
  status: BonusSessionStatus;
  revealSeed: string;
  expectedTotalAward: number;
  actualAward: number;
  jackpotTiersHit: JackpotTier[];
  jackpotAwards: BonusJackpotAward[];
  outcome: BonusOutcome;
  progress: BonusProgress;
}

export type BonusActionRecord = SharedBonusActionRecord;

export interface BonusSessionActionCommitInput {
  bonusSessionId: string;
  actionType: BonusActionType;
  requestPayload: Record<string, unknown>;
  resultPayload: Record<string, unknown>;
  progress: BonusProgress;
  status: BonusSessionStatus;
  actualAward: number;
  walletDelta?: WalletDelta;
}

export interface BonusSessionActionCommitResult {
  session: BonusSessionRecord;
  action: BonusActionRecord;
  wallet: WalletState | null;
}

const BASE_JACKPOTS: Record<JackpotTier, number> = {
  ember: 5_000,
  relic: 25_000,
  mythic: 100_000,
  throne: 1_000_000,
};

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
  type: BonusSessionRecord["type"];
  status: BonusSessionStatus;
  reveal_seed: string;
  expected_total_award: number;
  actual_award: number;
  jackpot_tiers_json: string;
  jackpot_awards_json: string;
  outcome_json: string;
  progress_json: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  claimed_at: string | null;
};

type BonusActionRow = {
  id: string;
  bonus_session_id: string;
  action_type: BonusActionType;
  ordinal: number;
  request_payload_json: string;
  result_payload_json: string;
  created_at: string;
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
  state: JSON.parse(row.state_json) as Record<string, unknown>,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toSpinRecord = (row: SpinRow): SpinRecord => ({
  id: row.id,
  sessionId: row.session_id,
  profileId: row.profile_id,
  bet: row.bet,
  totalWin: row.total_win,
  payload: JSON.parse(row.payload_json) as Record<string, unknown>,
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
  jackpotTiersHit: JSON.parse(row.jackpot_tiers_json) as JackpotTier[],
  jackpotAwards: JSON.parse(row.jackpot_awards_json) as BonusJackpotAward[],
  outcome: JSON.parse(row.outcome_json) as BonusOutcome,
  progress: JSON.parse(row.progress_json) as BonusProgress,
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
  requestPayload: JSON.parse(row.request_payload_json) as Record<string, unknown>,
  resultPayload: JSON.parse(row.result_payload_json) as Record<string, unknown>,
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
  }

  public close(): void {
    this.db.close();
  }

  public ensureProfile(input: ProfileBootstrap): ProfileRecord {
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `
      INSERT OR IGNORE INTO profiles (
        id, nickname, level, xp, coins, gems, lifetime_spins, lifetime_wins, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    `,
    );

    insert.run(
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
        INSERT INTO spins (id, session_id, profile_id, bet, total_win, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        input.id,
        input.sessionId,
        input.profileId,
        input.bet,
        input.totalWin,
        JSON.stringify(input.payload),
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
    statuses?: BonusSessionStatus[]
  ): BonusSessionRecord | null {
    if (statuses && statuses.length > 0) {
      const placeholders = statuses.map(() => "?").join(", ");
      const row = this.db
        .prepare(
          `SELECT * FROM bonus_sessions WHERE session_id = ? AND status IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`
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

  public applyBonusSessionAction(
    input: BonusSessionActionCommitInput
  ): BonusSessionActionCommitResult {
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
          "SELECT COALESCE(MAX(ordinal), 0) + 1 AS next_ordinal FROM bonus_actions WHERE bonus_session_id = ?"
        )
        .get(input.bonusSessionId) as { next_ordinal: number } | undefined;

      nextOrdinal = ordinalRow?.next_ordinal ?? 1;

      this.db
        .prepare(
          `
          INSERT INTO bonus_actions (
            id, bonus_session_id, action_type, ordinal, request_payload_json, result_payload_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `
        )
        .run(
          randomUUID(),
          input.bonusSessionId,
          input.actionType,
          nextOrdinal,
          JSON.stringify(input.requestPayload),
          JSON.stringify(input.resultPayload),
          createdAt
        );

      this.db
        .prepare(
          `
          UPDATE bonus_sessions
          SET status = ?, actual_award = ?, progress_json = ?, updated_at = ?,
              completed_at = CASE WHEN ? IN ('COMPLETED', 'CLAIMED') AND completed_at IS NULL THEN ? ELSE completed_at END,
              claimed_at = CASE WHEN ? = 'CLAIMED' AND claimed_at IS NULL THEN ? ELSE claimed_at END
          WHERE id = ?
        `
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
          input.bonusSessionId
        );

      if (input.walletDelta) {
        wallet = this.applyWalletDelta(bonusSession.profileId, input.walletDelta);
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
      const ember = Math.floor(contribution * 0.4);
      const relic = Math.floor(contribution * 0.3);
      const mythic = Math.floor(contribution * 0.2);
      const throne = contribution - ember - relic - mythic;

      this.bumpJackpot("ember", ember, now);
      this.bumpJackpot("relic", relic, now);
      this.bumpJackpot("mythic", mythic, now);
      this.bumpJackpot("throne", throne, now);

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
          .run(BASE_JACKPOTS[tier], now, tier);
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
          INSERT INTO spins (id, session_id, profile_id, bet, total_win, payload_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          input.spin.id,
          input.spin.sessionId,
          input.spin.profileId,
          input.spin.bet,
          input.spin.totalWin,
          JSON.stringify(input.spin.payload),
          now,
        );

      if (input.bonusSession) {
        this.db
          .prepare(
            `
            INSERT INTO bonus_sessions (
              id, spin_id, session_id, profile_id, type, status, reveal_seed,
              expected_total_award, actual_award, jackpot_tiers_json, jackpot_awards_json,
              outcome_json, progress_json, created_at, updated_at, completed_at, claimed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
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
            now,
            now,
            input.bonusSession.status === "COMPLETED" ? now : null,
            input.bonusSession.status === "CLAIMED" ? now : null
          );

        this.db
          .prepare(
            `
            INSERT INTO bonus_actions (
              id, bonus_session_id, action_type, ordinal, request_payload_json, result_payload_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `
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
              expectedTotalAward: input.bonusSession.expectedTotalAward,
            }),
            now
          );
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
      .prepare("SELECT * FROM jackpots ORDER BY CASE tier WHEN 'ember' THEN 1 WHEN 'relic' THEN 2 WHEN 'mythic' THEN 3 ELSE 4 END")
      .all() as JackpotRow[];

    return rows.map((row) => toJackpotRecord(row));
  }

  public applyJackpotContribution(sourceBet: number): JackpotRecord[] {
    const contribution = Math.max(1, Math.floor(sourceBet * 0.05));
    const ember = Math.floor(contribution * 0.4);
    const relic = Math.floor(contribution * 0.3);
    const mythic = Math.floor(contribution * 0.2);
    const throne = contribution - ember - relic - mythic;

    const now = new Date().toISOString();
    const tx = this.db.transaction(() => {
      this.bumpJackpot("ember", ember, now);
      this.bumpJackpot("relic", relic, now);
      this.bumpJackpot("mythic", mythic, now);
      this.bumpJackpot("throne", throne, now);
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
      .run(BASE_JACKPOTS[tier], now, tier);

    return {
      tier,
      amount: payoutAmount,
      jackpots: this.getJackpots(),
    };
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

    insert.run("ember", BASE_JACKPOTS.ember, now);
    insert.run("relic", BASE_JACKPOTS.relic, now);
    insert.run("mythic", BASE_JACKPOTS.mythic, now);
    insert.run("throne", BASE_JACKPOTS.throne, now);
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
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id),
        FOREIGN KEY(profile_id) REFERENCES profiles(id)
      );

      CREATE TABLE IF NOT EXISTS jackpots (
        tier TEXT PRIMARY KEY,
        amount INTEGER NOT NULL,
        updated_at TEXT NOT NULL
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

      CREATE INDEX IF NOT EXISTS idx_sessions_profile_id ON sessions(profile_id);
      CREATE INDEX IF NOT EXISTS idx_spins_session_id ON spins(session_id);
      CREATE INDEX IF NOT EXISTS idx_spins_profile_id ON spins(profile_id);
      CREATE INDEX IF NOT EXISTS idx_bonus_sessions_session_id ON bonus_sessions(session_id);
      CREATE INDEX IF NOT EXISTS idx_bonus_sessions_profile_id ON bonus_sessions(profile_id);
      CREATE INDEX IF NOT EXISTS idx_bonus_sessions_status ON bonus_sessions(status);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_actions_bonus_session_ordinal ON bonus_actions(bonus_session_id, ordinal);
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
