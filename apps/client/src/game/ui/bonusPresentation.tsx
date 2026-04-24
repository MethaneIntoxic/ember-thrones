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

function toRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => isRecord(entry)) : [];
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((segment) => `${segment.slice(0, 1).toUpperCase()}${segment.slice(1)}`)
    .join(" ");
}

function formatModifierLabel(modifierId: ActiveBonusPresentation["freeGamesModifierId"]): string {
  return titleCase(modifierId.replace(/_/g, " "));
}

function modifierDetail(modifierId: ActiveBonusPresentation["freeGamesModifierId"]): string {
  if (modifierId === "MYSTERY_SPECIAL_REVEAL") {
    return "Mystery positions resolve into premium symbols and wilds during the feature.";
  }

  if (modifierId === "EXPANDING_WILD_REELS") {
    return "Wild reels expand through the feature package to increase line coverage.";
  }

  return "Royal symbols are removed so premium icons and feature symbols show up more often.";
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

function readOrbLabel(record: Record<string, unknown>): string {
  const jackpotTier = readString(record.jackpotTier, "");
  if (jackpotTier) {
    return jackpotTier.toUpperCase();
  }

  const coinValue = toInt(record.coinValue, -1);
  if (coinValue >= 0) {
    return `+${awardFormatter.format(coinValue)}`;
  }

  return "ORB";
}

function revealBeats(bonus: ActiveBonusPresentation): RevealBeat[] {
  if (bonus.type === "HOLD_AND_SPIN") {
    return [
      { label: "Lock", detail: "Six or more orbs pin onto the 5x3 board and start the respin loop." },
      { label: "Reset", detail: "Every new orb lands sticky and snaps the counter back to three." },
      { label: "Grand Chase", detail: "Filling all 15 spots awards the Grand on a qualifying wager." }
    ];
  }

  return [
    { label: "Award", detail: `${bonus.scatterTriggerConfig.minScatters}+ scatters award the feature package.` },
    { label: "Modifier", detail: modifierDetail(bonus.freeGamesModifierId) },
    { label: "Retrigger", detail: `Extra scatters can add ${bonus.scatterTriggerConfig.retriggerAward} more games mid-feature.` }
  ];
}

function openAgeLabel(openedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - openedAt) / 1000));
  return `${seconds}s ago`;
}

const HoldAndSpinScene: FC<{ bonus: ActiveBonusPresentation }> = ({ bonus }) => {
  const theme = getBonusTheme(bonus.type);
  const outcome = bonus.precomputedOutcome;
  const startingOrbs = toRecordArray(outcome.startingOrbs);
  const revealSteps = toRecordArray(outcome.steps);
  const initialRespins = Math.max(1, toInt(outcome.respinsRemaining, bonus.orbTriggerConfig.resetSpins));

  const initialLocked = new Set<number>();
  const initialLabels = new Map<number, string>();
  let initialCoinTotal = 0;

  for (const orb of startingOrbs) {
    const boardIndex = normalizeBoardIndex(toInt(orb.position, -1));
    if (boardIndex === null) {
      continue;
    }

    initialLocked.add(boardIndex);
    initialLabels.set(boardIndex, readOrbLabel(orb));
    initialCoinTotal += toInt(orb.coinValue, 0);
  }

  const snapshots: Array<{
    locked: Set<number>;
    labels: Map<number, string>;
    coinTotal: number;
    respinsRemaining: number;
  }> = [];

  const locked = new Set(initialLocked);
  const labels = new Map(initialLabels);
  let runningCoinTotal = initialCoinTotal;

  for (const step of revealSteps) {
    const landedOrbs = toRecordArray(step.landedOrbs);
    for (const orb of landedOrbs) {
      const boardIndex = normalizeBoardIndex(toInt(orb.position, -1));
      if (boardIndex === null) {
        continue;
      }

      locked.add(boardIndex);
      labels.set(boardIndex, readOrbLabel(orb));
      runningCoinTotal += toInt(orb.coinValue, 0);
    }

    snapshots.push({
      locked: new Set(locked),
      labels: new Map(labels),
      coinTotal: runningCoinTotal,
      respinsRemaining: toInt(step.respinsRemainingAfter, initialRespins)
    });
  }

  const [revealedSteps, setRevealedSteps] = useState(0);

  useEffect(() => {
    if (snapshots.length === 0) {
      return undefined;
    }

    setRevealedSteps(0);
    const timer = window.setInterval(() => {
      setRevealedSteps((current) => {
        if (current >= snapshots.length) {
          window.clearInterval(timer);
          return current;
        }

        return current + 1;
      });
    }, 850);

    return () => {
      window.clearInterval(timer);
    };
  }, [snapshots.length]);

  const activeSnapshot =
    revealedSteps > 0 ? snapshots[Math.min(revealedSteps - 1, snapshots.length - 1)] : null;
  const activeLocked = activeSnapshot?.locked ?? initialLocked;
  const activeLabels = activeSnapshot?.labels ?? initialLabels;
  const activeCoinTotal = activeSnapshot?.coinTotal ?? initialCoinTotal;
  const activeRespins = activeSnapshot?.respinsRemaining ?? initialRespins;
  const boardCells = bonus.orbTriggerConfig.boardCells;
  const isFullBoard = activeLocked.size >= boardCells || bonus.jackpotTiersHit.includes("grand");

  return (
    <section className={`bonus-scene ${theme.toneClass}`}>
      <header className="bonus-scene-header">
        <div>
          <p className="panel-kicker">{theme.kicker}</p>
          <h3>Linked Orb Board</h3>
        </div>
        <div className="scene-status-stack">
          <span className="bonus-inline-pill">
            {activeLocked.size} / {boardCells} locked
          </span>
          {snapshots.length > 0 ? (
            <span className="scene-status-text">
              Reveal {Math.min(revealedSteps + 1, snapshots.length)} of {snapshots.length}
            </span>
          ) : null}
        </div>
      </header>

      <div className="bonus-metrics">
        <p>Coin Values: {awardFormatter.format(activeCoinTotal)} coins</p>
        <p>Respins Left: {activeRespins}</p>
        <p>Jackpot Chase: {isFullBoard ? "Grand path complete" : "Board still open"}</p>
      </div>

      <div className="hold-and-spin-board" aria-label="Hold and Spin bonus board">
        {Array.from({ length: boardCells }, (_, index) => {
          const isLocked = activeLocked.has(index);
          const label = activeLabels.get(index);

          return (
            <div
              key={`orb-cell-${index}`}
              className={`orb-cell ${isLocked ? "is-locked" : ""}`}
              style={{
                transform: isLocked ? "scale(1.03)" : "scale(1)",
                transition: "transform 0.35s ease, box-shadow 0.35s ease, opacity 0.25s ease",
                opacity: isLocked ? 1 : 0.42
              }}
            >
              <span className="bonus-cell-index">{index + 1}</span>
              <strong>{label ?? "ORB"}</strong>
            </div>
          );
        })}
      </div>

      {bonus.jackpotAwards.length > 0 || bonus.jackpotTiersHit.length > 0 ? (
        <div className="bonus-chip-grid">
          {bonus.jackpotAwards.map((award, index) => (
            <span key={`${award.tier}-${index}`} className="bonus-chip is-active">
              {award.tier.toUpperCase()}: {awardFormatter.format(award.amount)}
            </span>
          ))}
          {bonus.jackpotAwards.length === 0
            ? bonus.jackpotTiersHit.map((tier, index) => (
                <span key={`${tier}-${index}`} className="bonus-chip is-active">
                  {tier.toUpperCase()} queued
                </span>
              ))
            : null}
        </div>
      ) : null}
    </section>
  );
};

const FreeGamesScene: FC<{ bonus: ActiveBonusPresentation }> = ({ bonus }) => {
  const theme = getBonusTheme(bonus.type);
  const outcome = bonus.precomputedOutcome;
  const steps = toRecordArray(outcome.steps);
  const initialGames = toInt(outcome.initialGames, bonus.scatterTriggerConfig.baseAwardedGames);
  const totalAwardedGames = Math.max(initialGames, toInt(outcome.totalAwardedGames, initialGames));
  const retriggers = toInt(outcome.retriggerCount, 0);
  const modifierLabel = formatModifierLabel(bonus.freeGamesModifierId);

  const [revealedCount, setRevealedCount] = useState(0);

  useEffect(() => {
    if (steps.length === 0) {
      return undefined;
    }

    setRevealedCount(0);
    const timer = window.setInterval(() => {
      setRevealedCount((current) => {
        if (current >= steps.length) {
          window.clearInterval(timer);
          return current;
        }

        return current + 1;
      });
    }, 700);

    return () => {
      window.clearInterval(timer);
    };
  }, [steps.length]);

  const visibleSteps = steps.slice(0, revealedCount);
  const runningAward = visibleSteps.reduce(
    (total, step) => total + toInt(step.awardedWin, toInt(step.lineWin, 0)),
    0
  );
  const gamesRemaining =
    visibleSteps.length > 0
      ? toInt(visibleSteps[visibleSteps.length - 1]?.gamesRemainingAfter, Math.max(0, totalAwardedGames - visibleSteps.length))
      : totalAwardedGames;

  return (
    <section className={`bonus-scene ${theme.toneClass}`}>
      <header className="bonus-scene-header">
        <div>
          <p className="panel-kicker">{theme.kicker}</p>
          <h3>{modifierLabel}</h3>
        </div>
        <div className="scene-status-stack">
          <span className="bonus-inline-pill">{totalAwardedGames} games awarded</span>
          {steps.length > 0 ? (
            <span className="scene-status-text">
              Reveal {Math.min(revealedCount + 1, steps.length)} of {steps.length}
            </span>
          ) : null}
        </div>
      </header>

      <div className="bonus-metrics">
        <p>Modifier: {modifierLabel}</p>
        <p>Games Left: {gamesRemaining}</p>
        <p>Retriggers: {retriggers}</p>
      </div>

      <p className="bonus-scene-copy modifier-callout">{modifierDetail(bonus.freeGamesModifierId)}</p>

      <div className="free-games-grid" aria-label="Free Games reveal trail">
        {steps.map((step, index) => {
          const isVisible = index < revealedCount;
          const awardedWin = toInt(step.awardedWin, toInt(step.lineWin, 0));
          const extraGames = toInt(step.awardedExtraGames, 0);
          const scatterCount = toInt(step.scatterCount, 0);
          const gamesLeft = toInt(step.gamesRemainingAfter, Math.max(0, totalAwardedGames - index - 1));

          return (
            <article
              key={`free-game-${index + 1}`}
              className={`free-game-card ${isVisible ? "is-visible" : ""}`}
              style={{
                opacity: isVisible ? 1 : 0.35,
                transform: isVisible ? "translateY(0)" : "translateY(10px)",
                transition: "opacity 0.35s ease, transform 0.35s ease"
              }}
            >
              <p className="panel-kicker">Game {index + 1}</p>
              <strong>{awardFormatter.format(awardedWin)} coins</strong>
              <span>{scatterCount > 0 ? `${scatterCount} scatter${scatterCount === 1 ? "" : "s"}` : "No scatter retrigger"}</span>
              <span>{gamesLeft} left</span>
              {extraGames > 0 ? <span className="feature-live">+{extraGames} retrigger</span> : null}
            </article>
          );
        })}
      </div>

      <p className="bonus-award">Running Award: {awardFormatter.format(runningAward)} coins</p>
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
  const beats =
    bonus.featureSession.steps.length > 0
      ? bonus.featureSession.steps.map((step) => ({
          label: step.title,
          detail: step.valueLabel ? `${step.detail} ${step.valueLabel}` : step.detail
        }))
      : revealBeats(bonus);

  return (
    <aside
      className={`bonus-overlay ${theme.toneClass}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="bonus-overlay-backdrop" onClick={onClose} aria-hidden="true" />

      <section className={`bonus-overlay-panel ${theme.toneClass}`}>
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
              <button type="button" className="bonus-close-inline" onClick={onClose} ref={closeButtonRef}>
                Return to Reels
              </button>
            </div>
          </div>
        </header>

        <section className="bonus-hero-grid">
          <article className={`bonus-scene bonus-summary-scene ${theme.toneClass}`}>
            <header className="bonus-scene-header compact">
              <div>
                <p className="panel-kicker">Payout Focus</p>
                <h3>Prize Outlook</h3>
              </div>
              <span className="bonus-inline-pill">{bonus.featureSession.remainingLabel}</span>
            </header>

            <p className="bonus-award">{awardFormatter.format(bonus.expectedTotalAward)} coins</p>

            {bonus.jackpotAwards.length > 0 ? (
              <ul className="bonus-jackpot-awards">
                {bonus.jackpotAwards.map((award, index) => (
                  <li key={`${award.tier}-${index}`}>
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

          <article className={`bonus-scene ${theme.toneClass}`}>
            <header className="bonus-scene-header compact">
              <div>
                <p className="panel-kicker">Runtime Honesty</p>
                <h3>{bonusTransportLabel(bonus.transport)}</h3>
              </div>
              <span className="bonus-inline-pill">{bonusSourceLabel(bonus.source)}</span>
            </header>

            <p className="bonus-scene-copy">{transportDisclosure(bonus)}</p>
            <div className="feature-metrics">
              <p className="metric-row">
                <span>Variant</span>
                <strong>{bonus.gameVariantId}</strong>
              </p>
              <p className="metric-row">
                <span>Modifier</span>
                <strong>{formatModifierLabel(bonus.freeGamesModifierId)}</strong>
              </p>
              <p className="metric-row">
                <span>Opened</span>
                <strong>{openAgeLabel(bonus.openedAt)}</strong>
              </p>
            </div>
          </article>
        </section>

        <section className={`bonus-scene bonus-sequence-scene ${theme.toneClass}`}>
          <header className="bonus-scene-header compact">
            <div>
              <p className="panel-kicker">Feature Session</p>
              <h3>{bonus.featureSession.summaryLabel}</h3>
            </div>
            <span className="bonus-inline-pill">{theme.liveLabel}</span>
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

        {bonus.type === "HOLD_AND_SPIN" ? <HoldAndSpinScene bonus={bonus} /> : null}
        {bonus.type === "FREE_GAMES" ? <FreeGamesScene bonus={bonus} /> : null}

        <footer className="bonus-overlay-footer">
          <button type="button" className="bonus-close" onClick={onClose}>
            Return To Reels
          </button>
        </footer>
      </section>
    </aside>
  );
};
