import type { FC } from "react";
import type { ActiveBonusPresentation } from "../state/store";

export interface BonusPresentationOverlayProps {
  bonus: ActiveBonusPresentation | null;
  onClose: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.floor(parsed));
}

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => toInt(entry, -1))
    .filter((entry): entry is number => entry >= 0);
}

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
}

function bonusLabel(type: ActiveBonusPresentation["type"]): string {
  if (type === "EMBER_RESPIN") {
    return "Ember Respin";
  }

  if (type === "WHEEL_ASCENSION") {
    return "Wheel Ascension";
  }

  return "Relic Vault";
}

function bonusToneClass(type: ActiveBonusPresentation["type"]): "is-ember" | "is-wheel" | "is-relic" {
  if (type === "EMBER_RESPIN") {
    return "is-ember";
  }

  if (type === "WHEEL_ASCENSION") {
    return "is-wheel";
  }

  return "is-relic";
}

function tensionSteps(type: ActiveBonusPresentation["type"]): number {
  if (type === "EMBER_RESPIN") {
    return 6;
  }

  if (type === "WHEEL_ASCENSION") {
    return 5;
  }

  return 4;
}

const EmberRespinScene: FC<{ outcome: Record<string, unknown> }> = ({ outcome }) => {
  const lockedCells = toNumberArray(outcome.lockedCells);
  const orbValues = toNumberArray(outcome.orbValues);
  const respinsRemaining = toInt(outcome.respinsRemaining, 3);
  const collectorMultiplier = Math.max(1, toInt(outcome.collectorMultiplier, 1));

  return (
    <section className="bonus-scene">
      <header>
        <p className="panel-kicker">Feature Session</p>
        <h3>Collector Lock Board</h3>
      </header>

      <div className="bonus-metrics">
        <p>Locked Cells: {lockedCells.length}</p>
        <p>Respins Remaining: {respinsRemaining}</p>
        <p>Collector Multiplier: x{collectorMultiplier}</p>
      </div>

      <div className="bonus-chip-grid">
        {orbValues.slice(0, 12).map((value, index) => (
          <span key={`orb-${index}-${value}`} className="bonus-chip">
            +{value}
          </span>
        ))}
      </div>
    </section>
  );
};

const WheelAscensionScene: FC<{ outcome: Record<string, unknown> }> = ({ outcome }) => {
  const wedgeMap = toRecordArray(outcome.wedgeMap);
  const outcomesBySpin = toRecordArray(outcome.outcomesBySpin);
  const awardedSpins = toInt(outcome.awardedSpins, outcomesBySpin.length || 1);
  const maxSpins = Math.max(awardedSpins, toInt(outcome.maxSpins, awardedSpins));

  return (
    <section className="bonus-scene">
      <header>
        <p className="panel-kicker">Feature Session</p>
        <h3>Celestial Wheel</h3>
      </header>

      <div className="bonus-metrics">
        <p>Awarded Spins: {awardedSpins}</p>
        <p>Spin Cap: {maxSpins}</p>
      </div>

      <div className="wheel-wedges">
        {wedgeMap.slice(0, 10).map((wedge, index) => {
          const kind = typeof wedge.kind === "string" ? wedge.kind : "coin";
          const value = wedge.value;
          return (
            <span key={`wedge-${index}`} className="wheel-wedge">
              {kind}: {typeof value === "string" || typeof value === "number" ? value : "?"}
            </span>
          );
        })}
      </div>
    </section>
  );
};

const RelicVaultScene: FC<{ outcome: Record<string, unknown> }> = ({ outcome }) => {
  const keyCount = Math.max(1, toInt(outcome.keyCount, 3));
  const picksAllowed = Math.max(1, toInt(outcome.picksAllowed, keyCount));
  const picksMade = Math.min(picksAllowed, toInt(outcome.picksMade, 0));
  const board = toRecordArray(outcome.board);

  return (
    <section className="bonus-scene">
      <header>
        <p className="panel-kicker">Feature Session</p>
        <h3>Relic Vault Picks</h3>
      </header>

      <div className="bonus-metrics">
        <p>Keys: {keyCount}</p>
        <p>Picks Allowed: {picksAllowed}</p>
        <p>Picks Made: {picksMade}</p>
      </div>

      <div className="vault-grid">
        {board.slice(0, 12).map((slot, index) => {
          const slotId = typeof slot.slotId === "string" ? slot.slotId : `S${index + 1}`;
          const hidden = typeof slot.hidden === "string" ? slot.hidden : "coin";
          return (
            <span key={`slot-${slotId}-${index}`} className="vault-tile">
              <strong>{slotId}</strong>
              <small>{hidden}</small>
            </span>
          );
        })}
      </div>
    </section>
  );
};

export const BonusPresentationOverlay: FC<BonusPresentationOverlayProps> = ({ bonus, onClose }) => {
  if (!bonus) {
    return null;
  }

  const toneClass = bonusToneClass(bonus.type);
  const rampSteps = tensionSteps(bonus.type);
  const openedSeconds = Math.max(0, Math.floor((Date.now() - bonus.openedAt) / 1000));
  const triggerSourceLabel =
    bonus.source === "event"
      ? "Live server bonus event"
      : "Spin payload from triggerFlags + bonusPayload";

  return (
    <aside
      className={`bonus-overlay ${toneClass}`}
      role="dialog"
      aria-modal="true"
      aria-label="Bonus presentation"
    >
      <div className="bonus-overlay-backdrop" onClick={onClose} aria-hidden="true" />

      <section className={`bonus-overlay-panel ${toneClass}`}>
        <header className="bonus-overlay-header">
          <div>
            <p className="panel-kicker">Reel Triggered Bonus</p>
            <h2>{bonusLabel(bonus.type)}</h2>
            <p className="bonus-seed">Seed: {bonus.revealSeed}</p>
          </div>
          <button type="button" className="bonus-close-inline" onClick={onClose}>
            Dismiss
          </button>
        </header>

        <p className="bonus-disclosure">
          Bonus outcome was pre-seeded at trigger time and is now being revealed for presentation.
        </p>

        <section className="bonus-scene bonus-tension-scene">
          <header>
            <p className="panel-kicker">Session Signal</p>
            <h3>Trigger Integrity</h3>
          </header>

          <div className={`tension-rail ${toneClass}`} aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <span key={`tension-${index}`} className={`tension-cell ${index < rampSteps ? "is-hot" : ""}`} />
            ))}
          </div>

          <div className="bonus-metrics">
            <p>Trigger Source: {triggerSourceLabel}</p>
            <p>Session Id: {bonus.sessionId}</p>
            <p>Trigger Spin: {bonus.triggerSpinId}</p>
            <p>Opened: {openedSeconds}s ago</p>
          </div>
        </section>

        {bonus.type === "EMBER_RESPIN" ? <EmberRespinScene outcome={bonus.precomputedOutcome} /> : null}
        {bonus.type === "WHEEL_ASCENSION" ? (
          <WheelAscensionScene outcome={bonus.precomputedOutcome} />
        ) : null}
        {bonus.type === "RELIC_VAULT" ? <RelicVaultScene outcome={bonus.precomputedOutcome} /> : null}

        <section className="bonus-scene bonus-summary-scene">
          <header>
            <p className="panel-kicker">Session Summary</p>
            <h3>Expected Award</h3>
          </header>

          <p className="bonus-award">{bonus.expectedTotalAward.toLocaleString()} coins</p>

          {bonus.jackpotAwards.length > 0 ? (
            <ul className="bonus-jackpot-awards">
              {bonus.jackpotAwards.map((award, index) => (
                <li key={`${award.tier}-${award.amount}-${index}`}>
                  <span>{award.tier.toUpperCase()}</span>
                  <strong>{award.amount.toLocaleString()}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="feature-idle">No jackpot awards in this reveal.</p>
          )}
        </section>

        <footer className="bonus-overlay-footer">
          <button type="button" className="bonus-close" onClick={onClose}>
            Return To Reels
          </button>
        </footer>
      </section>
    </aside>
  );
};
