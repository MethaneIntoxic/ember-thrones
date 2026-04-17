import { useEffect, useId, useRef, useState, type FC } from "react";
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

function bonusTransportLabel(transport: ActiveBonusPresentation["transport"]): string {
  if (transport === "streamed") {
    return "Authoritative stream";
  }

  if (transport === "demo") {
    return "Demo staging";
  }

  return "Seeded snapshot";
}

function transportDisclosure(bonus: ActiveBonusPresentation): string {
  if (bonus.transport === "streamed") {
    return "Connected runtime is showing an authoritative feature session with stepwise states carried from the server-owned bonus flow.";
  }

  if (bonus.transport === "demo") {
    return "Demo runtime stages the feature from a local seed and clearly does not claim live server progression or replay.";
  }

  return "This feature arrived as a seeded snapshot, so the overlay stages a truthful recap of the session instead of pretending every beat is a live stream.";
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

  const [revealStep, setRevealStep] = useState(0);

  const initialLockedSet = new Set<number>();
  const initialValueByCell = new Map<number, number>();
  for (let index = 0; index < lockedCells.length; index += 1) {
    const boardIndex = lockedCells[index];
    if (boardIndex === undefined) continue;
    initialLockedSet.add(boardIndex);
    const orbValue = orbValues[index];
    if (typeof orbValue === "number") {
      initialValueByCell.set(boardIndex, orbValue);
    }
  }

  const cumulativeLockedSet = new Set<number>(initialLockedSet);
  const cumulativeValueByCell = new Map<number, number>(initialValueByCell);
  let runningTotal = 0;
  for (const v of initialValueByCell.values()) runningTotal += v;

  const stepSnapshots: Array<{ locked: Set<number>; values: Map<number, number>; total: number }> = [];
  for (let s = 0; s < revealSteps.length; s += 1) {
    const step = revealSteps[s]!;
    const landedOrbs = toRecordArray(step.landedOrbs);
    for (const orb of landedOrbs) {
      const pos = normalizeBoardIndex(toInt(orb.position, -1));
      if (pos === null) continue;
      cumulativeLockedSet.add(pos);
      const val = toInt(orb.coinValue, 0);
      cumulativeValueByCell.set(pos, val);
      runningTotal += val;
    }
    stepSnapshots.push({
      locked: new Set(cumulativeLockedSet),
      values: new Map(cumulativeValueByCell),
      total: runningTotal
    });
  }

  const totalSteps = stepSnapshots.length;

  useEffect(() => {
    if (totalSteps === 0) return undefined;
    setRevealStep(0);
    const timer = setInterval(() => {
      setRevealStep((prev) => {
        if (prev >= totalSteps) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 800);
    return () => clearInterval(timer);
  }, [totalSteps]);

  const activeLockedSet = revealStep > 0 && revealStep <= totalSteps
    ? stepSnapshots[revealStep - 1]!.locked
    : initialLockedSet;
  const activeValueByCell = revealStep > 0 && revealStep <= totalSteps
    ? stepSnapshots[revealStep - 1]!.values
    : initialValueByCell;
  const initialTotal = Array.from(initialValueByCell.values()).reduce((a, b) => a + b, 0);
  const activeTotal = revealStep > 0 && revealStep <= totalSteps
    ? stepSnapshots[revealStep - 1]!.total
    : initialTotal;
  const isComplete = revealStep >= totalSteps;

  return (
    <section className={`bonus-scene bonus-scene-board ${theme.toneClass}`}>
      <header className="bonus-scene-header">
        <div>
          <p className="panel-kicker">Ember Respin</p>
          <h3>Collector Lock Board</h3>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <span style={{ fontWeight: 600, fontSize: "1.1rem" }}>
            Total: {awardFormatter.format(activeTotal)} coins
          </span>
          {!isComplete && totalSteps > 0 && (
            <span style={{ opacity: 0.7, fontSize: "0.85rem" }}>
              Revealing step {Math.min(revealStep + 1, totalSteps)} of {totalSteps}…
            </span>
          )}
          {isComplete && totalSteps > 0 && (
            <span style={{ color: "#4ade80", fontWeight: 600, fontSize: "0.85rem" }}>
              Reveal complete
            </span>
          )}
        </div>
      </header>

      <div className="bonus-metrics">
        <p>Locked Orbs: {activeLockedSet.size}</p>
        <p>Respins Left: {respinsRemaining}</p>
        <p>Multiplier: x{collectorMultiplier}</p>
      </div>

      <div className="ember-board" aria-label="Collector lock board">
        {Array.from({ length: BOARD_CELL_COUNT }, (_, index) => {
          const isLocked = activeLockedSet.has(index);
          const wasInitial = initialLockedSet.has(index);
          const orbValue = activeValueByCell.get(index) ?? null;
          const isNewReveal = isLocked && !wasInitial;

          return (
            <div
              key={`ember-cell-${index}`}
              className={`ember-cell ${isLocked ? "is-locked" : ""}`}
              style={{
                transform: isNewReveal ? "scale(1.12)" : isLocked ? "scale(1.05)" : "scale(1)",
                transition: "transform 0.4s ease, box-shadow 0.4s ease, opacity 0.3s ease",
                boxShadow: isNewReveal
                  ? "0 0 12px 4px rgba(251, 191, 36, 0.6)"
                  : isLocked
                    ? "0 0 6px 2px rgba(251, 191, 36, 0.25)"
                    : "none",
                opacity: isLocked ? 1 : 0.45
              }}
            >
              <span className="bonus-cell-index">{index + 1}</span>
              {isLocked ? (
                <strong style={{ fontSize: "1.1rem" }}>
                  {orbValue !== null ? `+${awardFormatter.format(orbValue)}` : "ORB"}
                </strong>
              ) : (
                <span style={{ opacity: 0.5 }}>—</span>
              )}
            </div>
          );
        })}
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

  const [currentSpin, setCurrentSpin] = useState(-1);

  const wedgeCount = Math.max(wedgeMap.length, 1);
  const degreesPerWedge = 360 / wedgeCount;

  useEffect(() => {
    if (outcomesBySpin.length === 0) return undefined;
    setCurrentSpin(-1);
    const initialDelay = setTimeout(() => {
      setCurrentSpin(0);
    }, 400);
    return () => clearTimeout(initialDelay);
  }, [outcomesBySpin.length]);

  useEffect(() => {
    if (currentSpin < 0) return undefined;
    if (currentSpin >= outcomesBySpin.length - 1) return undefined;
    const timer = setTimeout(() => {
      setCurrentSpin((prev) => prev + 1);
    }, 2200);
    return () => clearTimeout(timer);
  }, [currentSpin, outcomesBySpin.length]);

  const targetWedgeIndex = currentSpin >= 0 && currentSpin < outcomesBySpin.length
    ? toInt(outcomesBySpin[currentSpin]!.wedgeIndex, currentSpin % wedgeCount)
    : 0;
  const fullRotations = (currentSpin + 1) * 360 * 3;
  const landingAngle = fullRotations + targetWedgeIndex * degreesPerWedge;
  const isSpinning = currentSpin >= 0;
  const isComplete = currentSpin >= outcomesBySpin.length - 1 && outcomesBySpin.length > 0;

  return (
    <section className={`bonus-scene bonus-scene-board ${theme.toneClass}`}>
      <header className="bonus-scene-header">
        <div>
          <p className="panel-kicker">Celestial Wheel</p>
          <h3>Orbit Wheel</h3>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <span style={{ fontWeight: 600 }}>
            Spin {Math.max(1, currentSpin + 1)} of {awardedSpins}
          </span>
          {isComplete && (
            <span style={{ color: "#4ade80", fontWeight: 600, fontSize: "0.85rem" }}>
              All spins resolved
            </span>
          )}
        </div>
      </header>

      <div className="bonus-metrics">
        <p>Awarded Spins: {awardedSpins}</p>
        <p>Spin Cap: {maxSpins}</p>
      </div>

      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "320px",
          margin: "0 auto",
          aspectRatio: "1",
          overflow: "hidden",
          borderRadius: "50%",
          border: "3px solid rgba(255,255,255,0.15)"
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "10px solid transparent",
            borderRight: "10px solid transparent",
            borderTop: "18px solid #facc15",
            zIndex: 2
          }}
          aria-hidden="true"
        />
        <div
          className="wheel-wedges"
          aria-label="Spinning wheel"
          style={{
            transform: isSpinning ? `rotate(${landingAngle}deg)` : "rotate(0deg)",
            transition: isSpinning ? "transform 2s cubic-bezier(0.17, 0.67, 0.35, 0.98)" : "none",
            transformOrigin: "center center",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            height: "100%"
          }}
        >
          {wedgeMap.slice(0, 12).map((wedge, index) => {
            const kind = readString(wedge.kind, "coin");
            const isActive = currentSpin >= 0 && targetWedgeIndex === index;
            return (
              <span
                key={`wedge-${index}`}
                className={`wheel-wedge ${isActive ? "is-lead" : ""}`}
                style={{
                  transform: isActive ? "scale(1.15)" : "scale(1)",
                  transition: "transform 0.3s ease, box-shadow 0.3s ease",
                  boxShadow: isActive ? "0 0 10px 3px rgba(250, 204, 21, 0.5)" : "none"
                }}
              >
                <small>{kind}</small>
                <strong>{readDisplayValue(wedge, "mystery")}</strong>
              </span>
            );
          })}
        </div>
      </div>

      <div className="wheel-outcomes" aria-label="Spin outcome trail">
        {outcomesBySpin.slice(0, Math.max(0, currentSpin + 1)).map((outcomeRecord, index) => (
          <article
            key={`wheel-outcome-${index}`}
            className="wheel-outcome-card"
            style={{
              opacity: index <= currentSpin ? 1 : 0,
              transform: index <= currentSpin ? "translateY(0)" : "translateY(12px)",
              transition: "opacity 0.4s ease, transform 0.4s ease"
            }}
          >
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

  const [revealedCount, setRevealedCount] = useState(0);

  const revealOrder: number[] = [];
  for (let i = 0; i < board.length && i < 12; i += 1) {
    const slotId = readString(board[i]!.slotId, `S${i + 1}`);
    const shouldReveal = legacyRevealedSlots.has(slotId) || pickResultBySlotId.has(slotId) || i < picksMade;
    if (shouldReveal) revealOrder.push(i);
  }
  const totalReveals = revealOrder.length;

  useEffect(() => {
    if (totalReveals === 0) return undefined;
    setRevealedCount(0);
    const timer = setInterval(() => {
      setRevealedCount((prev) => {
        if (prev >= totalReveals) {
          clearInterval(timer);
          return prev;
        }
        return prev + 1;
      });
    }, 700);
    return () => clearInterval(timer);
  }, [totalReveals]);

  const revealedSet = new Set(revealOrder.slice(0, revealedCount));
  const isComplete = revealedCount >= totalReveals;

  let runningAward = 0;
  for (const idx of revealOrder.slice(0, revealedCount)) {
    const slot = board[idx];
    if (!slot) continue;
    const slotId = readString(slot.slotId, `S${idx + 1}`);
    const result = pickResultBySlotId.get(slotId);
    if (result) {
      runningAward += toInt(result.value, 0);
    }
  }

  return (
    <section className={`bonus-scene bonus-scene-board ${theme.toneClass}`}>
      <header className="bonus-scene-header">
        <div>
          <p className="panel-kicker">Relic Vault</p>
          <h3>Vault Chamber Picks</h3>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <span style={{ fontWeight: 600 }}>
            Picks: {Math.min(revealedCount, totalReveals)} / {totalReveals}
          </span>
          {runningAward > 0 && (
            <span style={{ fontWeight: 600, color: "#facc15" }}>
              +{awardFormatter.format(runningAward)} coins
            </span>
          )}
          {isComplete && (
            <span style={{ color: "#4ade80", fontWeight: 600, fontSize: "0.85rem" }}>
              All tiles revealed
            </span>
          )}
        </div>
      </header>

      <div className="bonus-metrics">
        <p>Keys: {keyCount}</p>
        <p>Picks Allowed: {picksAllowed}</p>
      </div>

      <div className="vault-grid">
        {board.slice(0, 12).map((slot, index) => {
          const slotId = readString(slot.slotId, `S${index + 1}`);
          const hidden = readString(slot.hidden, "sealed reward");
          const pickResult = pickResultBySlotId.get(slotId);
          const isRevealed = revealedSet.has(index);
          const revealed = pickResult
            ? readValueFromKeys(pickResult, ["value", "jackpotTierGranted", "hidden"], hidden)
            : hidden;

          return (
            <span
              key={`slot-${slotId}-${index}`}
              className={`vault-tile ${isRevealed ? "is-revealed" : ""}`}
              style={{
                transform: isRevealed ? "rotateY(0deg) scale(1.05)" : "rotateY(180deg)",
                transition: "transform 0.6s ease, box-shadow 0.4s ease, opacity 0.3s ease",
                opacity: isRevealed ? 1 : 0.6,
                boxShadow: isRevealed ? "0 0 10px 3px rgba(250, 204, 21, 0.4)" : "none",
                transformStyle: "preserve-3d" as const,
                perspective: "600px"
              }}
            >
              <strong>{slotId}</strong>
              <small>{isRevealed ? revealed : "?"}</small>
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
  const beats = bonus.featureSession.steps.length > 0
    ? bonus.featureSession.steps.map((step) => ({
        label: step.title,
        detail: step.valueLabel ? `${step.detail} ${step.valueLabel}` : step.detail
      }))
    : revealBeats(bonus.type);

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
            <p id={descriptionId} className="bonus-hero-tagline">{theme.tagline}</p>
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
              <button
                type="button"
                className="bonus-close-inline"
                onClick={onClose}
                ref={closeButtonRef}
                style={{
                  padding: "0.6rem 1.4rem",
                  fontSize: "1rem",
                  fontWeight: 700,
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, #facc15, #f59e0b)",
                  color: "#1a1a2e",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 2px 8px rgba(250, 204, 21, 0.4)"
                }}
              >
                Return to Reels
              </button>
            </div>
          </div>
        </header>

        <section className="bonus-hero-grid">
          <article className={`bonus-scene bonus-hero-panel bonus-summary-scene ${toneClass}`}>
            <header className="bonus-scene-header compact">
              <div>
                <p className="panel-kicker">Payout Focus</p>
                <h3>Prize Outlook</h3>
              </div>
              <span className="bonus-inline-pill">Precomputed award</span>
            </header>

            <p className="bonus-award" style={{ fontSize: "1.6rem", fontWeight: 700 }}>
              {awardFormatter.format(bonus.expectedTotalAward)} coins
            </p>

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
              <p className="panel-kicker">Feature Session</p>
              <h3>{bonus.featureSession.summaryLabel}</h3>
            </div>
            <span className="bonus-inline-pill">{bonus.featureSession.remainingLabel}</span>
          </header>

          <div className="bonus-metrics compact">
            {bonus.featureSession.metrics.map((metric) => (
              <p key={`${metric.label}-${metric.value}`}>
                {metric.label}: {metric.value}
              </p>
            ))}
          </div>

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
          <button
            type="button"
            className="bonus-close"
            onClick={onClose}
            style={{
              padding: "0.75rem 2rem",
              fontSize: "1.1rem",
              fontWeight: 700,
              borderRadius: "8px",
              background: "linear-gradient(135deg, #facc15, #f59e0b)",
              color: "#1a1a2e",
              border: "none",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(250, 204, 21, 0.35)"
            }}
          >
            Return To Reels
          </button>
        </footer>
      </section>
    </aside>
  );
};
