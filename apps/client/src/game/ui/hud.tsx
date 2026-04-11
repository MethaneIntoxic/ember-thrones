import type { FC } from "react";

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

  return (
    <section className="hud-card">
      <div className="hud-top">
        <div>
          <p className="hud-label">Dragon Vault</p>
          <p className="hud-coins">{coins.toLocaleString()} coins</p>
          <p className="hud-gems">{gems.toLocaleString()} gems</p>
        </div>

        <div className={`hud-connection ${online ? "is-online" : "is-offline"}`}>
          {online ? "Online" : "Offline"}
          {queuedSpins > 0 ? ` · queue ${queuedSpins}` : ""}
        </div>
      </div>

      <div className="hud-controls">
        <div className="hud-controls-primary">
          <div className="bet-control">
            <button type="button" onClick={() => onAdjustBet(-5)} disabled={!canDecrease || spinning}>
              -
            </button>
            <span>Bet {bet}</span>
            <button type="button" onClick={() => onAdjustBet(5)} disabled={!canIncrease || spinning}>
              +
            </button>
          </div>

          <button type="button" className="spin-button" disabled={spinning} onClick={onSpin}>
            {spinning ? "Spinning..." : "Spin"}
          </button>
        </div>

        <button
          type="button"
          className="sync-button"
          disabled={!online || queuedSpins === 0 || spinning}
          onClick={onSyncQueue}
        >
          Sync Queue
        </button>
      </div>

      <div className="hud-bottom">
        <p>
          Last Win <strong>{lastWin.toLocaleString()}</strong>
        </p>

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
