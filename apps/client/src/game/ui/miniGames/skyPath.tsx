import { useState, type FC } from "react";

type Side = "left" | "right";

export interface SkyPathProps {
  onReward: (coins: number) => void;
}

function buildSafePath(length: number): Side[] {
  return Array.from({ length }, () => (Math.random() > 0.5 ? "left" : "right"));
}

export const SkyPath: FC<SkyPathProps> = ({ onReward }) => {
  const pathLength = 4;
  const [safePath, setSafePath] = useState<Side[]>(() => buildSafePath(pathLength));
  const [step, setStep] = useState(0);
  const [reward, setReward] = useState(30);
  const [failed, setFailed] = useState(false);

  const completed = step >= pathLength;
  const roundOver = failed || completed;

  const choose = (side: Side): void => {
    if (roundOver) {
      return;
    }

    const safeSide = safePath[step];

    if (side === safeSide) {
      setStep((current) => current + 1);
      setReward((current) => Math.floor(current * 1.6));
      return;
    }

    setFailed(true);
  };

  const reset = (): void => {
    setSafePath(buildSafePath(pathLength));
    setStep(0);
    setReward(30);
    setFailed(false);
  };

  const claim = (): void => {
    const payout = failed ? 12 : reward;
    onReward(payout);
    reset();
  };

  const cashOut = (): void => {
    onReward(Math.floor(reward * 0.85));
    reset();
  };

  return (
    <section className="mini-game-card">
      <header>
        <p className="panel-kicker">Mini-Game</p>
        <h3>Sky Path</h3>
      </header>

      <p className="mini-game-subtitle">
        Climb floating ledges. Wrong turn drops your reward.
      </p>

      <div className="path-steps">
        {Array.from({ length: pathLength }, (_, index) => (
          <span key={index} className={index < step ? "step done" : "step"}>
            {index + 1}
          </span>
        ))}
      </div>

      <div className="path-actions">
        <button type="button" onClick={() => choose("left")} disabled={roundOver}>
          Left
        </button>
        <button type="button" onClick={() => choose("right")} disabled={roundOver}>
          Right
        </button>
      </div>

      <footer className="mini-game-footer">
        <span>Potential Reward: {reward}</span>

        <button type="button" onClick={cashOut} disabled={roundOver || step === 0}>
          Cash Out
        </button>

        <button type="button" onClick={claim} disabled={!roundOver}>
          Resolve
        </button>
      </footer>
    </section>
  );
};
