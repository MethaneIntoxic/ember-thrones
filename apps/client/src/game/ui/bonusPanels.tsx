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

  const featureCards = [
    {
      key: "ember-respin",
      kicker: "Reel Triggered Bonus",
      title: "Ember Respin",
      live: emberRespinLive,
      metrics: [
        ["Locked Cells", emberLock.lockedCells],
        ["Respins Remaining", emberLock.respinsRemaining]
      ]
    },
    {
      key: "wheel-ascension",
      kicker: "Reel Triggered Bonus",
      title: "Wheel Ascension",
      live: wheelAscensionLive,
      metrics: [
        ["Quest Spins Remaining", freeQuest.spinsRemaining],
        ["Quest Retriggers", freeQuest.retriggers]
      ]
    },
    {
      key: "relic-vault",
      kicker: "Reel Triggered Bonus",
      title: "Relic Vault",
      live: relicVaultLive,
      metrics: [
        ["Relic Shards", progression.relicShards],
        ["Forge Meter", progression.forgeMeter]
      ]
    }
  ] as const;

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

      {featureCards.map((card) => (
        <section key={card.key} className="bonus-card feature-card">
          <header>
            <p className="panel-kicker">{card.kicker}</p>
            <h3>{card.title}</h3>
          </header>

          <p className={`feature-state ${card.live ? "feature-live" : "feature-idle"}`}>
            {activeLabel(card.live)}
          </p>

          <div className="feature-metrics">
            {card.metrics.map(([label, value]) => (
              <p key={`${card.key}-${label}`} className="metric-row">
                <span>{label}</span>
                <strong>{value.toLocaleString()}</strong>
              </p>
            ))}
          </div>
        </section>
      ))}

      <section className="bonus-card feature-card">
        <header>
          <p className="panel-kicker">Progression</p>
          <h3>Dragon Forge</h3>
        </header>

        <div className="feature-metrics">
          <p className="metric-row">
            <span>Forge Meter</span>
            <strong>{progression.forgeMeter.toLocaleString()}</strong>
          </p>
          <p className="metric-row">
            <span>Daily Quest Steps</span>
            <strong>{progression.dailyQuestProgress.toLocaleString()}</strong>
          </p>
        </div>
      </section>

      <section className="bonus-card transport-card">
        <p className="panel-kicker">Transport</p>
        <p className="metric-row">
          <span>API Mode</span>
          <strong>{apiMode === "remote" ? "Server-Authoritative" : "Local Fallback"}</strong>
        </p>
        <p className="transport-note">
          {apiMode === "remote"
            ? "Live trigger cadence and events stream from server endpoints."
            : "Serverless fallback uses weighted local resolver with synced trigger semantics."}
        </p>
      </section>
    </aside>
  );
};
