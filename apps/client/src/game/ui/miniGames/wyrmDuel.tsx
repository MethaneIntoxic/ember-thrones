import { useState, type FC } from "react";

export interface WyrmDuelProps {
  onReward: (coins: number) => void;
}

interface DuelState {
  playerHp: number;
  wyrmHp: number;
  log: string;
  finished: boolean;
  reward: number;
}

function roll(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createInitialState(): DuelState {
  return {
    playerHp: 36,
    wyrmHp: 42,
    log: "Choose your opening move.",
    finished: false,
    reward: 0
  };
}

export const WyrmDuel: FC<WyrmDuelProps> = ({ onReward }) => {
  const [state, setState] = useState<DuelState>(() => createInitialState());

  const resolve = (mode: "attack" | "guard" | "ember"): void => {
    if (state.finished) {
      return;
    }

    const attackPower = mode === "attack" ? roll(7, 12) : mode === "ember" ? roll(10, 16) : roll(3, 6);
    const retaliation = mode === "guard" ? roll(1, 4) : roll(4, 8);

    const nextWyrmHp = Math.max(0, state.wyrmHp - attackPower);

    if (nextWyrmHp === 0) {
      const reward = 120 + roll(20, 90) + Math.floor(state.playerHp * 2);
      setState({
        playerHp: state.playerHp,
        wyrmHp: 0,
        log: `You dealt ${attackPower} and defeated the wyrm!`,
        finished: true,
        reward
      });
      return;
    }

    const nextPlayerHp = Math.max(0, state.playerHp - retaliation);

    if (nextPlayerHp === 0) {
      setState({
        playerHp: 0,
        wyrmHp: nextWyrmHp,
        log: `The wyrm struck for ${retaliation}. You were overwhelmed.`,
        finished: true,
        reward: 20
      });
      return;
    }

    setState({
      playerHp: nextPlayerHp,
      wyrmHp: nextWyrmHp,
      log: `You hit for ${attackPower}, wyrm hits back for ${retaliation}.`,
      finished: false,
      reward: 0
    });
  };

  const claim = (): void => {
    onReward(state.reward);
    setState(createInitialState());
  };

  return (
    <section className="mini-game-card">
      <header>
        <p className="panel-kicker">Mini-Game</p>
        <h3>Wyrm Duel</h3>
      </header>

      <p className="mini-game-subtitle">Defeat the wyrm before it scorches your HP to zero.</p>

      <div className="duel-stats">
        <p>Hero HP: {state.playerHp}</p>
        <p>Wyrm HP: {state.wyrmHp}</p>
      </div>

      <div className="duel-actions">
        <button type="button" onClick={() => resolve("attack")} disabled={state.finished}>
          Attack
        </button>
        <button type="button" onClick={() => resolve("guard")} disabled={state.finished}>
          Guard
        </button>
        <button type="button" onClick={() => resolve("ember")} disabled={state.finished}>
          Ember Blast
        </button>
      </div>

      <p className="duel-log">{state.log}</p>

      <footer className="mini-game-footer">
        <span>Reward: {state.reward}</span>
        <button type="button" disabled={!state.finished} onClick={claim}>
          Claim
        </button>
      </footer>
    </section>
  );
};
