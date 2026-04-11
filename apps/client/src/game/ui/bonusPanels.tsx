import type { FC } from "react";
import type { BonusType, EmberLockStatus, FreeQuestStatus, JackpotTier } from "../net/apiClient";
import type { ProgressionState } from "../state/store";

export interface BonusPanelsProps {
  jackpotLadder: Record<JackpotTier, number>;
  emberLock: EmberLockStatus;
  freeQuest: FreeQuestStatus;
  progression: ProgressionState;
  apiMode: "remote" | "fallback";
  activeBonusType: BonusType | null;
}

const JACKPOT_ORDER: JackpotTier[] = ["ember", "relic", "mythic", "throne"];

function activeLabel(isActive: boolean): string {
  return isActive ? "Live" : "Idle";
}

export const BonusPanels: FC<BonusPanelsProps> = ({
  jackpotLadder,
  emberLock,
  freeQuest,
  progression,
  apiMode,
  activeBonusType
}) => {
  const emberRespinLive = activeBonusType === "EMBER_RESPIN" || emberLock.active;
  const wheelAscensionLive = activeBonusType === "WHEEL_ASCENSION";
  const relicVaultLive = activeBonusType === "RELIC_VAULT";

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
          <p className="panel-kicker">Reel Triggered Bonus</p>
          <h3>Ember Respin</h3>
        </header>

        <p className={emberRespinLive ? "feature-live" : "feature-idle"}>
          {activeLabel(emberRespinLive)}
        </p>
        <p>Locked Cells: {emberLock.lockedCells}</p>
        <p>Respins Remaining: {emberLock.respinsRemaining}</p>
      </section>

      <section className="bonus-card feature-card">
        <header>
          <p className="panel-kicker">Reel Triggered Bonus</p>
          <h3>Wheel Ascension</h3>
        </header>

        <p className={wheelAscensionLive ? "feature-live" : "feature-idle"}>
          {activeLabel(wheelAscensionLive)}
        </p>
        <p>Quest Spins Remaining: {freeQuest.spinsRemaining}</p>
        <p>Quest Retriggers: {freeQuest.retriggers}</p>
      </section>

      <section className="bonus-card feature-card">
        <header>
          <p className="panel-kicker">Reel Triggered Bonus</p>
          <h3>Relic Vault</h3>
        </header>

        <p className={relicVaultLive ? "feature-live" : "feature-idle"}>{activeLabel(relicVaultLive)}</p>
        <p>Relic Shards: {progression.relicShards}</p>
        <p>Forge Meter: {progression.forgeMeter}</p>
      </section>

      <section className="bonus-card feature-card">
        <header>
          <p className="panel-kicker">Progression</p>
          <h3>Dragon Forge</h3>
        </header>

        <p>Forge Meter: {progression.forgeMeter}</p>
        <p>Daily Quest Steps: {progression.dailyQuestProgress}</p>
      </section>

      <section className="bonus-card transport-card">
        <p className="panel-kicker">Transport</p>
        <p>API Mode: {apiMode === "remote" ? "Server-Authoritative" : "Local Fallback"}</p>
      </section>
    </aside>
  );
};
