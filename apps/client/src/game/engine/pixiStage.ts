import { Application, Container, Graphics } from "pixi.js";
import type { BonusType } from "../net/apiClient";
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

  private readonly fxLayer = new Container();

  private readonly flashOverlay = new Graphics();

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
    this.root.addChild(this.fxLayer);
    this.root.addChild(this.flashOverlay);
    app.stage.addChild(this.root);

    await this.reelController.warmTextureCache();
    this.resize(width, height);
  }

  public async presentSpinResult(reels: string[][], winLines: number[], winCoins: number): Promise<void> {
    if (!this.app) {
      return;
    }

    await this.noiseBurst(20, 120, 0x91c6ff);
    await this.reelController.spinTo(reels, this.effects);
    this.reelController.setWinTint(winLines);

    this.symbolLayer.updateLayout(this.reelController.getCellCenters());
    this.symbolLayer.renderWinLines(winLines);

    if (winCoins > 0) {
      await Promise.all([
        this.effects.shakeX(this.reelController.container, 8, 220),
        this.flashScreen(0xffd78f, 0.24, 210),
        this.particleBurst(28, 0xffbe63, 420)
      ]);
    } else {
      await this.flashScreen(0x87a4c8, 0.08, 120);
    }
  }

  public async playBonusEntry(type: BonusType): Promise<void> {
    if (!this.app) {
      return;
    }

    const color =
      type === "EMBER_RESPIN"
        ? 0xff8b4f
        : type === "WHEEL_ASCENSION"
          ? 0x72b4ff
          : 0x6fe1cf;

    await Promise.all([
      this.flashScreen(color, 0.34, 320),
      this.noiseBurst(52, 260, color),
      this.particleBurst(58, color, 560),
      this.effects.shakeX(this.reelController.container, 14, 280)
    ]);
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
    this.flashOverlay.clear();
    this.flashOverlay.rect(0, 0, safeWidth, safeHeight).fill({ color: 0xffffff, alpha: 1 });
    this.flashOverlay.alpha = 0;
  }

  public destroy(): void {
    this.symbolLayer.clear();
    this.clearFxLayer();
    this.flashOverlay.clear();
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

  private clearFxLayer(): void {
    const children = this.fxLayer.removeChildren();
    for (const child of children) {
      child.destroy();
    }
  }

  private async flashScreen(color: number, peakAlpha: number, durationMs: number): Promise<void> {
    if (!this.app) {
      return;
    }

    const width = this.app.renderer.width;
    const height = this.app.renderer.height;

    this.flashOverlay.clear();
    this.flashOverlay.rect(0, 0, width, height).fill({ color, alpha: 1 });
    this.flashOverlay.alpha = 0;

    await this.effects.tween(durationMs, (progress) => {
      const wave = Math.sin(progress * Math.PI);
      this.flashOverlay.alpha = wave * peakAlpha;
    });

    this.flashOverlay.alpha = 0;
  }

  private async noiseBurst(count: number, durationMs: number, color: number): Promise<void> {
    if (!this.app) {
      return;
    }

    const width = this.app.renderer.width;
    const height = this.app.renderer.height;

    const shards = Array.from({ length: count }, () => {
      const shard = new Graphics();
      const shardWidth = 4 + Math.random() * 16;
      const shardHeight = 2 + Math.random() * 8;

      shard
        .roundRect(-shardWidth / 2, -shardHeight / 2, shardWidth, shardHeight, 2)
        .fill({ color, alpha: 0.72 });

      shard.position.set(Math.random() * width, Math.random() * height);
      shard.rotation = Math.random() * Math.PI * 2;
      this.fxLayer.addChild(shard);

      return {
        node: shard,
        vx: (Math.random() - 0.5) * 3,
        vy: (Math.random() - 0.5) * 3,
        alpha: 0.18 + Math.random() * 0.36
      };
    });

    await this.effects.tween(durationMs, (progress) => {
      for (const shard of shards) {
        shard.node.x += shard.vx;
        shard.node.y += shard.vy;
        shard.node.alpha = (1 - progress) * shard.alpha;
      }
    });

    for (const shard of shards) {
      this.fxLayer.removeChild(shard.node);
      shard.node.destroy();
    }
  }

  private async particleBurst(count: number, color: number, durationMs: number): Promise<void> {
    if (!this.app) {
      return;
    }

    const width = this.app.renderer.width;
    const height = this.app.renderer.height;
    const centerX = width / 2;
    const centerY = height / 2;

    const particles = Array.from({ length: count }, () => {
      const node = new Graphics();
      const radius = 1.8 + Math.random() * 3.2;

      node.circle(0, 0, radius).fill({ color, alpha: 0.95 });
      node.position.set(centerX + (Math.random() - 0.5) * 60, centerY + (Math.random() - 0.5) * 50);

      this.fxLayer.addChild(node);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 3.8;

      return {
        node,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 0.35 + Math.random() * 0.45
      };
    });

    await this.effects.tween(durationMs, (progress) => {
      for (const particle of particles) {
        particle.node.x += particle.vx;
        particle.node.y += particle.vy;
        particle.node.alpha = (1 - progress) * particle.alpha;
      }
    });

    for (const particle of particles) {
      this.fxLayer.removeChild(particle.node);
      particle.node.destroy();
    }
  }
}
