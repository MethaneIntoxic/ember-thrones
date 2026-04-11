import { Container, Text, TextStyle } from "pixi.js";
import { EffectTimeline } from "./effectTimeline";

export interface CellCenter {
  x: number;
  y: number;
}

const SYMBOL_POOL = ["DRG", "ORB", "QST", "RNG", "BLD", "JWL", "WLD"];

function randomSymbol(): string {
  return SYMBOL_POOL[Math.floor(Math.random() * SYMBOL_POOL.length)] ?? "DRG";
}

export class ReelController {
  public readonly container = new Container();

  private readonly columns = 5;

  private readonly rows = 3;

  private symbolTexts: Text[][] = [];

  private boardWidth = 620;

  private boardHeight = 330;

  private cellWidth = 124;

  private cellHeight = 110;

  private activeFontSize = 42;

  public constructor() {
    this.buildGrid();
  }

  public getCellCenters(): CellCenter[][] {
    return this.symbolTexts.map((column) =>
      column.map((text) => ({
        x: text.x,
        y: text.y
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

    this.container.position.set(0, 0);

    for (let col = 0; col < this.columns; col += 1) {
      for (let row = 0; row < this.rows; row += 1) {
        const text = this.symbolTexts[col]?.[row];
        if (!text) {
          continue;
        }

        text.x = startX + this.cellWidth * (col + 0.5);
        text.y = startY + this.cellHeight * (row + 0.5);

        const fontSize = Math.max(22, Math.min(this.cellWidth, this.cellHeight) * 0.32);
        this.activeFontSize = fontSize;
        text.style = this.createSymbolStyle(fontSize, row === 1 ? "#f8d489" : "#d9c2a6", false);
      }
    }
  }

  public setSymbols(reels: string[][]): void {
    for (let col = 0; col < this.columns; col += 1) {
      for (let row = 0; row < this.rows; row += 1) {
        const text = this.symbolTexts[col]?.[row];
        if (!text) {
          continue;
        }

        text.text = reels[col]?.[row] ?? randomSymbol();
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
        const text = this.symbolTexts[col]?.[row];
        if (!text) {
          continue;
        }

        const baseFill = row === 1 ? "#f8d489" : "#d9c2a6";
        const fill = activeRows.has(row) ? "#ffefb0" : baseFill;
        text.style = this.createSymbolStyle(this.activeFontSize, fill, activeRows.has(row));
      }
    }
  }

  private buildGrid(): void {
    for (let col = 0; col < this.columns; col += 1) {
      const column: Text[] = [];

      for (let row = 0; row < this.rows; row += 1) {
        const symbolText = new Text(randomSymbol());
        symbolText.style = this.createSymbolStyle(42, "#d9c2a6", false);

        symbolText.anchor.set(0.5);
        this.container.addChild(symbolText);
        column.push(symbolText);
      }

      this.symbolTexts.push(column);
    }
  }

  private randomizeAllSymbols(): void {
    for (let col = 0; col < this.columns; col += 1) {
      for (let row = 0; row < this.rows; row += 1) {
        const text = this.symbolTexts[col]?.[row];
        if (!text) {
          continue;
        }

        text.text = randomSymbol();
      }
    }
  }

  private createSymbolStyle(fontSize: number, fill: string, emphasized: boolean): TextStyle {
    return new TextStyle({
      fontFamily: "Cinzel, Georgia, serif",
      fontSize,
      fill,
      stroke: emphasized ? { color: "#2f1128", width: 5 } : { color: "#2f1128", width: 4 },
      fontWeight: "700"
    });
  }
}
