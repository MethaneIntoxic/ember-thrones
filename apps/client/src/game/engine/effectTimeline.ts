import type { Container } from "pixi.js";

type EaseFunction = (progress: number) => number;

const easeOutCubic: EaseFunction = (progress) => 1 - Math.pow(1 - progress, 3);
const easeInOutSine: EaseFunction = (progress) => -(Math.cos(Math.PI * progress) - 1) / 2;

export class EffectTimeline {
  private rafHandles = new Set<number>();

  public wait(ms: number): Promise<void> {
    if (ms <= 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  public tween(
    durationMs: number,
    onProgress: (progress: number) => void,
    ease: EaseFunction = easeOutCubic
  ): Promise<void> {
    if (durationMs <= 0) {
      onProgress(1);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const start = performance.now();
      let handle = 0;

      const frame = (timestamp: number): void => {
        this.rafHandles.delete(handle);
        const elapsed = timestamp - start;
        const rawProgress = Math.min(1, elapsed / durationMs);
        onProgress(ease(rawProgress));

        if (rawProgress >= 1) {
          resolve();
          return;
        }

        handle = window.requestAnimationFrame(frame);
        this.rafHandles.add(handle);
      };

      handle = window.requestAnimationFrame(frame);
      this.rafHandles.add(handle);
    });
  }

  public async parallel(tasks: Array<Promise<void> | (() => Promise<void>)>): Promise<void> {
    await Promise.all(tasks.map((task) => (typeof task === "function" ? task() : task)));
  }

  public async pulse(target: Container, scaleTo = 1.06, durationMs = 220): Promise<void> {
    const baseScaleX = target.scale.x;
    const baseScaleY = target.scale.y;
    const baseAlpha = target.alpha;

    await this.tween(durationMs, (progress) => {
      const delta = Math.sin(progress * Math.PI);
      const scale = 1 + (scaleTo - 1) * delta;
      target.scale.set(baseScaleX * scale, baseScaleY * scale);
      target.alpha = Math.min(1, baseAlpha + delta * 0.1);
    }, easeInOutSine);

    target.scale.set(baseScaleX, baseScaleY);
    target.alpha = baseAlpha;
  }

  public async shakeX(target: Container, magnitude = 10, durationMs = 260): Promise<void> {
    await this.shake2D(target, magnitude, magnitude * 0.24, durationMs);
  }

  public async shake2D(
    target: Container,
    magnitudeX = 10,
    magnitudeY = 4,
    durationMs = 260
  ): Promise<void> {
    const baseX = target.x;
    const baseY = target.y;

    await this.tween(durationMs, (progress) => {
      const amplitude = 1 - progress;
      const direction = progress * 12 * Math.PI;
      target.x = baseX + Math.sin(direction) * magnitudeX * amplitude;
      target.y = baseY + Math.cos(direction * 0.7) * magnitudeY * amplitude;
    });

    target.x = baseX;
    target.y = baseY;
  }

  public async lift(target: Container, distance = 18, durationMs = 260): Promise<void> {
    const baseY = target.y;
    const baseRotation = target.rotation;

    await this.tween(durationMs, (progress) => {
      const wave = Math.sin(progress * Math.PI);
      target.y = baseY - wave * distance;
      target.rotation = baseRotation + Math.sin(progress * Math.PI * 2) * 0.01;
    }, easeInOutSine);

    target.y = baseY;
    target.rotation = baseRotation;
  }

  public dispose(): void {
    for (const handle of this.rafHandles) {
      window.cancelAnimationFrame(handle);
    }

    this.rafHandles.clear();
  }
}
