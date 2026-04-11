import type { Container } from "pixi.js";

type EaseFunction = (progress: number) => number;

const easeOutCubic: EaseFunction = (progress) => 1 - Math.pow(1 - progress, 3);

export class EffectTimeline {
  private rafHandles = new Set<number>();

  public wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  public tween(
    durationMs: number,
    onProgress: (progress: number) => void,
    ease: EaseFunction = easeOutCubic
  ): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();

      const frame = (timestamp: number) => {
        const elapsed = timestamp - start;
        const rawProgress = Math.min(1, elapsed / durationMs);
        onProgress(ease(rawProgress));

        if (rawProgress >= 1) {
          resolve();
          return;
        }

        const handle = window.requestAnimationFrame(frame);
        this.rafHandles.add(handle);
      };

      const handle = window.requestAnimationFrame(frame);
      this.rafHandles.add(handle);
    });
  }

  public async pulse(target: Container, scaleTo = 1.06, durationMs = 220): Promise<void> {
    const baseScaleX = target.scale.x;
    const baseScaleY = target.scale.y;

    await this.tween(durationMs, (progress) => {
      const delta = Math.sin(progress * Math.PI);
      target.scale.set(baseScaleX + (scaleTo - baseScaleX) * delta, baseScaleY + (scaleTo - baseScaleY) * delta);
    });

    target.scale.set(baseScaleX, baseScaleY);
  }

  public async shakeX(target: Container, magnitude = 10, durationMs = 260): Promise<void> {
    const baseX = target.x;

    await this.tween(durationMs, (progress) => {
      const amplitude = (1 - progress) * magnitude;
      const direction = progress * 12;
      target.x = baseX + Math.sin(direction * Math.PI) * amplitude;
    });

    target.x = baseX;
  }

  public dispose(): void {
    for (const handle of this.rafHandles) {
      window.cancelAnimationFrame(handle);
    }

    this.rafHandles.clear();
  }
}
