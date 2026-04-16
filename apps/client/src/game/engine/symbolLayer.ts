import { Container, Graphics, Text } from "pixi.js";
import type { CellCenter } from "./reelController";

const lineGlyph = "✦";

export class SymbolLayer {
  public readonly container = new Container();

  private nodes: Array<Graphics | Text> = [];

  private cellCenters: CellCenter[][] = [];

  public updateLayout(cellCenters: CellCenter[][]): void {
    this.cellCenters = cellCenters;
  }

  public clear(): void {
    for (const node of this.nodes) {
      this.container.removeChild(node);
      node.destroy();
    }

    this.nodes = [];
  }

  public renderWinLines(lines: number[]): void {
    this.clear();

    for (const row of lines) {
      const rowCenters: CellCenter[] = [];

      for (let col = 0; col < this.cellCenters.length; col += 1) {
        const center = this.cellCenters[col]?.[row];
        if (!center) {
          continue;
        }

        rowCenters.push(center);
      }

      if (rowCenters.length === 0) {
        continue;
      }

      const first = rowCenters[0];
      const last = rowCenters[rowCenters.length - 1];

      if (first && last) {
        const startX = first.x - Math.min(first.cellWidth * 0.36, 36);
        const endX = last.x + Math.min(last.cellWidth * 0.36, 36);
        const glow = new Graphics();
        glow.moveTo(startX, first.y);

        for (const point of rowCenters) {
          glow.lineTo(point.x, point.y);
        }

        glow.lineTo(endX, last.y);
        glow.stroke({ color: 0xffcb68, alpha: 0.18, width: Math.max(10, first.cellHeight * 0.12) });
        this.container.addChild(glow);
        this.nodes.push(glow);

        const beam = new Graphics();
        beam.moveTo(startX, first.y);

        for (const point of rowCenters) {
          beam.lineTo(point.x, point.y);
        }

        beam.lineTo(endX, last.y);
        beam.stroke({ color: 0xfff1c7, alpha: 0.92, width: Math.max(3, first.cellHeight * 0.034) });
        this.container.addChild(beam);
        this.nodes.push(beam);

        const label = new Text(`ROW ${row + 1}`);
        label.anchor.set(0, 0.5);
        label.position.set(startX, first.y + Math.min(first.cellHeight * 0.24, 24));
        label.style = {
          fontFamily: "Cinzel, Georgia, serif",
          fontSize: Math.max(11, Math.round(first.cellHeight * 0.15)),
          fill: "#ffe39c",
          stroke: { color: "#341526", width: 3 },
          fontWeight: "700",
          letterSpacing: 1
        };

        this.container.addChild(label);
        this.nodes.push(label);
      }

      for (const center of rowCenters) {
        const halo = new Graphics();
        const haloRadius = Math.max(16, Math.min(center.cellWidth, center.cellHeight) * 0.19);
        halo.circle(center.x, center.y, haloRadius).fill({ color: 0xffcb68, alpha: 0.1 });
        this.container.addChild(halo);
        this.nodes.push(halo);

        const marker = new Text(lineGlyph);
        const markerSize = Math.max(18, Math.min(34, Math.round(Math.min(center.cellWidth, center.cellHeight) * 0.28)));
        const markerOffsetX = Math.min(center.cellWidth * 0.32, 32);
        const markerOffsetY = Math.min(center.cellHeight * 0.31, 30);
        marker.style = {
          fontFamily: "Cinzel, Georgia, serif",
          fontSize: markerSize,
          fill: "#ffd978",
          stroke: { color: "#3e172f", width: markerSize <= 22 ? 3 : 4 },
          fontWeight: "700"
        };

        marker.anchor.set(0.5);
        marker.position.set(center.x + markerOffsetX, center.y - markerOffsetY);

        this.container.addChild(marker);
        this.nodes.push(marker);
      }
    }
  }
}
