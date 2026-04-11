import { Application, Container } from "pixi.js";
import { EffectTimeline } from "./effectTimeline";
import { ReelController } from "./reelController";
import { SymbolLayer } from "./symbolLayer";

const DEFAULT_WIDTH = 920;
const DEFAULT_HEIGHT = 460;

export class PixiStage {
  private app: Application | null = null;

  private host: HTMLElement | null = null;

  private readonly root = new Container();

  private readonly reelController = new ReelController();

  private readonly symbolLayer = new SymbolLayer();

  private readonly effects = new EffectTimeline();

  public async mount(host: HTMLElement): Promise<void> {
    if (this.app) {
      return;
    }

    const app = new Application();
    const width = Math.max(360, host.clientWidth || DEFAULT_WIDTH);
    const height = Math.max(240, host.clientHeight || DEFAULT_HEIGHT);

    await app.init({
      width,
      height,
      antialias: true,
      background: "#160f25",
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });

    this.host = host;
    host.innerHTML = "";
    host.appendChild(app.canvas);

    this.app = app;
    this.root.addChild(this.reelController.container);
    this.root.addChild(this.symbolLayer.container);
    app.stage.addChild(this.root);

    this.resize(width, height);
  }

  public async presentSpinResult(reels: string[][], winLines: number[], winCoins: number): Promise<void> {
    if (!this.app) {
      return;
    }

    await this.reelController.spinTo(reels, this.effects);
    this.reelController.setWinTint(winLines);

    this.symbolLayer.updateLayout(this.reelController.getCellCenters());
    this.symbolLayer.renderWinLines(winLines);

    if (winCoins > 0) {
      await this.effects.shakeX(this.reelController.container, 8, 220);
    }
  }

  public resize(width: number, height: number): void {
    if (!this.app) {
      return;
    }

    const safeWidth = Math.max(320, width);
    const safeHeight = Math.max(220, height);

    this.app.renderer.resize(safeWidth, safeHeight);
    this.reelController.layout(safeWidth, safeHeight);
    this.symbolLayer.updateLayout(this.reelController.getCellCenters());
  }

  public destroy(): void {
    this.symbolLayer.clear();
    this.effects.dispose();

    if (this.app) {
      this.app.destroy();
      this.app = null;
    }

    if (this.host) {
      this.host.innerHTML = "";
      this.host = null;
    }
  }
}
