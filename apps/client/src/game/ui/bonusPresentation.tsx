import { useEffect, useId, useRef, type FC } from "react";
import type { ActiveBonusPresentation } from "../state/store";
import { getBonusTheme } from "./bonusThemes";

export interface BonusPresentationOverlayProps {
  bonus: ActiveBonusPresentation | null;
  onClose: () => void;
}

interface RevealBeat {
  label: string;
  detail: string;
}

const BOARD_CELL_COUNT = 15;
const awardFormatter = new Intl.NumberFormat("en-US");

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

function tensionSteps(type: ActiveBonusPresentation["type"]): number {
  if (type === "EMBER_RESPIN") {
    return 6;
  }

  if (type === "WHEEL_ASCENSION") {
    return 5;
  }

  return 4;
}

function bonusSourceLabel(source: ActiveBonusPresentation["source"]): string {
  return source === "event" ? "Live server bonus event" : "Spin payload deterministic trigger";
}

function normalizeBoardIndex(value: number): number | null {
  if (value >= 0 && value < BOARD_CELL_COUNT) {
    return value;
  }

  if (value >= 1 && value <= BOARD_CELL_COUNT) {
    return value - 1;
  }

  return null;
}

function revealBeats(type: ActiveBonusPresentation["type"]): RevealBeat[] {
  if (type === "EMBER_RESPIN") {
    return [
      { label: "Ignition", detail: "Orb symbols lock into the collector board." },
      { label: "Reset", detail: "Fresh embers snap the respin count back to three." },
      { label: "Harvest", detail: "Collector multiplier banks the heated orb values." }
    ];
  }

  if (type === "WHEEL_ASCENSION") {
    return [
      { label: "Lift", detail: "Scatter energy climbs into the orbit ring." },
      { label: "Wedge", detail: "Each wheel wedge resolves a reward lane." },
      { label: "Flight", detail: "Bonus spins can extend the route mid-session." }
    ];
  }

  return [
    { label: "Unlock", detail: "Keys open the chamber and expose the vault board." },
    { label: "Pick", detail: "Selections peel back relic tiers and hidden rewards." },
    { label: "Claim", detail: "The chamber resolves coins, jackpots, and bonus value." }
  ];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function readDisplayValue(record: Record<string, unknown>, fallback: string): string {
  const value = record.value;

  if (typeof value === "number") {
    return awardFormatter.format(Math.max(0, Math.floor(value)));
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return fallback;
}

function readValueFromKeys(
  record: Record<string, unknown>,
  keys: string[],
  fallback: string
): string {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number") {
      return `${awardFormatter.format(Math.max(0, Math.floor(value)))} coins`;
    }

    if (typeof value === "string" && value.trim().length > 0) {
      return value.replace(/[_-]+/g, " ");
    }
  }

  return fallback;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function openAgeLabel(openedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - openedAt) / 1000));
  return `${seconds}s ago`;
}

const EmberRespinScene: FC<{ bonus: ActiveBonusPresentation }> = ({ bonus }) => {
  const outcome = bonus.precomputedOutcome;
  const theme = getBonusTheme(bonus.type);
  const startingOrbs = toRecordArray(outcome.startingOrbs);
  const revealSteps = toRecordArray(outcome.steps);
  const lockedCells =
    startingOrbs.length > 0
      ? startingOrbs
          .map((entry) => normalizeBoardIndex(toInt(entry.position, -1)))
          .filter((entry): entry is number => entry !== null)
      : toNumberArray(outcome.lockedCells)
          .map((entry) => normalizeBoardIndex(entry))
          .filter((entry): entry is number => entry !== null);
  const orbValues =
    startingOrbs.length > 0
      ? startingOrbs.map((entry) => toInt(entry.coinValue))
      : toNumberArray(outcome.orbValues);
  const latestRevealStep = revealSteps[revealSteps.length - 1];
  const respinsRemaining = latestRevealStep
    ? toInt(latestRevealStep.respinsRemainingAfter, toInt(outcome.respinsRemaining, 3))
    : toInt(outcome.respinsRemaining, 3);
  const collectorMultiplier = Math.max(1, toInt(outcome.collectorMultiplier, 1));
  const valueByCell = new Map<number, number>();
  const lockedSet = new Set<number>();

  for (let index = 0; index < lockedCells.length; index += 1) {
    const boardIndex = lockedCells[index];
    if (boardIndex === undefined) {
      continue;
    }

    lockedSet.add(boardIndex);
    const orbValue = orbValues[index];
    if (typeof orbValue === "number") {
      valueByCell.set(boardIndex, orbValue);
    }
  }

  return (
    <section className={`bonus-scene bonus-scene-board ${theme.toneClass}`}>
      <header className="bonus-scene-header">
        <div>
          <p className="panel-kicker">Reveal Board</p>
          <h3>Collector Lock Board</h3>
        </div>
        <p className="bonus-scene-copy">{theme.storySupport}</p>
      </header>

      <div className="bonus-metrics">
        <p>Locked Cells: {lockedCells.length}</p>
        <p>Respins Remaining: {respinsRemaining}</p>
        <p>Collector Multiplier: x{collectorMultiplier}</p>
        <p>Reveal Steps: {revealSteps.length}</p>
      </div>

      <div className="ember-board" aria-label="Collector lock board">
        {Array.from({ length: BOARD_CELL_COUNT }, (_, index) => {
          const orbValue = valueByCell.get(index) ?? null;
          const isLocked = lockedSet.has(index);

          return (
            <div key={`ember-cell-${index}`} className={`ember-cell ${isLocked ? "is-locked" : ""}`}>
              <span className="bonus-cell-index">{index + 1}</span>
              <strong>{isLocked ? "LOCK" : "OPEN"}</strong>
              <small>{orbValue !== null ? `+${awardFormatter.format(orbValue)}` : "Awaiting orb"}</small>
            </div>
          );
        })}
      </div>

      <div className="bonus-chip-grid">
        {revealSteps.length > 0
          ? revealSteps.slice(0, 6).map((step, index) => (
              <span key={`step-${index}`} className="bonus-chip">
                Respin {toInt(step.respinIndex, index + 1)} · {toRecordArray(step.landedOrbs).length} landed
              </span>
            ))
          : orbValues.slice(0, 12).map((value, index) => (
              <span key={`orb-${index}-${value}`} className="bonus-chip">
                Ember +{awardFormatter.format(value)}
              </span>
            ))}
      </div>
    </section>
  );
};

const WheelAscensionScene: FC<{ bonus: ActiveBonusPresentation }> = ({ bonus }) => {
  const outcome = bonus.precomputedOutcome;
  const theme = getBonusTheme(bonus.type);
  const wedgeMap = toRecordArray(outcome.wedgeMap);
  const outcomesBySpin = toRecordArray(outcome.outcomesBySpin);
  const awardedSpins = toInt(outcome.awardedSpins, outcomesBySpin.length || 1);
  const maxSpins = Math.max(awardedSpins, toInt(outcome.maxSpins, awardedSpins));

  return (
    <section className={`bonus-scene bonus-scene-board ${theme.toneClass}`}>
      <header className="bonus-scene-header">
        <div>
          <p className="panel-kicker">Orbit Reveal</p>
          <h3>Celestial Wheel</h3>
        </div>
        <p className="bonus-scene-copy">{theme.storySupport}</p>
      </header>

      <div className="bonus-metrics">
        <p>Awarded Spins: {awardedSpins}</p>
        <p>Spin Cap: {maxSpins}</p>
        <p>Resolved Wedges: {wedgeMap.length}</p>
      </div>

      <div className="wheel-wedges" aria-label="Resolved wheel wedges">
        {wedgeMap.slice(0, 10).map((wedge, index) => {
          const kind = readString(wedge.kind, "coin");
          return (
            <span key={`wedge-${index}`} className={`wheel-wedge ${index === 0 ? "is-lead" : ""}`}>
              <small>{kind}</small>
              <strong>{readDisplayValue(wedge, "mystery")}</strong>
            </span>
          );
        })}
      </div>

      <div className="wheel-outcomes" aria-label="Spin outcome trail">
        {outcomesBySpin.slice(0, 6).map((outcomeRecord, index) => (
          <article key={`wheel-outcome-${index}`} className="wheel-outcome-card">
            <p className="panel-kicker">Spin {index + 1}</p>
            <strong>
              {readString(
                outcomeRecord.jackpotTier,
                readString(outcomeRecord.kind, readString(outcomeRecord.wedgeId, "reward")).replace(/[_-]+/g, " ")
              )}
            </strong>
            <span>{readValueFromKeys(outcomeRecord, ["resolvedAward", "value"], "stored")}</span>
          </article>
        ))}
      </div>
    </section>
  );
};

const RelicVaultScene: FC<{ bonus: ActiveBonusPresentation }> = ({ bonus }) => {
  const outcome = bonus.precomputedOutcome;
  const theme = getBonusTheme(bonus.type);
  const keyCount = Math.max(1, toInt(outcome.keyCount, 3));
  const picksAllowed = Math.max(1, toInt(outcome.picksAllowed, keyCount));
  const picksMade = Math.min(picksAllowed, toInt(outcome.picksMade, 0));
  const board = toRecordArray(outcome.board);
  const pickResults = toRecordArray(outcome.pickResults);
  const legacyRevealedSlots = new Set(toStringArray(outcome.revealed));
  const pickResultBySlotId = new Map(
    pickResults.map((entry) => [readString(entry.slotId, ""), entry])
  );
  const keysRemaining = Math.max(0, picksAllowed - picksMade);

  return (
    <section className={`bonus-scene bonus-scene-board ${theme.toneClass}`}>
      <header className="bonus-scene-header">
        <div>
          <p className="panel-kicker">Vault Chamber</p>
          <h3>Relic Vault Picks</h3>
        </div>
        <p className="bonus-scene-copy">{theme.storySupport}</p>
      </header>

      <div className="bonus-metrics">
        <p>Keys: {keyCount}</p>
        <p>Picks Allowed: {picksAllowed}</p>
        <p>Picks Made: {picksMade}</p>
        <p>Keys Remaining: {keysRemaining}</p>
      </div>

      <div className="vault-grid">
        {board.slice(0, 12).map((slot, index) => {
          const slotId = readString(slot.slotId, `S${index + 1}`);
          const hidden = readString(slot.hidden, "sealed reward");
          const pickResult = pickResultBySlotId.get(slotId);
          const isRevealed = legacyRevealedSlots.has(slotId) || pickResult !== undefined || index < picksMade;
          const revealed = pickResult
            ? readValueFromKeys(pickResult, ["value", "jackpotTierGranted", "hidden"], hidden)
            : hidden;
          return (
            <span key={`slot-${slotId}-${index}`} className={`vault-tile ${isRevealed ? "is-revealed" : ""}`}>
              <strong>{slotId}</strong>
              <small>{isRevealed ? revealed : hidden}</small>
            </span>
          );
        })}
      </div>
    </section>
  );
};

export const BonusPresentationOverlay: FC<BonusPresentationOverlayProps> = ({ bonus, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!bonus) {
      return undefined;
    }

    closeButtonRef.current?.focus();

    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [bonus, onClose]);

  if (!bonus) {
    return null;
  }

  const theme = getBonusTheme(bonus.type);
  const toneClass = theme.toneClass;
  const rampSteps = tensionSteps(bonus.type);
  const beats = revealBeats(bonus.type);

  return (
    <aside
      className={`bonus-overlay ${toneClass}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="bonus-overlay-backdrop" onClick={onClose} aria-hidden="true" />

      <section className={`bonus-overlay-panel ${toneClass}`}>
        <header className="bonus-overlay-header">
          <div className="bonus-hero-copy">
            <p className="panel-kicker">{theme.kicker}</p>
            <h2 id={titleId}>{theme.label}</h2>
            <p className="bonus-hero-tagline">{theme.tagline}</p>
            <p id={descriptionId} className="bonus-disclosure">
              Deterministic bonus outcome was seeded at trigger time. This overlay now stages the reveal
              as presentation rather than exposing only the summary payload.
            </p>
          </div>

          <div className="bonus-hero-side">
            <div className="bonus-crest-frame" aria-hidden="true">
              <img src={theme.crestAsset} alt="" className="bonus-crest" />
            </div>

            <div className="bonus-hero-meta">
              <div className="bonus-hero-chip">
                <span>Expected Award</span>
                <strong>{awardFormatter.format(bonus.expectedTotalAward)} coins</strong>
              </div>
              <button type="button" className="bonus-close-inline" onClick={onClose} ref={closeButtonRef}>
                Dismiss
              </button>
            </div>
          </div>
        </header>

        <section className="bonus-hero-grid">
          <article className={`bonus-scene bonus-hero-panel ${toneClass}`}>
            <header className="bonus-scene-header compact">
              <div>
                <p className="panel-kicker">Signal Integrity</p>
                <h3>Trigger Thread</h3>
              </div>
              <span className="bonus-inline-pill">{bonusSourceLabel(bonus.source)}</span>
            </header>

            <div className={`tension-rail ${toneClass}`} aria-hidden="true">
              {Array.from({ length: 6 }, (_, index) => (
                <span key={`tension-${index}`} className={`tension-cell ${index < rampSteps ? "is-hot" : ""}`} />
              ))}
            </div>

            <div className="bonus-metrics compact">
              <p>Session Id: {bonus.sessionId}</p>
              <p>Trigger Spin: {bonus.triggerSpinId}</p>
              <p>Seed: {bonus.revealSeed}</p>
              <p>Opened: {openAgeLabel(bonus.openedAt)}</p>
            </div>
          </article>

          <article className={`bonus-scene bonus-hero-panel bonus-summary-scene ${toneClass}`}>
            <header className="bonus-scene-header compact">
              <div>
                <p className="panel-kicker">Payout Focus</p>
                <h3>Prize Outlook</h3>
              </div>
              <span className="bonus-inline-pill">Precomputed award</span>
            </header>

            <p className="bonus-award">{awardFormatter.format(bonus.expectedTotalAward)} coins</p>

            {bonus.jackpotAwards.length > 0 ? (
              <ul className="bonus-jackpot-awards">
                {bonus.jackpotAwards.map((award, index) => (
                  <li key={`${award.tier}-${award.amount}-${index}`}>
                    <span>{award.tier.toUpperCase()}</span>
                    <strong>{awardFormatter.format(award.amount)}</strong>
                  </li>
                ))}
              </ul>
            ) : bonus.jackpotTiersHit.length > 0 ? (
              <ul className="bonus-jackpot-awards">
                {bonus.jackpotTiersHit.map((tier, index) => (
                  <li key={`${tier}-${index}`}>
                    <span>{tier.toUpperCase()}</span>
                    <strong>Pending reveal</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="feature-idle">No jackpot awards in this reveal.</p>
            )}
          </article>
        </section>

        <section className={`bonus-scene bonus-sequence-scene ${toneClass}`}>
          <header className="bonus-scene-header compact">
            <div>
              <p className="panel-kicker">Reveal Sequence</p>
              <h3>Presentation Beats</h3>
            </div>
            <span className="bonus-inline-pill">{theme.panelCopy}</span>
          </header>

          <div className="bonus-beat-grid">
            {beats.map((beat, index) => (
              <article key={`${beat.label}-${index}`} className="bonus-beat-card">
                <p className="panel-kicker">Beat {index + 1}</p>
                <strong>{beat.label}</strong>
                <span>{beat.detail}</span>
              </article>
            ))}
          </div>
        </section>

        {bonus.type === "EMBER_RESPIN" ? <EmberRespinScene bonus={bonus} /> : null}
        {bonus.type === "WHEEL_ASCENSION" ? <WheelAscensionScene bonus={bonus} /> : null}
        {bonus.type === "RELIC_VAULT_PICK" ? <RelicVaultScene bonus={bonus} /> : null}

        <footer className="bonus-overlay-footer">
          <button type="button" className="bonus-close" onClick={onClose}>
            Return To Reels
          </button>
        </footer>
      </section>
    </aside>
  );
};
