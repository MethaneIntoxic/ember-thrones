import { useMemo, useState, type FC } from "react";

interface LanternTile {
  id: number;
  reward: number;
  trap: boolean;
}

export interface LanternPickProps {
  onReward: (coins: number) => void;
}

function createRound(): LanternTile[] {
  const trapIndices = new Set<number>();

  while (trapIndices.size < 2) {
    trapIndices.add(Math.floor(Math.random() * 9));
  }

  return Array.from({ length: 9 }, (_, index) => ({
    id: index,
    reward: 20 + Math.floor(Math.random() * 90),
    trap: trapIndices.has(index)
  }));
}

export const LanternPick: FC<LanternPickProps> = ({ onReward }) => {
  const [tiles, setTiles] = useState<LanternTile[]>(() => createRound());
  const [pickedIds, setPickedIds] = useState<number[]>([]);
  const [picksLeft, setPicksLeft] = useState(3);
  const [total, setTotal] = useState(0);
  const [burned, setBurned] = useState(false);

  const roundOver = burned || picksLeft === 0;

  const revealed = useMemo(() => new Set(pickedIds), [pickedIds]);

  const pickLantern = (tile: LanternTile): void => {
    if (roundOver || revealed.has(tile.id)) {
      return;
    }

    setPickedIds((current) => [...current, tile.id]);

    if (tile.trap) {
      setBurned(true);
      return;
    }

    setTotal((current) => current + tile.reward);
    setPicksLeft((current) => Math.max(0, current - 1));
  };

  const resetRound = (): void => {
    setTiles(createRound());
    setPickedIds([]);
    setPicksLeft(3);
    setTotal(0);
    setBurned(false);
  };

  const claimReward = (): void => {
    const reward = burned ? Math.floor(total * 0.4) : total + 30;
    onReward(Math.max(10, reward));
    resetRound();
  };

  return (
    <section className="mini-game-card">
      <header>
        <p className="panel-kicker">Mini-Game</p>
        <h3>Lantern Pick</h3>
      </header>

      <p className="mini-game-subtitle">Pick three lanterns, avoid the cursed flame.</p>

      <div className="lantern-grid">
        {tiles.map((tile) => {
          const isPicked = revealed.has(tile.id);

          return (
            <button
              key={tile.id}
              type="button"
              className={`lantern ${isPicked ? "is-picked" : ""}`}
              onClick={() => pickLantern(tile)}
              disabled={roundOver || isPicked}
            >
              {isPicked ? (tile.trap ? "BURN" : tile.reward) : "?"}
            </button>
          );
        })}
      </div>

      <footer className="mini-game-footer">
        <span>Picks left: {picksLeft}</span>
        <span>Current pot: {total}</span>

        <button type="button" onClick={claimReward} disabled={!roundOver}>
          Claim
        </button>
      </footer>
    </section>
  );
};
