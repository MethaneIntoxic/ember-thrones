import { Howl, Howler } from "howler";

const TICK_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
const CHIME_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export class AudioBus {
  private readonly spinSound = new Howl({ src: [TICK_WAV], volume: 0.35 });

  private readonly winSound = new Howl({ src: [CHIME_WAV], volume: 0.55 });

  private readonly featureSound = new Howl({ src: [CHIME_WAV], volume: 0.5, rate: 0.85 });

  private unlocked = false;

  private muted = false;

  public prime(): void {
    this.unlocked = true;

    if (Howler.ctx && Howler.ctx.state === "suspended") {
      void Howler.ctx.resume();
    }

    if (!this.muted) {
      const id = this.spinSound.play();
      this.spinSound.stop(id);
    }
  }

  public setMuted(value: boolean): void {
    this.muted = value;
  }

  public playSpin(): void {
    if (!this.unlocked || this.muted) {
      return;
    }

    this.spinSound.play();
  }

  public playWin(amount: number): void {
    if (!this.unlocked || this.muted || amount <= 0) {
      return;
    }

    this.winSound.rate(amount > 100 ? 1.15 : 1);
    this.winSound.play();
  }

  public playFeature(name: "ember-lock" | "free-quest" | "mini-game"): void {
    if (!this.unlocked || this.muted) {
      return;
    }

    if (name === "ember-lock") {
      this.featureSound.rate(0.8);
    } else if (name === "free-quest") {
      this.featureSound.rate(1);
    } else {
      this.featureSound.rate(1.2);
    }

    this.featureSound.play();
  }
}

export const audioBus = new AudioBus();
