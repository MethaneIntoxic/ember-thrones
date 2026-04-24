import type {
  BaseGameMathConfig,
  FreeGamesStatus,
  HoldAndSpinStatus,
  JackpotTier,
  WagerProfile
} from "../net/apiClient";
import type { RuntimeCapabilities } from "../platform/runtimePolicy";
import type { ActiveBonusPresentation } from "../state/store";
import { getBonusTheme } from "./bonusThemes";

export interface BonusPanelsProps {
  jackpotLadder: Record<JackpotTier, number>;
  holdAndSpin: HoldAndSpinStatus;
  freeGames: FreeGamesStatus;
  activeBonus: ActiveBonusPresentation | null;
  bonusSessionCount: number;
  runtimeCapabilities: RuntimeCapabilities;
  runtimeSummary: string;
  queueSummary: string;
  eventStreamState: "idle" | "connected" | "disconnected" | "unavailable";
  queuedSpins: number;
  strandedQueuedSpins: number;
  mathConfig: BaseGameMathConfig;
  wager: WagerProfile;
}

const JACKPOT_ORDER: JackpotTier[] = ["mini", "minor", "major", "grand"];

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

function transportLabel(transport: ActiveBonusPresentation["transport"]): string {
  if (transport === "streamed") {
    return "Authoritative stream";
  }

  if (transport === "demo") {
    return "Demo staging";
  }

  return "Seeded snapshot";
}

export const BonusPanels = ({
  jackpotLadder,
  holdAndSpin,
  freeGames,
  activeBonus,
  bonusSessionCount,
  runtimeCapabilities,
  runtimeSummary,
  queueSummary,
  eventStreamState,
  queuedSpins,
  strandedQueuedSpins,
  mathConfig,
  wager
}: BonusPanelsProps): JSX.Element => {
  const paytableRows = [
    ["5 DRAGON", `${(wager.denomination * 500).toLocaleString()} coins`],
    ["5 INGOT", `${(wager.denomination * 250).toLocaleString()} coins`],
    ["3 / 4 / 5 SCATTERS", "10 / 12 / 14 free games"],
    ["6+ ORBS", "Hold & Spin with 3 respins"],
    ["FULL 15-SPOT BOARD", "Grand on qualifying wager"],
    ["MAX BET", wager.qualifiesForProgressive ? "Grand eligible" : "Grand locked"]
  ] as const;
  const featureTheme = activeBonus ? getBonusTheme(activeBonus.type) : null;

  return (
    <aside className="bonus-column">
      <section className="bonus-card premium-card">
        <header className="bonus-card-header premium-header">
          <div>
            <p className="panel-kicker">Cabinet Paytable</p>
            <h3>5x3 Reference Guide</h3>
          </div>
          <span className="bonus-inline-pill">{mathConfig.fixedLines} fixed lines</span>
        </header>

        <p className="feature-copy">
          This cabinet now follows a real link-machine loop: denomination sets coin value,
          credits-per-spin sets wager size, and the main features come directly from orb and scatter reel outcomes.
        </p>

        <div className="feature-metrics">
          <p className="metric-row">
            <span>Denomination</span>
            <strong>{wager.denomination.toLocaleString()} coin{wager.denomination === 1 ? "" : "s"}</strong>
          </p>
          <p className="metric-row">
            <span>Credits / Spin</span>
            <strong>{wager.creditsPerSpin.toLocaleString()}</strong>
          </p>
          <p className="metric-row">
            <span>Total Bet</span>
            <strong>{wager.totalBet.toLocaleString()} coins</strong>
          </p>
        </div>

        <div className="paytable-list">
          {paytableRows.map(([label, value]) => (
            <p key={label} className="metric-row paytable-row">
              <span>{label}</span>
              <strong>{value}</strong>
            </p>
          ))}
        </div>
      </section>

      <section className="bonus-card jackpot-card premium-card">
        <header className="bonus-card-header premium-header">
          <div>
            <p className="panel-kicker">Progressives</p>
            <h3>Jackpot Ladder</h3>
          </div>
          <span className={`bonus-inline-pill ${wager.qualifiesForProgressive ? "is-qualified" : "is-locked"}`}>
            {wager.isMaxBet ? "Max Bet Active" : "Qualification Watch"}
          </span>
        </header>

        <p className="feature-copy">{wager.progressiveLabel}</p>

        <ul className="jackpot-list">
          {JACKPOT_ORDER.map((tier) => (
            <li key={tier} className={`tier tier-${tier}`}>
              <span>{tier.toUpperCase()}</span>
              <strong>{jackpotLadder[tier].toLocaleString()}</strong>
            </li>
          ))}
        </ul>
      </section>

      <section className={`bonus-card premium-card ${featureTheme?.toneClass ?? ""}`}>
        <header className="bonus-card-header premium-header">
          <div>
            <p className="panel-kicker">Feature Summary</p>
            <h3>{activeBonus ? featureTheme?.label ?? "Active Feature" : "Feature Queue"}</h3>
          </div>
          <span className="bonus-inline-pill">
            {activeBonus ? transportLabel(activeBonus.transport) : `${bonusSessionCount} tracked`}
          </span>
        </header>

        {activeBonus ? (
          <>
            <p className="feature-copy">
              {featureTheme?.panelCopy ?? activeBonus.featureSession.summaryLabel}
            </p>

            <div className="feature-metrics">
              {activeBonus.featureSession.metrics.slice(0, 4).map((metric) => (
                <p key={`${metric.label}-${metric.value}`} className="metric-row">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </p>
              ))}
            </div>

            <div className="bonus-chip-grid">
              {activeBonus.featureSession.steps.slice(0, 4).map((step) => (
                <span key={step.stepId} className={`bonus-chip ${step.highlight ? "is-active" : ""}`}>
                  {step.title}: {step.valueLabel ?? step.detail}
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="feature-copy">
              No feature is currently open. The side rail stays focused on jackpot qualification,
              trigger rules, and the most recent feature sessions rather than mini-game detours.
            </p>

            <div className="feature-metrics">
              <p className="metric-row">
                <span>Tracked Sessions</span>
                <strong>{bonusSessionCount.toLocaleString()}</strong>
              </p>
              <p className="metric-row">
                <span>Hold &amp; Spin</span>
                <strong>
                  {holdAndSpin.active
                    ? `${holdAndSpin.lockedCount} locked / ${holdAndSpin.respinsRemaining} left`
                    : "Standby"}
                </strong>
              </p>
              <p className="metric-row">
                <span>Free Games</span>
                <strong>
                  {freeGames.active
                    ? `${freeGames.gamesRemaining} left / ${freeGames.modifierId.replace(/_/g, " ")}`
                    : "Standby"}
                </strong>
              </p>
            </div>
          </>
        )}
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
        <p className="transport-note">{runtimeSummary}</p>
        <p className="transport-note">{queueSummary}</p>
      </section>
    </aside>
  );
};
