import type { FC } from "react";
import type { RuntimeExperience } from "../platform/runtimePolicy";

export interface HudProps {
  coins: number;
  gems: number;
  bet: number;
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
  onSpin: () => void;
  onAdjustBet: (delta: number) => void;
  onSyncQueue: () => void;
  onInstall: () => void;
  onApplyUpdate: () => void;
}

export const Hud: FC<HudProps> = ({
  coins,
  gems,
  bet,
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
  onSpin,
  onAdjustBet,
  onSyncQueue,
  onInstall,
  onApplyUpdate
}) => {
  const canDecrease = bet > minBet;
  const canIncrease = bet < maxBet;
  const betRange = Math.max(1, maxBet - minBet);
  const betProgress = Math.max(0, Math.min(100, ((bet - minBet) / betRange) * 100));
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

  return (
    <section className="hud-card" aria-label="Spin controls and wallet status">
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
          <p className="hud-queue-copy">{online ? queueCopy : "Offline spins store locally until sync returns."}</p>
        </div>
      </div>

      <div className="hud-controls">
        <div className="hud-controls-primary">
          <div className="bet-cluster">
            <div className="bet-copy-row">
              <span className="hud-label">Bet Level</span>
              <strong>{bet.toLocaleString()}</strong>
            </div>

            <div className="bet-control">
              <button
                type="button"
                onClick={() => onAdjustBet(-5)}
                disabled={!canDecrease || spinning}
                aria-label="Decrease bet"
              >
                -
              </button>
              <span>Bet {bet}</span>
              <button
                type="button"
                onClick={() => onAdjustBet(5)}
                disabled={!canIncrease || spinning}
                aria-label="Increase bet"
              >
                +
              </button>
            </div>

            <progress className="bet-track" value={betProgress} max={100} aria-hidden="true" />

            <div className="bet-range-row" aria-hidden="true">
              <span>{minBet}</span>
              <span>{maxBet}</span>
            </div>
          </div>

          <button type="button" className="spin-button" disabled={spinning} onClick={onSpin} aria-label="Spin reels">
            {spinning ? "Spinning..." : "Spin"}
          </button>
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
