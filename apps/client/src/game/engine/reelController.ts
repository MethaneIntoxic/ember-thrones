import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import type { SpinSpeedMode } from "../net/apiClient";
import { EffectTimeline } from "./effectTimeline";

export interface CellCenter {
  x: number;
  y: number;
  cellWidth: number;
  cellHeight: number;
}

interface SymbolCard {
  root: Container;
  glow: Graphics;
  frame: Graphics;
  icon: Sprite;
  label: Text;
  symbol: string;
  row: number;
}

interface SymbolPalette {
  card: number;
  border: number;
  glow: number;
  ink: string;
}

interface SpinTimingProfile {
  startStaggerMs: number;
  spinDurationMs: number;
  settleDurationMs: number;
  boardPulseMs: number;
  symbolCycles: number;
  anticipationDelayMs: number;
  anticipationHoldMs: number;
  highlightDelayMs: number;
}

const DEFAULT_SYMBOL = "DRG";
const BASE_URL = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

function toAssetPath(relativePath: string): string {
  return `${BASE_URL}${relativePath.replace(/^\/+/, "")}`;
}

const DEFAULT_SYMBOL_SPRITE = toAssetPath("assets/sprites/symbol-dragon.svg");
const DEFAULT_SYMBOL_PALETTE: SymbolPalette = {
  card: 0x2a1720,
  border: 0xff9f59,
  glow: 0xff8a4c,
  ink: "#ffe2be"
};

const SYMBOL_POOL = ["DRG", "ORB", "SCT", "WLD", "CHS", "RNE", "CRN"];

const SYMBOL_ALIASES: Record<string, string> = {
  QST: "SCT",
  BLD: "CHS",
  RNG: "RNE",
  JWL: "CRN",
  DRAGON: "DRG",
  WILD: "WLD",
  SCATTER: "SCT",
  A: "CRN",
  K: "RNE",
  Q: "CHS",
  J: "CHS",
  "10": "RNE"
};

const SYMBOL_SPRITES: Record<string, string> = {
  DRG: toAssetPath("assets/sprites/symbol-dragon.svg"),
  ORB: toAssetPath("assets/sprites/symbol-orb.svg"),
  SCT: toAssetPath("assets/sprites/symbol-scatter.svg"),
  WLD: toAssetPath("assets/sprites/symbol-wild.svg"),
  CHS: toAssetPath("assets/sprites/symbol-chest.svg"),
  RNE: toAssetPath("assets/sprites/symbol-rune.svg"),
  CRN: toAssetPath("assets/sprites/symbol-crown.svg")
};

const SYMBOL_PALETTE: Record<string, SymbolPalette> = {
  DRG: { card: 0x2a1720, border: 0xff9f59, glow: 0xff8a4c, ink: "#ffe2be" },
  ORB: { card: 0x1d2132, border: 0x7dcfff, glow: 0x4ec7ff, ink: "#cbeeff" },
  SCT: { card: 0x2b1b3a, border: 0xa9a8ff, glow: 0x9d8eff, ink: "#ece2ff" },
  WLD: { card: 0x302412, border: 0xffd46e, glow: 0xffbf4e, ink: "#fff0c9" },
  CHS: { card: 0x2f2417, border: 0xe6a96a, glow: 0xe7a554, ink: "#f6e0c7" },
  RNE: { card: 0x172830, border: 0x68d8cf, glow: 0x45c6d4, ink: "#cff6ef" },
  CRN: { card: 0x311f16, border: 0xffd57e, glow: 0xf6c468, ink: "#ffefce" }
};

function normalizeSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  const mapped = SYMBOL_ALIASES[upper] ?? upper;
  return Object.prototype.hasOwnProperty.call(SYMBOL_SPRITES, mapped) ? mapped : DEFAULT_SYMBOL;
}

function randomSymbol(): string {
  return SYMBOL_POOL[Math.floor(Math.random() * SYMBOL_POOL.length)] ?? DEFAULT_SYMBOL;
}

function spriteFor(symbol: string): string {
  return SYMBOL_SPRITES[symbol] ?? DEFAULT_SYMBOL_SPRITE;
}

function paletteFor(symbol: string): SymbolPalette {
  return SYMBOL_PALETTE[symbol] ?? DEFAULT_SYMBOL_PALETTE;
}

function timingFor(mode: SpinSpeedMode): SpinTimingProfile {
  if (mode === "turbo") {
    return {
      startStaggerMs: 55,
      spinDurationMs: 220,
      settleDurationMs: 120,
      boardPulseMs: 160,
      symbolCycles: 5,
      anticipationDelayMs: 40,
      anticipationHoldMs: 80,
      highlightDelayMs: 55
    };
  }

  if (mode === "auto") {
    return {
      startStaggerMs: 70,
      spinDurationMs: 260,
      settleDurationMs: 145,
      boardPulseMs: 180,
      symbolCycles: 6,
      anticipationDelayMs: 60,
      anticipationHoldMs: 105,
      highlightDelayMs: 70
    };
  }

  return {
    startStaggerMs: 105,
    spinDurationMs: 410,
    settleDurationMs: 220,
    boardPulseMs: 240,
    symbolCycles: 8,
    anticipationDelayMs: 90,
    anticipationHoldMs: 180,
    highlightDelayMs: 110
  };
}

export class ReelController {
  public readonly container = new Container();

  private texturesReady = false;

  private readonly columns = 5;

  private readonly rows = 3;

  private readonly columnContainers: Container[] = [];

  private symbolCards: SymbolCard[][] = [];

  private boardWidth = 620;

  private boardHeight = 330;

  private boardX = 0;

  private boardY = 0;

  private cellWidth = 124;

  private cellHeight = 110;

  private activeLabelSize = 16;

  private activeCardWidth = 98;

  private activeCardHeight = 102;

  public constructor() {
    this.buildGrid();
  }

  public async warmTextureCache(): Promise<void> {
    if (this.texturesReady) {
      return;
    }

    try {
      await Promise.all(Object.values(SYMBOL_SPRITES).map((assetPath) => Assets.load(assetPath)));
      this.texturesReady = true;
      this.refreshTextures();
    } catch (error) {
      console.warn("[reel] texture warmup failed, using fallback texture.", error);
      this.texturesReady = false;
    }
  }

  public getCellCenters(): CellCenter[][] {
    return this.symbolCards.map((column, columnIndex) => {
      const columnRoot = this.columnContainers[columnIndex];
      const offsetX = columnRoot?.x ?? 0;
      const offsetY = columnRoot?.y ?? 0;

      return column.map((card) => ({
        x: offsetX + card.root.x,
        y: offsetY + card.root.y,
        cellWidth: this.cellWidth,
        cellHeight: this.cellHeight
      }));
    });
  }

  public getBoardBounds(): { x: number; y: number; width: number; height: number } {
    return {
      x: this.boardX,
      y: this.boardY,
      width: this.boardWidth,
      height: this.boardHeight
    };
  }

  public layout(stageWidth: number, stageHeight: number): void {
    this.boardWidth = Math.min(stageWidth * 0.95, 700);
    this.boardHeight = Math.min(stageHeight * 0.88, 420);
    this.cellWidth = this.boardWidth / this.columns;
    this.cellHeight = this.boardHeight / this.rows;

    const startX = (stageWidth - this.boardWidth) / 2;
    const startY = (stageHeight - this.boardHeight) / 2;

    this.boardX = startX;
    this.boardY = startY;

    const cardWidth = Math.max(48, Math.min(this.cellWidth - 10, this.cellWidth * 0.78));
    const cardHeight = Math.max(56, Math.min(this.cellHeight - 12, this.cellHeight * 0.78));

    this.activeCardWidth = cardWidth;
    this.activeCardHeight = cardHeight;
    this.activeLabelSize = Math.max(11, Math.floor(Math.min(cardWidth, cardHeight) * 0.14));

    this.container.position.set(0, 0);

    for (let col = 0; col < this.columns; col += 1) {
      const columnRoot = this.columnContainers[col];
      if (!columnRoot) {
        continue;
      }

      columnRoot.position.set(startX + this.cellWidth * (col + 0.5), startY + this.cellHeight * 0.5);
      columnRoot.scale.set(1);
      columnRoot.alpha = 1;

      for (let row = 0; row < this.rows; row += 1) {
        const card = this.symbolCards[col]?.[row];
        if (!card) {
          continue;
        }

        card.root.x = 0;
        card.root.y = this.cellHeight * row;
        card.root.rotation = 0;
        this.renderCard(card, false, card.row === 1);
      }
    }
  }

  public setSymbols(reels: string[][]): void {
    for (let col = 0; col < this.columns; col += 1) {
      for (let row = 0; row < this.rows; row += 1) {
        const card = this.symbolCards[col]?.[row];
        if (!card) {
          continue;
        }

        this.setCardSymbol(card, reels[col]?.[row] ?? randomSymbol(), false);
      }
    }
  }

  public async spinTo(
    reels: string[][],
    timeline: EffectTimeline,
    speedMode: SpinSpeedMode = "normal"
  ): Promise<void> {
    const timing = timingFor(speedMode);
    const anticipationColumns = this.resolveAnticipationColumns(reels);

    await Promise.all(
      this.columnContainers.map((_, columnIndex) =>
        this.animateColumnSpin(
          columnIndex,
          reels[columnIndex] ?? [],
          timeline,
          timing,
          anticipationColumns.has(columnIndex)
        )
      )
    );

    await timeline.pulse(this.container, speedMode === "normal" ? 1.03 : 1.02, timing.boardPulseMs);
  }

  public setWinTint(winLines: number[]): void {
    const activeRows = new Set(winLines);

    for (let col = 0; col < this.columns; col += 1) {
      for (let row = 0; row < this.rows; row += 1) {
        const card = this.symbolCards[col]?.[row];
        if (!card) {
          continue;
        }

        this.renderCard(card, activeRows.has(row), card.row === 1);
      }
    }
  }

  public async choreographWinLines(
    winLines: number[],
    timeline: EffectTimeline,
    speedMode: SpinSpeedMode = "normal"
  ): Promise<void> {
    const lines = Array.from(new Set(winLines)).filter((row) => row >= 0 && row < this.rows);
    if (lines.length === 0) {
      this.setWinTint([]);
      return;
    }

    const timing = timingFor(speedMode);

    for (const row of lines) {
      this.setWinTint([row]);
      await timeline.wait(timing.highlightDelayMs);
    }

    this.setWinTint(lines);
  }

  private buildGrid(): void {
    for (let col = 0; col < this.columns; col += 1) {
      const columnRoot = new Container();
      const column: SymbolCard[] = [];

      this.columnContainers.push(columnRoot);
      this.container.addChild(columnRoot);

      for (let row = 0; row < this.rows; row += 1) {
        const symbol = randomSymbol();
        const root = new Container();
        const glow = new Graphics();
        const frame = new Graphics();
        const icon = Sprite.from(Texture.WHITE);
        const label = new Text(symbol);

        icon.anchor.set(0.5);
        label.anchor.set(0.5);

        root.addChild(glow);
        root.addChild(frame);
        root.addChild(icon);
        root.addChild(label);

        const card: SymbolCard = {
          root,
          glow,
          frame,
          icon,
          label,
          symbol,
          row
        };

        this.renderCard(card, false, row === 1);
        columnRoot.addChild(root);
        column.push(card);
      }

      this.symbolCards.push(column);
    }
  }

  private refreshTextures(): void {
    for (let col = 0; col < this.columns; col += 1) {
      for (let row = 0; row < this.rows; row += 1) {
        const card = this.symbolCards[col]?.[row];
        if (!card) {
          continue;
        }

        this.applySymbolTexture(card);
      }
    }
  }

  private resolveAnticipationColumns(reels: string[][]): Set<number> {
    const flat = reels.flat();
    const orbCount = flat.filter((symbol) => symbol === "ORB").length;
    const scatterCount = flat.filter((symbol) => symbol === "SCT").length;
    const chestCount = flat.filter((symbol) => symbol === "CHS").length;
    const dragonCount = flat.filter((symbol) => symbol === "DRG").length;
    const columns = new Set<number>();

    if (orbCount >= 4 || scatterCount >= 2 || chestCount >= 2) {
      columns.add(3);
    }

    if (orbCount >= 6 || scatterCount >= 3 || (chestCount >= 3 && dragonCount >= 1)) {
      columns.add(4);
    }

    return columns;
  }

  private applyColumnFocus(cards: SymbolCard[], active: boolean): void {
    for (const card of cards) {
      this.renderCard(card, active, card.row === 1);
    }
  }

  private async animateColumnSpin(
    columnIndex: number,
    targetSymbols: string[],
    timeline: EffectTimeline,
    timing: SpinTimingProfile,
    anticipation: boolean
  ): Promise<void> {
    const columnRoot = this.columnContainers[columnIndex];
    const cards = this.symbolCards[columnIndex];

    if (!columnRoot || !cards) {
      return;
    }

    await timeline.wait(columnIndex * timing.startStaggerMs);

    const baseY = this.boardY + this.cellHeight * 0.5;
    const durationMs = timing.spinDurationMs + columnIndex * Math.round(timing.startStaggerMs * 0.55);
    const totalSteps = timing.symbolCycles + columnIndex;
    let previousStep = -1;

    this.applyColumnFocus(cards, anticipation && columnIndex >= 3);

    await timeline.tween(durationMs, (progress) => {
      const step = Math.floor(progress * totalSteps);
      if (step !== previousStep) {
        previousStep = step;
        for (const card of cards) {
          this.setCardSymbol(card, randomSymbol(), false);
        }
      }

      const spinWave = Math.sin(progress * Math.PI * (2 + columnIndex * 0.16));
      const verticalTravel = (1 - progress) * this.cellHeight * 0.4;
      columnRoot.y = baseY - spinWave * verticalTravel;
      columnRoot.scale.x = 1 + (1 - progress) * 0.018;
      columnRoot.scale.y = 0.88 + progress * 0.12;
      columnRoot.alpha = 0.66 + progress * 0.34;

      for (let rowIndex = 0; rowIndex < cards.length; rowIndex += 1) {
        const card = cards[rowIndex];
        if (!card) {
          continue;
        }

        const laneOffset = (1 - progress) * (rowIndex + 1) * 4.1;
        card.root.y =
          this.cellHeight * rowIndex -
          laneOffset * Math.sin(progress * Math.PI * 2.4 + rowIndex * 0.48 + columnIndex * 0.22);
        card.root.rotation = (1 - progress) * 0.026 * Math.sin(progress * Math.PI * 7 + rowIndex + columnIndex * 0.3);
      }
    });

    if (anticipation) {
      this.applyColumnFocus(cards, true);
      await timeline.tween(timing.anticipationDelayMs, (progress) => {
        const pulse = Math.sin(progress * Math.PI);
        columnRoot.scale.set(1 + pulse * 0.024, 1 - pulse * 0.016);
        columnRoot.alpha = 0.92 + pulse * 0.08;
      });
      await timeline.wait(timing.anticipationHoldMs);
    }

    for (let rowIndex = 0; rowIndex < cards.length; rowIndex += 1) {
      const card = cards[rowIndex];
      if (!card) {
        continue;
      }

      this.setCardSymbol(card, targetSymbols[rowIndex] ?? randomSymbol(), false);
    }

    await timeline.tween(timing.settleDurationMs, (progress) => {
      const settleWave = Math.sin(progress * Math.PI);
      const settle = 1 - Math.pow(1 - progress, 3);
      columnRoot.y = baseY - (1 - settle) * this.cellHeight * (anticipation ? 0.22 : 0.16);
      columnRoot.scale.set(1 + settleWave * 0.018, 1 - settleWave * 0.03);

      for (let rowIndex = 0; rowIndex < cards.length; rowIndex += 1) {
        const card = cards[rowIndex];
        if (!card) {
          continue;
        }

        const laneWeight = rowIndex === 1 ? -2 : 1;
        card.root.y = this.cellHeight * rowIndex + laneWeight * settleWave * (anticipation ? 1.4 : 1);
        card.root.rotation = 0;
      }
    });

    columnRoot.position.y = baseY;
    columnRoot.scale.set(1);
    columnRoot.alpha = 1;

    for (let rowIndex = 0; rowIndex < cards.length; rowIndex += 1) {
      const card = cards[rowIndex];
      if (!card) {
        continue;
      }

      card.root.y = this.cellHeight * rowIndex;
      card.root.rotation = 0;
    }

    this.applyColumnFocus(cards, false);
  }

  private setCardSymbol(card: SymbolCard, rawSymbol: string, emphasized: boolean): void {
    const symbol = normalizeSymbol(rawSymbol);
    card.symbol = symbol;
    this.applySymbolTexture(card);
    card.label.text = symbol;
    this.renderCard(card, emphasized, card.row === 1);
  }

  private applySymbolTexture(card: SymbolCard): void {
    if (this.texturesReady) {
      card.icon.texture = Texture.from(spriteFor(card.symbol));
      card.icon.tint = 0xffffff;
      return;
    }

    card.icon.texture = Texture.WHITE;
    card.icon.tint = paletteFor(card.symbol).border;
  }

  private renderCard(card: SymbolCard, emphasized: boolean, centerRow: boolean): void {
    const palette = paletteFor(card.symbol);
    const width = this.activeCardWidth;
    const height = this.activeCardHeight;
    const cornerRadius = Math.max(10, Math.round(Math.min(width, height) * 0.16));

    card.glow.clear();
    card.glow
      .roundRect(
        -width * 0.52,
        -height * 0.52,
        width * 1.04,
        height * 1.04,
        Math.max(cornerRadius + 3, 12)
      )
      .fill({ color: palette.glow, alpha: emphasized ? 0.34 : centerRow ? 0.18 : 0.12 });

    card.frame.clear();
    card.frame
      .roundRect(-width / 2, -height / 2, width, height, cornerRadius)
      .fill({ color: palette.card, alpha: centerRow ? 0.96 : 0.91 });
    card.frame
      .roundRect(-width / 2, -height / 2, width, height, cornerRadius)
      .stroke({
        color: emphasized ? 0xffe9b2 : palette.border,
        alpha: emphasized ? 1 : 0.76,
        width: emphasized ? 4 : 2
      });
    card.frame
      .roundRect(-width * 0.44, -height * 0.42, width * 0.88, height * 0.24, Math.max(cornerRadius - 6, 8))
      .fill({ color: 0xffffff, alpha: emphasized ? 0.12 : 0.06 });
    card.frame
      .roundRect(-width * 0.38, height * 0.16, width * 0.76, height * 0.16, Math.max(cornerRadius - 9, 6))
      .fill({ color: palette.border, alpha: centerRow ? 0.15 : 0.08 });

    if (width >= 72 && height >= 74) {
      card.frame
        .roundRect(-width * 0.46, -height * 0.43, width * 0.92, height * 0.86, Math.max(cornerRadius - 3, 8))
        .stroke({ color: 0xfff2d3, alpha: emphasized ? 0.72 : 0.25, width: 1 });
    }

    const iconSize = Math.max(22, Math.min(width * 0.44, height * 0.44));
    card.icon.width = iconSize;
    card.icon.height = iconSize;
    card.icon.y = -height * 0.11;
    card.icon.alpha = emphasized ? 1 : centerRow ? 0.96 : 0.9;

    card.label.y = height * 0.31;
    card.label.style = this.createLabelStyle(this.activeLabelSize, palette.ink, emphasized);
  }

  private createLabelStyle(fontSize: number, fill: string, emphasized: boolean): TextStyle {
    return new TextStyle({
      fontFamily: "Cinzel, Georgia, serif",
      fontSize,
      fill,
      stroke: emphasized ? { color: "#2f1128", width: 4 } : { color: "#2f1128", width: 3 },
      fontWeight: "700",
      letterSpacing: fontSize <= 12 ? 0.8 : 1.1
    });
  }
}
