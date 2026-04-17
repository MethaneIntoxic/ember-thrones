import type { FC } from "react";
import type { BaseGameMathConfig, WagerProfile } from "../net/apiClient";
import type { RuntimeExperience } from "../platform/runtimePolicy";

export interface HudProps {
  coins: number;
  gems: number;
  wager: WagerProfile;
  mathConfig: BaseGameMathConfig;
  minBet: number;
  maxBet: number;
  spinning: boolean;
  lastWin: number;
  queuedSpins: number;
  online: boolean;
  runtimeExperience: RuntimeExperience;
  runtimeLabel: "Connected" | "Disconnected" | "Demo";
  queueSupported: boolean;
  queueCanReplayNow: boolean;
  installAvailable: boolean;
  updateAvailable: boolean;
  autoSpinArmed: boolean;
  onSpin: () => void;
  onSetDenomination: (value: number) => void;
  onSetCreditsPerSpin: (value: number) => void;
  onSetSpeedMode: (value: WagerProfile["speedMode"]) => void;
  onMaxBet: () => void;
  onSyncQueue: () => void;
  onInstall: () => void;
  onApplyUpdate: () => void;
}

function formatDenomination(value: number): string {
  return value === 1 ? "1 coin" : `${value} coins`;
}

function formatSpeedLabel(value: WagerProfile["speedMode"]): string {
  if (value === "turbo") {
    return "Turbo";
  }

  if (value === "auto") {
    return "Auto";
  }

  return "Normal";
}

export const Hud: FC<HudProps> = ({
  coins,
  gems,
  wager,
  mathConfig,
  minBet,
  maxBet,
  spinning,
  lastWin,
  queuedSpins,
  online,
  runtimeExperience,
  runtimeLabel,
  queueSupported,
  queueCanReplayNow,
  installAvailable,
  updateAvailable,
  autoSpinArmed,
  onSpin,
  onSetDenomination,
  onSetCreditsPerSpin,
  onSetSpeedMode,
  onMaxBet,
  onSyncQueue,
  onInstall,
  onApplyUpdate
}) => {
  const betRange = Math.max(1, maxBet - minBet);
  const betProgress = Math.max(0, Math.min(100, ((wager.totalBet - minBet) / betRange) * 100));
  const queueCopy = !queueSupported
    ? "Demo runtime keeps spin results local. Queue replay is unavailable."
    : !online
      ? "Browser offline. Connected spins will queue for server replay."
      : !queueCanReplayNow
        ? "Connected runtime unavailable. Queued spins stay parked until the API recovers."
        : queuedSpins > 0
          ? `${queuedSpins} spin${queuedSpins === 1 ? "" : "s"} ready for server replay`
          : "Queue clear";
  const queueButtonLabel = !queueSupported
    ? "Queue Disabled"
    : queueCanReplayNow
      ? "Replay Queue"
      : "Queue Waiting";
  const connectionClass =
    runtimeExperience === "connected"
      ? "is-online"
      : runtimeExperience === "disconnected"
        ? "is-offline"
        : "is-demo";
  const spinButtonLabel = spinning
    ? wager.speedMode === "auto" && autoSpinArmed
      ? "Auto Running..."
      : "Spinning..."
    : wager.speedMode === "auto"
      ? autoSpinArmed
        ? "Stop Auto"
        : "Start Auto"
      : `Spin ${wager.totalBet.toLocaleString()}`;
  const qualificationClass = wager.qualifiesForProgressive ? "is-qualified" : "is-locked";

  return (
    <section className="hud-card" aria-label="Wager controls and wallet status">
      <div className="hud-top">
        <div className="hud-balance-panel">
          <p className="hud-label">Dragon Vault</p>
          <div className="hud-balance-row">
            <p className="hud-coins">{coins.toLocaleString()} coins</p>
            <span className="hud-balance-chip">Last Win {lastWin.toLocaleString()}</span>
          </div>
          <p className="hud-gems">{gems.toLocaleString()} gems</p>
        </div>

        <div className="hud-status-stack">
          <div className={`hud-connection ${connectionClass}`} aria-live="polite">
            {runtimeLabel}
            {queueSupported && queuedSpins > 0 ? ` · queue ${queuedSpins}` : ""}
          </div>
          <p className="hud-queue-copy">
            {online ? queueCopy : "Offline spins store locally until sync returns."}
          </p>
        </div>
      </div>

      <div className="hud-controls">
        <div className="hud-controls-primary">
          <div className="wager-cluster">
            <div className="wager-summary-grid">
              <div>
                <span className="hud-label">Denomination</span>
                <strong>{formatDenomination(wager.denomination)}</strong>
              </div>
              <div>
                <span className="hud-label">Credits / Spin</span>
                <strong>{wager.creditsPerSpin.toLocaleString()}</strong>
              </div>
              <div>
                <span className="hud-label">Fixed Lines</span>
                <strong>{mathConfig.fixedLines}</strong>
              </div>
              <div>
                <span className="hud-label">Speed</span>
                <strong>{formatSpeedLabel(wager.speedMode)}</strong>
              </div>
            </div>

            <div className="control-stack">
              <div className="control-group">
                <div className="bet-copy-row">
                  <span className="hud-label">Denomination</span>
                  <strong>{formatDenomination(wager.denomination)}</strong>
                </div>
                <div className="choice-row" role="group" aria-label="Select denomination">
                  {mathConfig.denominations.map((value) => (
                    <button
                      key={`denom-${value}`}
                      type="button"
                      className={`choice-chip ${wager.denomination === value ? "is-active" : ""}`}
                      onClick={() => onSetDenomination(value)}
                      disabled={spinning}
                    >
                      {formatDenomination(value)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-group">
                <div className="bet-copy-row">
                  <span className="hud-label">Credits Per Spin</span>
                  <strong>{wager.creditsPerSpin.toLocaleString()}</strong>
                </div>
                <div className="choice-row" role="group" aria-label="Select credits per spin">
                  {mathConfig.creditsPerSpinOptions.map((value) => (
                    <button
                      key={`credits-${value}`}
                      type="button"
                      className={`choice-chip ${wager.creditsPerSpin === value ? "is-active" : ""}`}
                      onClick={() => onSetCreditsPerSpin(value)}
                      disabled={spinning}
                    >
                      {value.toLocaleString()} credits
                    </button>
                  ))}
                </div>
              </div>

              <div className="control-group control-group-inline">
                <div className="control-group-flex">
                  <div className="bet-copy-row">
                    <span className="hud-label">Cabinet Speed</span>
                    <strong>{formatSpeedLabel(wager.speedMode)}</strong>
                  </div>
                  <div className="choice-row" role="group" aria-label="Select spin speed">
                    {mathConfig.speedModes.map((value) => (
                      <button
                        key={`speed-${value}`}
                        type="button"
                        className={`choice-chip ${wager.speedMode === value ? "is-active" : ""}`}
                        onClick={() => onSetSpeedMode(value)}
                        disabled={spinning}
                      >
                        {formatSpeedLabel(value)}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className={`max-bet-button ${wager.isMaxBet ? "is-active" : ""}`}
                  onClick={onMaxBet}
                  disabled={spinning}
                >
                  {wager.isMaxBet ? "Max Bet Active" : "Max Bet"}
                </button>
              </div>
            </div>

            <div className="wager-signal-card">
              <div className="bet-copy-row">
                <span className="hud-label">Cabinet Wager</span>
                <strong>{wager.totalBet.toLocaleString()} coins</strong>
              </div>
              <progress className="bet-track" value={betProgress} max={100} aria-hidden="true" />
              <div className="bet-range-row" aria-hidden="true">
                <span>{minBet.toLocaleString()}</span>
                <span>{maxBet.toLocaleString()}</span>
              </div>
              <div className={`qualification-pill ${qualificationClass}`}>{wager.progressiveLabel}</div>
            </div>
          </div>

          <div className="spin-cluster">
            <button type="button" className="spin-button" disabled={spinning && wager.speedMode !== "auto"} onClick={onSpin} aria-label="Spin reels">
              {spinButtonLabel}
            </button>
            <p className="spin-helper-copy">
              {wager.speedMode === "auto"
                ? autoSpinArmed
                  ? "Auto mode repeats until you stop it or a bonus feature takes focus."
                  : "Auto mode stays armed only after you start it."
                : `${formatSpeedLabel(wager.speedMode)} settle profile on a fixed 5x3 cabinet.`}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="sync-button"
          disabled={!queueSupported || !queueCanReplayNow || queuedSpins === 0 || spinning}
          onClick={onSyncQueue}
        >
          {queueButtonLabel}
        </button>
      </div>

      <div className="hud-bottom">
        <div className="hud-last-win" aria-live="polite">
          <p className="hud-label">Session Signal</p>
          <strong>{lastWin > 0 ? `${lastWin.toLocaleString()} coin burst` : "Awaiting hit"}</strong>
          <span>{spinning ? "Reels in motion" : "Ready for next spin"}</span>
        </div>

        <div className="hud-actions">
          {installAvailable ? (
            <button type="button" className="install-button" onClick={onInstall}>
              Install App
            </button>
          ) : null}

          {updateAvailable ? (
            <button type="button" className="update-button" onClick={onApplyUpdate}>
              Apply Update
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
};
