import { Howl, Howler } from "howler";
import type { BonusType } from "../net/apiClient";

type WaveKind = "sine" | "triangle" | "square";
type TensionState = "idle" | "spin" | "bonus" | "jackpot";

interface ToneSpec {
  frequency: number;
  durationMs: number;
  waveform: WaveKind;
  attackMs?: number;
  releaseMs?: number;
  volume?: number;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

function waveform(kind: WaveKind, phase: number): number {
  if (kind === "square") {
    return Math.sin(phase) >= 0 ? 1 : -1;
  }

  if (kind === "triangle") {
    return (2 / Math.PI) * Math.asin(Math.sin(phase));
  }

  return Math.sin(phase);
}

function createToneWav(spec: ToneSpec): string {
  const sampleRate = 22050;
  const sampleCount = Math.max(1, Math.floor((spec.durationMs / 1000) * sampleRate));
  const attack = Math.max(1, Math.floor(((spec.attackMs ?? 16) / 1000) * sampleRate));
  const release = Math.max(1, Math.floor(((spec.releaseMs ?? 120) / 1000) * sampleRate));
  const gain = spec.volume ?? 0.55;

  const pcmBytes = sampleCount * 2;
  const buffer = new Uint8Array(44 + pcmBytes);
  const view = new DataView(buffer.buffer);

  const writeString = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + pcmBytes, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, pcmBytes, true);

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const phase = 2 * Math.PI * spec.frequency * t;
    const raw = waveform(spec.waveform, phase);

    const attackEnv = Math.min(1, i / attack);
    const releaseEnv = Math.min(1, (sampleCount - i) / release);
    const envelope = Math.max(0, Math.min(1, attackEnv * releaseEnv));

    const sample = Math.max(-1, Math.min(1, raw * envelope * gain));
    view.setInt16(44 + i * 2, Math.floor(sample * 32767), true);
  }

  return `data:audio/wav;base64,${toBase64(buffer)}`;
}

const SPIN_TICK_WAV = createToneWav({
  frequency: 480,
  durationMs: 110,
  waveform: "square",
  attackMs: 4,
  releaseMs: 45,
  volume: 0.42
});

const WIN_STINGER_WAV = createToneWav({
  frequency: 660,
  durationMs: 220,
  waveform: "sine",
  attackMs: 8,
  releaseMs: 140,
  volume: 0.64
});

const BONUS_STINGER_WAV = createToneWav({
  frequency: 392,
  durationMs: 340,
  waveform: "triangle",
  attackMs: 8,
  releaseMs: 200,
  volume: 0.72
});

const JACKPOT_HIT_WAV = createToneWav({
  frequency: 820,
  durationMs: 280,
  waveform: "sine",
  attackMs: 8,
  releaseMs: 180,
  volume: 0.76
});

const AMBIENT_IDLE_WAV = createToneWav({
  frequency: 94,
  durationMs: 1400,
  waveform: "triangle",
  attackMs: 120,
  releaseMs: 420,
  volume: 0.26
});

const AMBIENT_SPIN_WAV = createToneWav({
  frequency: 128,
  durationMs: 1200,
  waveform: "triangle",
  attackMs: 80,
  releaseMs: 280,
  volume: 0.34
});

const AMBIENT_BONUS_WAV = createToneWav({
  frequency: 158,
  durationMs: 1320,
  waveform: "sine",
  attackMs: 70,
  releaseMs: 250,
  volume: 0.36
});

const AMBIENT_JACKPOT_WAV = createToneWav({
  frequency: 194,
  durationMs: 1120,
  waveform: "square",
  attackMs: 30,
  releaseMs: 180,
  volume: 0.28
});

export class AudioBus {
  private readonly spinSound = new Howl({ src: [SPIN_TICK_WAV], volume: 0.32 });

  private readonly winSound = new Howl({ src: [WIN_STINGER_WAV], volume: 0.58 });

  private readonly bonusSound = new Howl({ src: [BONUS_STINGER_WAV], volume: 0.6 });

  private readonly jackpotSound = new Howl({ src: [JACKPOT_HIT_WAV], volume: 0.68 });

  private readonly ambientLoops: Record<TensionState, Howl> = {
    idle: new Howl({ src: [AMBIENT_IDLE_WAV], loop: true, volume: 0 }),
    spin: new Howl({ src: [AMBIENT_SPIN_WAV], loop: true, volume: 0 }),
    bonus: new Howl({ src: [AMBIENT_BONUS_WAV], loop: true, volume: 0 }),
    jackpot: new Howl({ src: [AMBIENT_JACKPOT_WAV], loop: true, volume: 0 })
  };

  private activeState: TensionState = "idle";

  private stateHoldTimer: number | null = null;

  private unlocked = false;

  private muted = false;

  public prime(): void {
    this.unlocked = true;

    if (Howler.ctx && Howler.ctx.state === "suspended") {
      void Howler.ctx.resume();
    }

    if (!this.muted) {
      this.ensureAmbientLoopsStarted();
      this.fadeToState(this.activeState, 240);
      const id = this.spinSound.play();
      this.spinSound.stop(id);
    }
  }

  public setMuted(value: boolean): void {
    this.muted = value;
    Howler.mute(value);

    if (!value && this.unlocked) {
      this.ensureAmbientLoopsStarted();
      this.fadeToState(this.activeState, 180);
    }
  }

  public setTensionState(state: TensionState, holdMs = 0): void {
    this.activeState = state;

    if (this.stateHoldTimer !== null) {
      window.clearTimeout(this.stateHoldTimer);
      this.stateHoldTimer = null;
    }

    if (!this.unlocked || this.muted) {
      return;
    }

    this.ensureAmbientLoopsStarted();
    this.fadeToState(state, 280);

    if (holdMs > 0) {
      this.stateHoldTimer = window.setTimeout(() => {
        this.activeState = "idle";
        if (!this.muted && this.unlocked) {
          this.fadeToState("idle", 320);
        }
        this.stateHoldTimer = null;
      }, holdMs);
    }
  }

  public playSpin(): void {
    if (!this.unlocked || this.muted) {
      return;
    }

    this.setTensionState("spin", 640);
    this.spinSound.play();
  }

  public playWin(amount: number): void {
    if (!this.unlocked || this.muted || amount <= 0) {
      return;
    }

    if (amount >= 350) {
      this.jackpotSound.rate(0.95);
      this.jackpotSound.play();
      this.setTensionState("jackpot", 1650);
      return;
    }

    this.winSound.rate(amount > 120 ? 1.1 : 1);
    this.winSound.play();
  }

  public playFeature(
    name: "ember-lock" | "free-quest" | "wheel-ascension" | "relic-vault"
  ): void {
    if (!this.unlocked || this.muted) {
      return;
    }

    if (name === "free-quest") {
      this.bonusSound.rate(0.92);
      this.bonusSound.play();
      this.setTensionState("bonus", 980);
      return;
    }

    if (name === "ember-lock") {
      this.playBonusEntry("EMBER_RESPIN");
      return;
    }

    if (name === "wheel-ascension") {
      this.playBonusEntry("WHEEL_ASCENSION");
      return;
    }

    this.playBonusEntry("RELIC_VAULT");
  }

  public playBonusEntry(type: BonusType): void {
    if (!this.unlocked || this.muted) {
      return;
    }

    if (type === "EMBER_RESPIN") {
      this.bonusSound.rate(0.84);
    } else if (type === "WHEEL_ASCENSION") {
      this.bonusSound.rate(1);
    } else {
      this.bonusSound.rate(1.12);
    }

    this.bonusSound.play();
    this.setTensionState("bonus", 2400);
  }

  private ensureAmbientLoopsStarted(): void {
    for (const loop of Object.values(this.ambientLoops)) {
      if (!loop.playing()) {
        loop.play();
      }
    }
  }

  private fadeToState(state: TensionState, durationMs: number): void {
    const targetVolume: Record<TensionState, number> = {
      idle: 0.18,
      spin: 0.26,
      bonus: 0.34,
      jackpot: 0.38
    };

    for (const [loopState, loop] of Object.entries(this.ambientLoops) as Array<
      [TensionState, Howl]
    >) {
      const endVolume = loopState === state ? targetVolume[state] : 0;
      const current = loop.volume();

      if (Math.abs(current - endVolume) < 0.005) {
        loop.volume(endVolume);
        continue;
      }

      loop.fade(current, endVolume, durationMs);
    }
  }
}

export const audioBus = new AudioBus();
