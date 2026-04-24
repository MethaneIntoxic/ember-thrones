import { Application, Container, Graphics } from "pixi.js";
import type { BonusType, SpinSpeedMode } from "../net/apiClient";
import { EffectTimeline } from "./effectTimeline";
import { ReelController } from "./reelController";
import { SymbolLayer } from "./symbolLayer";

const DEFAULT_WIDTH = 920;
const DEFAULT_HEIGHT = 460;

interface BurstNode {
  node: Graphics;
  startX: number;
  startY: number;
  vx: number;
  vy: number;
  alpha: number;
  spin: number;
}

export class PixiStage {
  private app: Application | null = null;

  private host: HTMLElement | null = null;

  private readonly root = new Container();

  private readonly backdropLayer = new Graphics();

  private readonly reelController = new ReelController();

  private readonly frameLayer = new Graphics();

  private readonly symbolLayer = new SymbolLayer();

  private readonly fxLayer = new Container();

  private readonly flashOverlay = new Graphics();

  private readonly effects = new EffectTimeline();

  private spinSpeedMode: SpinSpeedMode = "normal";

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
  this.root.addChild(this.backdropLayer);
    this.root.addChild(this.reelController.container);
  this.root.addChild(this.frameLayer);
    this.root.addChild(this.symbolLayer.container);
    this.root.addChild(this.fxLayer);
    this.root.addChild(this.flashOverlay);
    app.stage.addChild(this.root);

    await this.reelController.warmTextureCache();
    this.resize(width, height);
  }

  public setSpinSpeedMode(mode: SpinSpeedMode): void {
    this.spinSpeedMode = mode;
  }

  public async presentSpinResult(
    reels: string[][],
    winLines: number[],
    winCoins: number,
    speedMode: SpinSpeedMode = this.spinSpeedMode
  ): Promise<void> {
    if (!this.app) {
      return;
    }

    this.effects.dispose();
    this.reelController.container.scale.set(1, 1);
    this.reelController.container.rotation = 0;
    this.reelController.container.alpha = 1;

    this.spinSpeedMode = speedMode;
    this.clearFxLayer();
    this.reelController.setWinTint([]);
    this.symbolLayer.clear();

    await this.scanSweep(winCoins > 0 ? 0x8fb8ff : 0x5a789e, winCoins > 0 ? 200 : 140, 0.09);
    this.symbolLayer.updateLayout(this.reelController.getCellCenters());
    await this.reelController.spinTo(reels, this.effects, speedMode);
    await this.reelController.choreographWinLines(winLines, this.effects, speedMode);

    this.symbolLayer.updateLayout(this.reelController.getCellCenters());
    for (const row of Array.from(new Set(winLines))) {
      this.symbolLayer.renderWinLines([row]);
      await this.effects.wait(speedMode === "normal" ? 90 : 55);
    }
    this.symbolLayer.renderWinLines(winLines);

    if (winCoins > 0) {
      await this.effects.parallel([
        () => this.effects.shake2D(this.reelController.container, 8, 4, 220),
        () => this.flashScreen(0xffd78f, 0.24, 210),
        () => this.ringPulse(0xffd78f, 72, 340, 420, 6),
        () => this.shardBurst(26, 0xffbe63, 420),
        () => this.particleBurst(30, 0xffcf74, 520)
      ]);
    } else {
      await Promise.all([this.flashScreen(0x87a4c8, 0.08, 120), this.scanSweep(0xb7c8de, 140, 0.06)]);
    }
  }

  public async playBonusEntry(type: BonusType): Promise<void> {
    if (!this.app) {
      return;
    }

    this.effects.dispose();
    this.reelController.container.scale.set(1, 1);
    this.reelController.container.rotation = 0;
    this.reelController.container.alpha = 1;

    this.clearFxLayer();

    if (type === "HOLD_AND_SPIN") {
      await this.effects.parallel([
        () => this.flashScreen(0xff8b4f, 0.34, 320),
        () => this.ringPulse(0xff8b4f, 60, 310, 500, 7),
        () => this.emberLift(28, 0xffb05b, 620),
        () => this.shardBurst(34, 0xff8b4f, 480, 0.8),
        () => this.effects.shake2D(this.reelController.container, 14, 6, 280),
        () => this.effects.pulse(this.reelController.container, 1.04, 260)
      ]);
      return;
    }

    if (type === "FREE_GAMES") {
      await this.effects.parallel([
        () => this.flashScreen(0x72b4ff, 0.32, 340),
        () => this.ringPulse(0x72b4ff, 68, 340, 540, 6),
        () => this.orbitBurst(14, 0x8fd0ff, 620),
        () => this.particleBurst(36, 0xffd78f, 560),
        () => this.effects.lift(this.reelController.container, 12, 260),
        () => this.effects.pulse(this.reelController.container, 1.05, 300)
      ]);
      return;
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
    this.drawStageChrome();
    this.flashOverlay.clear();
    this.flashOverlay.rect(0, 0, safeWidth, safeHeight).fill({ color: 0xffffff, alpha: 1 });
    this.flashOverlay.alpha = 0;
  }

  public destroy(): void {
    this.symbolLayer.clear();
    this.clearFxLayer();
    this.backdropLayer.clear();
    this.frameLayer.clear();
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

  private drawStageChrome(): void {
    if (!this.app) {
      return;
    }

    const bounds = this.reelController.getBoardBounds();
    const padX = Math.max(18, bounds.width * 0.038);
    const padY = Math.max(18, bounds.height * 0.06);

    this.backdropLayer.clear();
    this.backdropLayer
      .roundRect(
        bounds.x - padX * 1.35,
        bounds.y - padY * 1.35,
        bounds.width + padX * 2.7,
        bounds.height + padY * 2.7,
        42
      )
      .fill({ color: 0x0b0712, alpha: 0.94 });
    this.backdropLayer
      .roundRect(bounds.x - padX, bounds.y - padY, bounds.width + padX * 2, bounds.height + padY * 2, 34)
      .fill({ color: 0x150f22, alpha: 0.96 });
    this.backdropLayer
      .roundRect(bounds.x - padX, bounds.y - padY, bounds.width + padX * 2, bounds.height + padY * 2, 34)
      .stroke({ color: 0xffd2a2, alpha: 0.18, width: 2 });
    this.backdropLayer
      .roundRect(
        bounds.x - padX * 0.78,
        bounds.y - padY * 0.72,
        bounds.width + padX * 1.56,
        bounds.height + padY * 1.44,
        28
      )
      .stroke({ color: 0x8ea4df, alpha: 0.12, width: 1 });

    this.frameLayer.clear();
    this.frameLayer
      .roundRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8, 28)
      .stroke({ color: 0xffdbb4, alpha: 0.28, width: 2 });
    this.frameLayer
      .roundRect(bounds.x + 9, bounds.y + 9, bounds.width - 18, bounds.height - 18, 22)
      .stroke({ color: 0xffffff, alpha: 0.08, width: 1 });
    this.frameLayer
      .roundRect(bounds.x + 24, bounds.y - padY * 0.44, bounds.width - 48, padY * 0.5, 16)
      .fill({ color: 0x24172f, alpha: 0.78 });
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

  private async scanSweep(color: number, durationMs: number, peakAlpha: number): Promise<void> {
    if (!this.app) {
      return;
    }

    const width = this.app.renderer.width;
    const height = this.app.renderer.height;

    const band = new Graphics();
    band.roundRect(-width * 0.18, -height * 0.46, width * 0.36, height * 0.92, 34).fill({ color, alpha: 1 });
    band.position.set(-width * 0.2, height / 2);
    band.alpha = 0;
    this.fxLayer.addChild(band);

    await this.effects.tween(durationMs, (progress) => {
      band.x = -width * 0.2 + progress * width * 1.4;
      band.alpha = Math.sin(progress * Math.PI) * peakAlpha;
    });

    this.fxLayer.removeChild(band);
    band.destroy();
  }

  private async ringPulse(
    color: number,
    startRadius: number,
    endRadius: number,
    durationMs: number,
    lineWidth: number
  ): Promise<void> {
    if (!this.app) {
      return;
    }

    const ring = new Graphics();
    const centerX = this.app.renderer.width / 2;
    const centerY = this.app.renderer.height / 2;

    this.fxLayer.addChild(ring);

    await this.effects.tween(durationMs, (progress) => {
      const radius = startRadius + (endRadius - startRadius) * progress;
      ring.clear();
      ring.circle(centerX, centerY, radius).stroke({
        color,
        alpha: (1 - progress) * 0.64,
        width: Math.max(1, lineWidth * (1 - progress * 0.65))
      });
      ring.circle(centerX, centerY, Math.max(startRadius * 0.72, radius * 0.66)).stroke({
        color: 0xffffff,
        alpha: (1 - progress) * 0.14,
        width: 1
      });
    });

    this.fxLayer.removeChild(ring);
    ring.destroy();
  }

  private async shardBurst(
    count: number,
    color: number,
    durationMs: number,
    speedScale = 1
  ): Promise<void> {
    if (!this.app) {
      return;
    }

    const width = this.app.renderer.width;
    const height = this.app.renderer.height;
    const centerX = width / 2;
    const centerY = height / 2;

    const shards: BurstNode[] = Array.from({ length: count }, () => {
      const shard = new Graphics();
      const shardWidth = 4 + Math.random() * 16;
      const shardHeight = 2 + Math.random() * 8;

      shard
        .roundRect(-shardWidth / 2, -shardHeight / 2, shardWidth, shardHeight, 2)
        .fill({ color, alpha: 0.72 });

      shard.position.set(centerX + (Math.random() - 0.5) * 36, centerY + (Math.random() - 0.5) * 28);
      shard.rotation = Math.random() * Math.PI * 2;
      this.fxLayer.addChild(shard);

      const angle = Math.random() * Math.PI * 2;
      const speed = (1.8 + Math.random() * 4) * speedScale;

      return {
        node: shard,
        startX: shard.x,
        startY: shard.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 0.24 + Math.random() * 0.34,
        spin: (Math.random() - 0.5) * 0.24
      };
    });

    await this.effects.tween(durationMs, (progress) => {
      for (const shard of shards) {
        shard.node.x = shard.startX + shard.vx * progress * 46;
        shard.node.y = shard.startY + shard.vy * progress * 46 + progress * progress * 20;
        shard.node.alpha = (1 - progress) * shard.alpha;
        shard.node.rotation += shard.spin;
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

    const particles: BurstNode[] = Array.from({ length: count }, () => {
      const node = new Graphics();
      const radius = 1.8 + Math.random() * 3.2;

      node.circle(0, 0, radius).fill({ color, alpha: 0.95 });
      node.position.set(centerX + (Math.random() - 0.5) * 60, centerY + (Math.random() - 0.5) * 50);

      this.fxLayer.addChild(node);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 3.8;

      return {
        node,
        startX: node.x,
        startY: node.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 0.35 + Math.random() * 0.45,
        spin: 0
      };
    });

    await this.effects.tween(durationMs, (progress) => {
      for (const particle of particles) {
        particle.node.x = particle.startX + particle.vx * progress * 34;
        particle.node.y = particle.startY + particle.vy * progress * 34 - progress * progress * 8;
        particle.node.alpha = (1 - progress) * particle.alpha;
      }
    });

    for (const particle of particles) {
      this.fxLayer.removeChild(particle.node);
      particle.node.destroy();
    }
  }

  private async emberLift(count: number, color: number, durationMs: number): Promise<void> {
    if (!this.app) {
      return;
    }

    const width = this.app.renderer.width;
    const height = this.app.renderer.height;

    const embers: BurstNode[] = Array.from({ length: count }, () => {
      const node = new Graphics();
      const radius = 2 + Math.random() * 3.5;
      node.circle(0, 0, radius).fill({ color, alpha: 0.9 });

      const startX = width * 0.2 + Math.random() * width * 0.6;
      const startY = height * 0.72 + Math.random() * height * 0.18;
      node.position.set(startX, startY);
      this.fxLayer.addChild(node);

      return {
        node,
        startX,
        startY,
        vx: (Math.random() - 0.5) * 0.9,
        vy: -(1.8 + Math.random() * 2.8),
        alpha: 0.35 + Math.random() * 0.35,
        spin: 0
      };
    });

    await this.effects.tween(durationMs, (progress) => {
      for (const ember of embers) {
        ember.node.x = ember.startX + ember.vx * progress * 42;
        ember.node.y = ember.startY + ember.vy * progress * 90;
        ember.node.alpha = (1 - progress) * ember.alpha;
        ember.node.scale.set(1 + Math.sin(progress * Math.PI) * 0.35);
      }
    });

    for (const ember of embers) {
      this.fxLayer.removeChild(ember.node);
      ember.node.destroy();
    }
  }

  private async orbitBurst(count: number, color: number, durationMs: number): Promise<void> {
    if (!this.app) {
      return;
    }

    const centerX = this.app.renderer.width / 2;
    const centerY = this.app.renderer.height / 2;

    const nodes = Array.from({ length: count }, (_, index) => {
      const node = new Graphics();
      node.circle(0, 0, 4 + (index % 3)).fill({ color, alpha: 0.9 });
      this.fxLayer.addChild(node);

      return {
        node,
        baseAngle: (index / count) * Math.PI * 2,
        radius: 48 + (index % 4) * 14,
        alpha: 0.3 + (index % 3) * 0.18
      };
    });

    await this.effects.tween(durationMs, (progress) => {
      for (const orbit of nodes) {
        const radius = orbit.radius + progress * 58;
        const angle = orbit.baseAngle + progress * Math.PI * 2.6;
        orbit.node.position.set(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius * 0.62);
        orbit.node.alpha = (1 - progress) * orbit.alpha;
      }
    });

    for (const orbit of nodes) {
      this.fxLayer.removeChild(orbit.node);
      orbit.node.destroy();
    }
  }

  private async vaultBands(count: number, color: number, durationMs: number): Promise<void> {
    if (!this.app) {
      return;
    }

    const centerX = this.app.renderer.width / 2;
    const centerY = this.app.renderer.height / 2;
    const bands = Array.from({ length: count }, (_, index) => {
      const node = new Graphics();
      const width = 160 + index * 28;
      node.roundRect(-width / 2, -4, width, 8, 4).fill({ color, alpha: 0.9 });
      this.fxLayer.addChild(node);

      return {
        node,
        offsetY: (index - (count - 1) / 2) * 18,
        alpha: 0.22 + index * 0.08
      };
    });

    await this.effects.tween(durationMs, (progress) => {
      for (const band of bands) {
        band.node.position.set(centerX, centerY + band.offsetY * (1 + progress * 1.6));
        band.node.scale.x = 0.35 + progress * 1.02;
        band.node.alpha = (1 - progress) * band.alpha;
      }
    });

    for (const band of bands) {
      this.fxLayer.removeChild(band.node);
      band.node.destroy();
    }
  }
}
