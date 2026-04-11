import type { FC } from "react";
import type { EmberLockStatus, FreeQuestStatus, JackpotTier } from "../net/apiClient";
import type { ProgressionState } from "../state/store";

export interface BonusPanelsProps {
  jackpotLadder: Record<JackpotTier, number>;
  emberLock: EmberLockStatus;
  freeQuest: FreeQuestStatus;
  progression: ProgressionState;
  apiMode: "remote" | "fallback";
}

const JACKPOT_ORDER: JackpotTier[] = ["ember", "relic", "mythic", "throne"];

export const BonusPanels: FC<BonusPanelsProps> = ({
  jackpotLadder,
  emberLock,
  freeQuest,
  progression,
  apiMode
}) => {
  return (
    <aside className="bonus-column">
      <section className="bonus-card jackpot-card">
        <header>
          <p className="panel-kicker">Jackpot Ladder</p>
          <h3>Dragon Crown Tiers</h3>
        </header>

        <ul className="jackpot-list">
          {JACKPOT_ORDER.map((tier) => (
            <li key={tier} className={`tier tier-${tier}`}>
              <span>{tier.toUpperCase()}</span>
              <strong>{jackpotLadder[tier].toLocaleString()}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className="bonus-card feature-card">
        <header>
          <p className="panel-kicker">Feature Status</p>
          <h3>Ember Lock</h3>
        </header>

        <p className={emberLock.active ? "feature-live" : "feature-idle"}>
          {emberLock.active ? "Active" : "Idle"}
        </p>
        <p>Locked Cells: {emberLock.lockedCells}</p>
        <p>Respins Remaining: {emberLock.respinsRemaining}</p>
      </section>

      <section className="bonus-card feature-card">
        <header>
          <p className="panel-kicker">Feature Status</p>
          <h3>Free Quest</h3>
        </header>

        <p className={freeQuest.active ? "feature-live" : "feature-idle"}>
          {freeQuest.active ? "Active" : "Idle"}
        </p>
        <p>Spins Remaining: {freeQuest.spinsRemaining}</p>
        <p>Retriggers: {freeQuest.retriggers}</p>
      </section>

      <section className="bonus-card feature-card">
        <header>
          <p className="panel-kicker">Progression</p>
          <h3>Dragon Forge</h3>
        </header>

        <p>Forge Meter: {progression.forgeMeter}</p>
        <p>Relic Shards: {progression.relicShards}</p>
        <p>Daily Quest Steps: {progression.dailyQuestProgress}</p>
      </section>

      <section className="bonus-card transport-card">
        <p className="panel-kicker">Transport</p>
        <p>API Mode: {apiMode === "remote" ? "Server-Authoritative" : "Local Fallback"}</p>
      </section>
    </aside>
  );
};
