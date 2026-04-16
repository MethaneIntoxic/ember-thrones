import type { FC } from "react";
import type { BonusType, EmberLockStatus, FreeQuestStatus, JackpotTier } from "../net/apiClient";
import type { RuntimeCapabilities } from "../platform/runtimePolicy";
import type { ActiveBonusPresentation, ProgressionState } from "../state/store";
import { getBonusTheme } from "./bonusThemes";

export interface BonusPanelsProps {
  jackpotLadder: Record<JackpotTier, number>;
  emberLock: EmberLockStatus;
  freeQuest: FreeQuestStatus;
  progression: ProgressionState;
  activeBonus: ActiveBonusPresentation | null;
  bonusSessionCount: number;
  runtimeCapabilities: RuntimeCapabilities;
  runtimeSummary: string;
  queueSummary: string;
  eventStreamState: "idle" | "connected" | "disconnected" | "unavailable";
  queuedSpins: number;
  strandedQueuedSpins: number;
}

const JACKPOT_ORDER: JackpotTier[] = ["ember", "relic", "mythic", "throne"];

function activeLabel(isActive: boolean): string {
  return isActive ? "Live" : "Idle";
}

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
}

function describeEventState(
  runtimeCapabilities: RuntimeCapabilities,
  eventStreamState: BonusPanelsProps["eventStreamState"]
): string {
  if (!runtimeCapabilities.network.supportsLiveEvents) {
    return "Unavailable in demo";
  }

  if (eventStreamState === "connected") {
    return "Live";
  }

  if (eventStreamState === "disconnected") {
    return "Reconnecting";
  }

  return "Standby";
}

function describeQueueState(
  runtimeCapabilities: RuntimeCapabilities,
  queuedSpins: number,
  strandedQueuedSpins: number
): string {
  if (!runtimeCapabilities.offlineQueue.supported) {
    return strandedQueuedSpins > 0 ? `${strandedQueuedSpins} local-only item(s)` : "Disabled in demo";
  }

  if (queuedSpins > 0) {
    return runtimeCapabilities.offlineQueue.canReplayNow
      ? `${queuedSpins} ready to replay`
      : `${queuedSpins} waiting for API`;
  }

  return runtimeCapabilities.offlineQueue.canReplayNow ? "Replay ready" : "Standby";
}

export const BonusPanels: FC<BonusPanelsProps> = ({
  jackpotLadder,
  emberLock,
  freeQuest,
  progression,
  activeBonus,
  bonusSessionCount,
  runtimeCapabilities,
  runtimeSummary,
  queueSummary,
  eventStreamState,
  queuedSpins,
  strandedQueuedSpins
}) => {
  const activeBonusType: BonusType | null = activeBonus?.type ?? null;
  const emberRespinLive = activeBonusType === "EMBER_RESPIN" || emberLock.active;
  const wheelAscensionLive = activeBonusType === "WHEEL_ASCENSION";
  const relicVaultLive = activeBonusType === "RELIC_VAULT_PICK";

  const activeOutcome = activeBonus?.precomputedOutcome ?? {};
  const emberLockedCells = activeBonusType === "EMBER_RESPIN"
    ? readInt(activeOutcome.startingOrbs && Array.isArray(activeOutcome.startingOrbs) ? activeOutcome.startingOrbs.length : activeOutcome.lockedCells && Array.isArray(activeOutcome.lockedCells) ? activeOutcome.lockedCells.length : emberLock.lockedCells, emberLock.lockedCells)
    : emberLock.lockedCells;
  const emberRespinsRemaining = activeBonusType === "EMBER_RESPIN"
    ? readInt(activeOutcome.respinsRemaining, emberLock.respinsRemaining)
    : emberLock.respinsRemaining;
  const wheelAwardedSpins = activeBonusType === "WHEEL_ASCENSION"
    ? readInt(activeOutcome.awardedSpins, 0)
    : 0;
  const wheelMaxSpins = activeBonusType === "WHEEL_ASCENSION"
    ? Math.max(wheelAwardedSpins, readInt(activeOutcome.maxSpins, wheelAwardedSpins))
    : 0;
  const relicKeyCount = activeBonusType === "RELIC_VAULT_PICK"
    ? readInt(activeOutcome.keyCount, 0)
    : 0;
  const relicPicksAllowed = activeBonusType === "RELIC_VAULT_PICK"
    ? readInt(activeOutcome.picksAllowed, relicKeyCount)
    : 0;

  const featureCards = [
    {
      key: "ember-respin",
      theme: getBonusTheme("EMBER_RESPIN"),
      live: emberRespinLive,
      intensity: clampPercentage((emberLockedCells / 15) * 70 + (emberRespinsRemaining / 3) * 30),
      metrics: [
        ["Locked Cells", emberLockedCells],
        ["Respins Remaining", emberRespinsRemaining]
      ]
    },
    {
      key: "wheel-ascension",
      theme: getBonusTheme("WHEEL_ASCENSION"),
      live: wheelAscensionLive,
      intensity: clampPercentage(
        wheelAscensionLive
          ? (wheelAwardedSpins / Math.max(1, wheelMaxSpins)) * 100
          : bonusSessionCount * 8
      ),
      metrics: [
        [wheelAscensionLive ? "Awarded Spins" : "Tracked Sessions", wheelAscensionLive ? wheelAwardedSpins : bonusSessionCount],
        [wheelAscensionLive ? "Spin Cap" : "Quest Stance", wheelAscensionLive ? wheelMaxSpins : freeQuest.active ? 1 : 0]
      ]
    },
    {
      key: "relic-vault",
      theme: getBonusTheme("RELIC_VAULT_PICK"),
      live: relicVaultLive,
      intensity: clampPercentage(
        relicVaultLive
          ? (Math.max(relicKeyCount, relicPicksAllowed) / Math.max(1, relicPicksAllowed || relicKeyCount || 1)) * 100
          : (progression.relicShards / 20) * 45 + (progression.forgeMeter / 100) * 55
      ),
      metrics: [
        [relicVaultLive ? "Keys" : "Relic Shards", relicVaultLive ? relicKeyCount : progression.relicShards],
        [relicVaultLive ? "Picks Allowed" : "Forge Meter", relicVaultLive ? relicPicksAllowed : progression.forgeMeter]
      ]
    }
  ] as const;

  return (
    <aside className="bonus-column">
      <section className="bonus-card jackpot-card premium-card">
        <header className="bonus-card-header premium-header">
          <div>
            <p className="panel-kicker">Jackpot Ladder</p>
            <h3>Dragon Crown Tiers</h3>
          </div>
          <span className="bonus-inline-pill">Progressive tension</span>
        </header>

        <p className="feature-copy">
          Crown tiers stay visible so the reel field always broadcasts the premium upside before a bonus fires.
        </p>

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
        <section key={card.key} className={`bonus-card feature-card premium-card ${card.theme.toneClass} ${card.live ? "is-live" : ""}`}>
          <header className="bonus-card-header premium-header">
            <div className="feature-card-title">
              <div className="feature-crest-wrap" aria-hidden="true">
                <img src={card.theme.crestAsset} alt="" className="feature-crest" />
              </div>
              <div>
                <p className="panel-kicker">{card.theme.kicker}</p>
                <h3>{card.theme.label}</h3>
              </div>
            </div>
            <span className={`feature-state ${card.live ? "feature-live" : "feature-idle"}`}>
              {activeLabel(card.live)}
            </span>
          </header>

          <p className="feature-copy">{card.theme.panelCopy}</p>

          <div className="feature-intensity">
            <div className="feature-intensity-headline">
              <span>{card.theme.accentLabel}</span>
              <strong>{card.intensity}%</strong>
            </div>
            <progress className="feature-intensity-bar" value={card.intensity} max={100} aria-hidden="true" />
            <p className="feature-intensity-copy">
              {card.live ? card.theme.liveLabel : card.theme.idleLabel}
            </p>
          </div>

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

      <section className="bonus-card feature-card premium-card">
        <header className="bonus-card-header premium-header">
          <div>
            <p className="panel-kicker">Progression</p>
            <h3>Dragon Forge</h3>
          </div>
          <span className="bonus-inline-pill">Persistent economy</span>
        </header>

        <p className="feature-copy">
          Forge growth and quest pacing keep the premium feature set connected even when no bonus is active.
        </p>

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

      <section className="bonus-card transport-card premium-card">
        <header className="bonus-card-header premium-header">
          <div>
            <p className="panel-kicker">Transport</p>
            <h3>Runtime Link</h3>
          </div>
          <span className="bonus-inline-pill">{runtimeCapabilities.label}</span>
        </header>
        <p className="metric-row">
          <span>Spin Authority</span>
          <strong>
            {runtimeCapabilities.experience === "connected"
              ? "Server-authoritative"
              : runtimeCapabilities.experience === "disconnected"
                ? "Queued for replay"
                : "Local demo resolver"}
          </strong>
        </p>
        <p className="metric-row">
          <span>Live Events</span>
          <strong>{describeEventState(runtimeCapabilities, eventStreamState)}</strong>
        </p>
        <p className="metric-row">
          <span>Offline Queue</span>
          <strong>{describeQueueState(runtimeCapabilities, queuedSpins, strandedQueuedSpins)}</strong>
        </p>
        <p className="metric-row">
          <span>Service Worker</span>
          <strong>{runtimeCapabilities.serviceWorker.enabled ? "Build-versioned cache" : "Disabled in dev"}</strong>
        </p>
        <p className="transport-note">
          {runtimeSummary}
        </p>
        <p className="transport-note">{queueSummary}</p>
      </section>
    </aside>
  );
};
