import { Container, Text } from "pixi.js";
import type { CellCenter } from "./reelController";

const lineGlyph = "✦";

export class SymbolLayer {
  public readonly container = new Container();

  private markers: Text[] = [];

  private cellCenters: CellCenter[][] = [];

  public updateLayout(cellCenters: CellCenter[][]): void {
    this.cellCenters = cellCenters;
  }

  public clear(): void {
    this.markers.forEach((marker) => {
      this.container.removeChild(marker);
      marker.destroy();
    });

    this.markers = [];
  }

  public renderWinLines(lines: number[]): void {
    this.clear();

    for (const row of lines) {
      for (let col = 0; col < this.cellCenters.length; col += 1) {
        const center = this.cellCenters[col]?.[row];
        if (!center) {
          continue;
        }

        const marker = new Text(lineGlyph);
        marker.style = {
          fontFamily: "Cinzel, Georgia, serif",
          fontSize: 30,
          fill: "#ffd978",
          stroke: { color: "#3e172f", width: 4 },
          fontWeight: "700"
        };

        marker.anchor.set(0.5);
        marker.position.set(center.x + 36, center.y - 34);

        this.container.addChild(marker);
        this.markers.push(marker);
      }
    }
  }
}
