import { Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { EffectTimeline } from "./effectTimeline";

export interface CellCenter {
  x: number;
  y: number;
}

interface SymbolCard {
  root: Container;
  glow: Graphics;
  frame: Graphics;
  icon: Sprite;
  label: Text;
  symbol: string;
}

interface SymbolPalette {
  card: number;
  border: number;
  glow: number;
  ink: string;
}

const DEFAULT_SYMBOL = "DRG";
const DEFAULT_SYMBOL_SPRITE = "/assets/sprites/symbol-dragon.svg";
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
  JWL: "CRN"
};

const SYMBOL_SPRITES: Record<string, string> = {
  DRG: "/assets/sprites/symbol-dragon.svg",
  ORB: "/assets/sprites/symbol-orb.svg",
  SCT: "/assets/sprites/symbol-scatter.svg",
  WLD: "/assets/sprites/symbol-wild.svg",
  CHS: "/assets/sprites/symbol-chest.svg",
  RNE: "/assets/sprites/symbol-rune.svg",
  CRN: "/assets/sprites/symbol-crown.svg"
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

export class ReelController {
  public readonly container = new Container();

  private readonly columns = 5;

  private readonly rows = 3;

  private symbolCards: SymbolCard[][] = [];

  private boardWidth = 620;

  private boardHeight = 330;

  private cellWidth = 124;

  private cellHeight = 110;

  private activeLabelSize = 16;

  private activeCardWidth = 98;

  private activeCardHeight = 102;

  public constructor() {
    this.buildGrid();
  }

  public getCellCenters(): CellCenter[][] {
    return this.symbolCards.map((column) =>
      column.map((card) => ({
        x: card.root.x,
        y: card.root.y
      }))
    );
  }

  public layout(stageWidth: number, stageHeight: number): void {
    this.boardWidth = Math.min(stageWidth * 0.95, 700);
    this.boardHeight = Math.min(stageHeight * 0.88, 420);
    this.cellWidth = this.boardWidth / this.columns;
    this.cellHeight = this.boardHeight / this.rows;

    const startX = (stageWidth - this.boardWidth) / 2;
    const startY = (stageHeight - this.boardHeight) / 2;

    const cardWidth = Math.max(72, this.cellWidth * 0.82);
    const cardHeight = Math.max(84, this.cellHeight * 0.82);

    this.activeCardWidth = cardWidth;
    this.activeCardHeight = cardHeight;
    this.activeLabelSize = Math.max(11, Math.floor(Math.min(cardWidth, cardHeight) * 0.14));

    this.container.position.set(0, 0);

    for (let col = 0; col < this.columns; col += 1) {
      for (let row = 0; row < this.rows; row += 1) {
        const card = this.symbolCards[col]?.[row];
        if (!card) {
          continue;
        }

        card.root.x = startX + this.cellWidth * (col + 0.5);
        card.root.y = startY + this.cellHeight * (row + 0.5);
        this.renderCard(card, false, row === 1);
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

        this.setCardSymbol(card, reels[col]?.[row] ?? randomSymbol());
      }
    }
  }

  public async spinTo(reels: string[][], timeline: EffectTimeline): Promise<void> {
    for (let i = 0; i < 8; i += 1) {
      this.randomizeAllSymbols();
      await timeline.wait(42 + i * 8);
    }

    this.setSymbols(reels);
    await timeline.pulse(this.container, 1.03, 180);
  }

  public setWinTint(winLines: number[]): void {
    const activeRows = new Set(winLines);

    for (let col = 0; col < this.columns; col += 1) {
      for (let row = 0; row < this.rows; row += 1) {
        const card = this.symbolCards[col]?.[row];
        if (!card) {
          continue;
        }

        this.renderCard(card, activeRows.has(row), row === 1);
      }
    }
  }

  private buildGrid(): void {
    for (let col = 0; col < this.columns; col += 1) {
      const column: SymbolCard[] = [];

      for (let row = 0; row < this.rows; row += 1) {
        const symbol = randomSymbol();
        const root = new Container();
        const glow = new Graphics();
        const frame = new Graphics();
        const icon = Sprite.from(spriteFor(symbol));
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
          symbol
        };

        this.renderCard(card, false, row === 1);
        this.container.addChild(root);
        column.push(card);
      }

      this.symbolCards.push(column);
    }
  }

  private randomizeAllSymbols(): void {
    for (let col = 0; col < this.columns; col += 1) {
      for (let row = 0; row < this.rows; row += 1) {
        const card = this.symbolCards[col]?.[row];
        if (!card) {
          continue;
        }

        this.setCardSymbol(card, randomSymbol());
      }
    }
  }

  private setCardSymbol(card: SymbolCard, rawSymbol: string): void {
    const symbol = normalizeSymbol(rawSymbol);
    card.symbol = symbol;
    card.icon.texture = Texture.from(spriteFor(symbol));
    card.label.text = symbol;
  }

  private renderCard(card: SymbolCard, emphasized: boolean, centerRow: boolean): void {
    const palette = paletteFor(card.symbol);
    const width = this.activeCardWidth;
    const height = this.activeCardHeight;

    card.glow.clear();
    card.glow
      .roundRect(-width * 0.52, -height * 0.52, width * 1.04, height * 1.04, 20)
      .fill({ color: palette.glow, alpha: emphasized ? 0.32 : 0.12 });

    card.frame.clear();
    card.frame
      .roundRect(-width / 2, -height / 2, width, height, 16)
      .fill({ color: palette.card, alpha: centerRow ? 0.96 : 0.91 });
    card.frame
      .roundRect(-width / 2, -height / 2, width, height, 16)
      .stroke({
        color: emphasized ? 0xffe9b2 : palette.border,
        alpha: emphasized ? 1 : 0.76,
        width: emphasized ? 4 : 2
      });
    card.frame
      .roundRect(-width * 0.46, -height * 0.43, width * 0.92, height * 0.86, 13)
      .stroke({ color: 0xfff2d3, alpha: emphasized ? 0.72 : 0.25, width: 1 });

    const iconSize = Math.max(28, Math.min(width, height) * 0.45);
    card.icon.width = iconSize;
    card.icon.height = iconSize;
    card.icon.y = -height * 0.1;
    card.icon.alpha = emphasized ? 1 : 0.92;

    card.label.y = height * 0.29;
    card.label.style = this.createLabelStyle(this.activeLabelSize, palette.ink, emphasized);
  }

  private createLabelStyle(fontSize: number, fill: string, emphasized: boolean): TextStyle {
    return new TextStyle({
      fontFamily: "Cinzel, Georgia, serif",
      fontSize,
      fill,
      stroke: emphasized ? { color: "#2f1128", width: 4 } : { color: "#2f1128", width: 3 },
      fontWeight: "700"
    });
  }
}
