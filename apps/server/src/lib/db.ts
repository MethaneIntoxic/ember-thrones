import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

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
}

export interface SessionUpsertInput {
  id: string;
  profileId: string;
  volatility?: VolatilityPreset;
  state?: Record<string, unknown>;
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

      if (input.jackpotPayoutTier) {
        this.db
          .prepare("UPDATE jackpots SET amount = ?, updated_at = ? WHERE tier = ?")
          .run(BASE_JACKPOTS[input.jackpotPayoutTier], now, input.jackpotPayoutTier);
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

      CREATE INDEX IF NOT EXISTS idx_sessions_profile_id ON sessions(profile_id);
      CREATE INDEX IF NOT EXISTS idx_spins_session_id ON spins(session_id);
      CREATE INDEX IF NOT EXISTS idx_spins_profile_id ON spins(profile_id);
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
