import { Howl, Howler } from "howler";
import type { BonusType } from "../net/apiClient";

type WaveKind = "sine" | "triangle" | "square" | "saw";
type TensionState = "idle" | "spin" | "bonus" | "jackpot";

interface LayerSpec {
  startMs: number;
  durationMs: number;
  waveform: WaveKind;
  frequencyStart: number;
  frequencyEnd?: number;
  attackMs?: number;
  releaseMs?: number;
  volume?: number;
  vibratoHz?: number;
  vibratoDepth?: number;
  tremoloHz?: number;
  tremoloDepth?: number;
  noiseMix?: number;
}

interface ClipSpec {
  durationMs: number;
  masterGain?: number;
  layers: LayerSpec[];
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

  if (kind === "saw") {
    const cycle = phase / (Math.PI * 2);
    return 2 * (cycle - Math.floor(cycle + 0.5));
  }

  if (kind === "triangle") {
    return (2 / Math.PI) * Math.asin(Math.sin(phase));
  }

  return Math.sin(phase);
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function createClipWav(spec: ClipSpec): string {
  const sampleRate = 22050;
  const sampleCount = Math.max(1, Math.floor((spec.durationMs / 1000) * sampleRate));
  const mix = new Float32Array(sampleCount);
  const masterGain = spec.masterGain ?? 0.8;

  for (const layer of spec.layers) {
    const startIndex = Math.max(0, Math.floor((layer.startMs / 1000) * sampleRate));
    const layerSamples = Math.max(1, Math.floor((layer.durationMs / 1000) * sampleRate));
    const endIndex = Math.min(sampleCount, startIndex + layerSamples);
    const attack = Math.max(1, Math.floor(((layer.attackMs ?? 18) / 1000) * sampleRate));
    const release = Math.max(1, Math.floor(((layer.releaseMs ?? 140) / 1000) * sampleRate));
    const layerGain = layer.volume ?? 0.42;
    let phase = 0;

    for (let index = startIndex; index < endIndex; index += 1) {
      const localIndex = index - startIndex;
      const progress = layerSamples <= 1 ? 1 : localIndex / Math.max(1, layerSamples - 1);
      const attackEnv = Math.min(1, localIndex / attack);
      const releaseEnv = Math.min(1, (endIndex - index) / release);
      const envelope = Math.max(0, Math.min(1, attackEnv * releaseEnv));
      const freq = lerp(layer.frequencyStart, layer.frequencyEnd ?? layer.frequencyStart, progress);
      const vibrato = layer.vibratoHz
        ? 1 + Math.sin((localIndex / sampleRate) * Math.PI * 2 * layer.vibratoHz) * (layer.vibratoDepth ?? 0)
        : 1;
      const tremolo = layer.tremoloHz
        ? 1 + Math.sin((localIndex / sampleRate) * Math.PI * 2 * layer.tremoloHz) * (layer.tremoloDepth ?? 0)
        : 1;

      phase += (Math.PI * 2 * freq * vibrato) / sampleRate;

      let sample = waveform(layer.waveform, phase);
      if (layer.noiseMix) {
        sample = sample * (1 - layer.noiseMix) + (Math.random() * 2 - 1) * layer.noiseMix;
      }

      const mixedSample = mix[index] ?? 0;
      mix[index] = mixedSample + sample * envelope * layerGain * tremolo * masterGain;
    }
  }

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

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.tanh(mix[index] ?? 0);
    view.setInt16(44 + index * 2, Math.floor(sample * 32767), true);
  }

  return `data:audio/wav;base64,${toBase64(buffer)}`;
}

const SPIN_TICK_WAV = createClipWav({
  durationMs: 170,
  masterGain: 0.78,
  layers: [
    {
      startMs: 0,
      durationMs: 76,
      waveform: "square",
      frequencyStart: 740,
      frequencyEnd: 460,
      attackMs: 2,
      releaseMs: 34,
      volume: 0.34,
      noiseMix: 0.08
    },
    {
      startMs: 16,
      durationMs: 154,
      waveform: "triangle",
      frequencyStart: 174,
      frequencyEnd: 132,
      attackMs: 10,
      releaseMs: 70,
      volume: 0.18,
      tremoloHz: 7,
      tremoloDepth: 0.08
    }
  ]
});

const WIN_STINGER_WAV = createClipWav({
  durationMs: 320,
  masterGain: 0.82,
  layers: [
    {
      startMs: 0,
      durationMs: 180,
      waveform: "triangle",
      frequencyStart: 520,
      frequencyEnd: 660,
      attackMs: 8,
      releaseMs: 90,
      volume: 0.28,
      vibratoHz: 5.2,
      vibratoDepth: 0.018
    },
    {
      startMs: 56,
      durationMs: 200,
      waveform: "sine",
      frequencyStart: 658,
      frequencyEnd: 784,
      attackMs: 10,
      releaseMs: 120,
      volume: 0.22
    },
    {
      startMs: 108,
      durationMs: 180,
      waveform: "sine",
      frequencyStart: 784,
      frequencyEnd: 988,
      attackMs: 10,
      releaseMs: 120,
      volume: 0.18
    }
  ]
});

const BIG_WIN_STINGER_WAV = createClipWav({
  durationMs: 420,
  masterGain: 0.86,
  layers: [
    {
      startMs: 0,
      durationMs: 260,
      waveform: "triangle",
      frequencyStart: 392,
      frequencyEnd: 494,
      attackMs: 10,
      releaseMs: 110,
      volume: 0.24
    },
    {
      startMs: 42,
      durationMs: 260,
      waveform: "sine",
      frequencyStart: 494,
      frequencyEnd: 588,
      attackMs: 10,
      releaseMs: 140,
      volume: 0.22
    },
    {
      startMs: 88,
      durationMs: 300,
      waveform: "saw",
      frequencyStart: 588,
      frequencyEnd: 740,
      attackMs: 8,
      releaseMs: 160,
      volume: 0.14,
      tremoloHz: 6,
      tremoloDepth: 0.08
    }
  ]
});

const JACKPOT_HIT_WAV = createClipWav({
  durationMs: 640,
  masterGain: 0.9,
  layers: [
    {
      startMs: 0,
      durationMs: 260,
      waveform: "triangle",
      frequencyStart: 330,
      frequencyEnd: 392,
      attackMs: 10,
      releaseMs: 100,
      volume: 0.26
    },
    {
      startMs: 36,
      durationMs: 280,
      waveform: "sine",
      frequencyStart: 494,
      frequencyEnd: 660,
      attackMs: 10,
      releaseMs: 120,
      volume: 0.24
    },
    {
      startMs: 92,
      durationMs: 420,
      waveform: "saw",
      frequencyStart: 660,
      frequencyEnd: 988,
      attackMs: 6,
      releaseMs: 200,
      volume: 0.16,
      tremoloHz: 7.2,
      tremoloDepth: 0.1
    },
    {
      startMs: 140,
      durationMs: 420,
      waveform: "sine",
      frequencyStart: 988,
      frequencyEnd: 1174,
      attackMs: 8,
      releaseMs: 220,
      volume: 0.12
    }
  ]
});

const FEATURE_ACCENT_WAVS: Record<"ember-lock" | "free-quest" | "wheel-ascension" | "relic-vault", string> = {
  "ember-lock": createClipWav({
    durationMs: 320,
    masterGain: 0.78,
    layers: [
      {
        startMs: 0,
        durationMs: 180,
        waveform: "triangle",
        frequencyStart: 248,
        frequencyEnd: 330,
        attackMs: 10,
        releaseMs: 90,
        volume: 0.26
      },
      {
        startMs: 48,
        durationMs: 200,
        waveform: "saw",
        frequencyStart: 392,
        frequencyEnd: 466,
        attackMs: 8,
        releaseMs: 100,
        volume: 0.14,
        noiseMix: 0.04
      }
    ]
  }),
  "free-quest": createClipWav({
    durationMs: 300,
    masterGain: 0.76,
    layers: [
      {
        startMs: 0,
        durationMs: 180,
        waveform: "sine",
        frequencyStart: 392,
        frequencyEnd: 524,
        attackMs: 10,
        releaseMs: 100,
        volume: 0.24
      },
      {
        startMs: 56,
        durationMs: 220,
        waveform: "triangle",
        frequencyStart: 524,
        frequencyEnd: 660,
        attackMs: 10,
        releaseMs: 110,
        volume: 0.16,
        tremoloHz: 5.4,
        tremoloDepth: 0.08
      }
    ]
  }),
  "wheel-ascension": createClipWav({
    durationMs: 320,
    masterGain: 0.78,
    layers: [
      {
        startMs: 0,
        durationMs: 200,
        waveform: "sine",
        frequencyStart: 440,
        frequencyEnd: 660,
        attackMs: 10,
        releaseMs: 90,
        volume: 0.24
      },
      {
        startMs: 52,
        durationMs: 220,
        waveform: "triangle",
        frequencyStart: 660,
        frequencyEnd: 784,
        attackMs: 10,
        releaseMs: 110,
        volume: 0.14
      }
    ]
  }),
  "relic-vault": createClipWav({
    durationMs: 340,
    masterGain: 0.78,
    layers: [
      {
        startMs: 0,
        durationMs: 190,
        waveform: "triangle",
        frequencyStart: 196,
        frequencyEnd: 262,
        attackMs: 10,
        releaseMs: 90,
        volume: 0.24
      },
      {
        startMs: 66,
        durationMs: 220,
        waveform: "sine",
        frequencyStart: 330,
        frequencyEnd: 392,
        attackMs: 10,
        releaseMs: 120,
        volume: 0.18,
        tremoloHz: 5,
        tremoloDepth: 0.08
      }
    ]
  })
};

const BONUS_ENTRY_WAVS: Record<BonusType, string> = {
  EMBER_RESPIN: createClipWav({
    durationMs: 540,
    masterGain: 0.88,
    layers: [
      {
        startMs: 0,
        durationMs: 320,
        waveform: "triangle",
        frequencyStart: 196,
        frequencyEnd: 330,
        attackMs: 12,
        releaseMs: 120,
        volume: 0.28
      },
      {
        startMs: 52,
        durationMs: 320,
        waveform: "saw",
        frequencyStart: 294,
        frequencyEnd: 466,
        attackMs: 8,
        releaseMs: 150,
        volume: 0.16,
        noiseMix: 0.04
      },
      {
        startMs: 164,
        durationMs: 260,
        waveform: "sine",
        frequencyStart: 466,
        frequencyEnd: 620,
        attackMs: 10,
        releaseMs: 160,
        volume: 0.12
      }
    ]
  }),
  WHEEL_ASCENSION: createClipWav({
    durationMs: 620,
    masterGain: 0.88,
    layers: [
      {
        startMs: 0,
        durationMs: 280,
        waveform: "sine",
        frequencyStart: 330,
        frequencyEnd: 440,
        attackMs: 12,
        releaseMs: 120,
        volume: 0.22
      },
      {
        startMs: 68,
        durationMs: 300,
        waveform: "triangle",
        frequencyStart: 440,
        frequencyEnd: 660,
        attackMs: 10,
        releaseMs: 140,
        volume: 0.18
      },
      {
        startMs: 146,
        durationMs: 340,
        waveform: "sine",
        frequencyStart: 660,
        frequencyEnd: 988,
        attackMs: 10,
        releaseMs: 180,
        volume: 0.12,
        tremoloHz: 6.2,
        tremoloDepth: 0.08
      }
    ]
  }),
  RELIC_VAULT_PICK: createClipWav({
    durationMs: 600,
    masterGain: 0.88,
    layers: [
      {
        startMs: 0,
        durationMs: 300,
        waveform: "triangle",
        frequencyStart: 146,
        frequencyEnd: 220,
        attackMs: 12,
        releaseMs: 120,
        volume: 0.24
      },
      {
        startMs: 82,
        durationMs: 320,
        waveform: "sine",
        frequencyStart: 220,
        frequencyEnd: 330,
        attackMs: 12,
        releaseMs: 150,
        volume: 0.18
      },
      {
        startMs: 182,
        durationMs: 280,
        waveform: "saw",
        frequencyStart: 330,
        frequencyEnd: 588,
        attackMs: 8,
        releaseMs: 180,
        volume: 0.1,
        tremoloHz: 4.8,
        tremoloDepth: 0.1
      }
    ]
  })
};

const AMBIENT_IDLE_WAV = createClipWav({
  durationMs: 1800,
  masterGain: 0.72,
  layers: [
    {
      startMs: 0,
      durationMs: 1800,
      waveform: "triangle",
      frequencyStart: 92,
      frequencyEnd: 88,
      attackMs: 180,
      releaseMs: 420,
      volume: 0.18,
      tremoloHz: 1.4,
      tremoloDepth: 0.05
    },
    {
      startMs: 120,
      durationMs: 1640,
      waveform: "sine",
      frequencyStart: 184,
      frequencyEnd: 176,
      attackMs: 160,
      releaseMs: 420,
      volume: 0.08
    }
  ]
});

const AMBIENT_SPIN_WAV = createClipWav({
  durationMs: 1640,
  masterGain: 0.74,
  layers: [
    {
      startMs: 0,
      durationMs: 1640,
      waveform: "triangle",
      frequencyStart: 128,
      frequencyEnd: 118,
      attackMs: 110,
      releaseMs: 320,
      volume: 0.2,
      tremoloHz: 1.8,
      tremoloDepth: 0.08
    },
    {
      startMs: 46,
      durationMs: 1480,
      waveform: "saw",
      frequencyStart: 256,
      frequencyEnd: 246,
      attackMs: 100,
      releaseMs: 280,
      volume: 0.08,
      noiseMix: 0.02
    }
  ]
});

const AMBIENT_BONUS_WAV = createClipWav({
  durationMs: 1700,
  masterGain: 0.78,
  layers: [
    {
      startMs: 0,
      durationMs: 1700,
      waveform: "sine",
      frequencyStart: 158,
      frequencyEnd: 172,
      attackMs: 120,
      releaseMs: 300,
      volume: 0.2,
      tremoloHz: 2.2,
      tremoloDepth: 0.1
    },
    {
      startMs: 80,
      durationMs: 1520,
      waveform: "triangle",
      frequencyStart: 316,
      frequencyEnd: 344,
      attackMs: 110,
      releaseMs: 320,
      volume: 0.1
    }
  ]
});

const AMBIENT_JACKPOT_WAV = createClipWav({
  durationMs: 1560,
  masterGain: 0.76,
  layers: [
    {
      startMs: 0,
      durationMs: 1560,
      waveform: "square",
      frequencyStart: 194,
      frequencyEnd: 182,
      attackMs: 80,
      releaseMs: 240,
      volume: 0.12,
      noiseMix: 0.02
    },
    {
      startMs: 32,
      durationMs: 1520,
      waveform: "triangle",
      frequencyStart: 388,
      frequencyEnd: 366,
      attackMs: 90,
      releaseMs: 260,
      volume: 0.12,
      tremoloHz: 2.4,
      tremoloDepth: 0.08
    }
  ]
});

function createHowl(src: string, volume: number, loop = false): Howl {
  return new Howl({ src: [src], volume, loop });
}

export class AudioBus {
  private readonly spinSound = createHowl(SPIN_TICK_WAV, 0.34);

  private readonly winSound = createHowl(WIN_STINGER_WAV, 0.58);

  private readonly bigWinSound = createHowl(BIG_WIN_STINGER_WAV, 0.62);

  private readonly jackpotSound = createHowl(JACKPOT_HIT_WAV, 0.72);

  private readonly featureSounds: Record<
    "ember-lock" | "free-quest" | "wheel-ascension" | "relic-vault",
    Howl
  > = {
    "ember-lock": createHowl(FEATURE_ACCENT_WAVS["ember-lock"], 0.46),
    "free-quest": createHowl(FEATURE_ACCENT_WAVS["free-quest"], 0.48),
    "wheel-ascension": createHowl(FEATURE_ACCENT_WAVS["wheel-ascension"], 0.48),
    "relic-vault": createHowl(FEATURE_ACCENT_WAVS["relic-vault"], 0.48)
  };

  private readonly bonusEntrySounds: Record<BonusType, Howl> = {
    EMBER_RESPIN: createHowl(BONUS_ENTRY_WAVS.EMBER_RESPIN, 0.64),
    WHEEL_ASCENSION: createHowl(BONUS_ENTRY_WAVS.WHEEL_ASCENSION, 0.62),
    RELIC_VAULT_PICK: createHowl(BONUS_ENTRY_WAVS.RELIC_VAULT_PICK, 0.62)
  };

  private readonly ambientLoops: Record<TensionState, Howl> = {
    idle: createHowl(AMBIENT_IDLE_WAV, 0, true),
    spin: createHowl(AMBIENT_SPIN_WAV, 0, true),
    bonus: createHowl(AMBIENT_BONUS_WAV, 0, true),
    jackpot: createHowl(AMBIENT_JACKPOT_WAV, 0, true)
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
      this.jackpotSound.rate(0.98);
      this.jackpotSound.play();
      this.setTensionState("jackpot", 1800);
      return;
    }

    if (amount > 120) {
      this.bigWinSound.rate(1.03);
      this.bigWinSound.play();
      this.setTensionState("bonus", 1100);
      return;
    }

    this.winSound.rate(1.02);
    this.winSound.play();
  }

  public playFeature(
    name: "ember-lock" | "free-quest" | "wheel-ascension" | "relic-vault"
  ): void {
    if (!this.unlocked || this.muted) {
      return;
    }

    this.featureSounds[name].play();

    if (name === "free-quest") {
      this.setTensionState("bonus", 980);
      return;
    }

    if (name === "ember-lock") {
      this.setTensionState("bonus", 1200);
      return;
    }

    if (name === "wheel-ascension") {
      this.setTensionState("bonus", 1400);
      return;
    }

    this.setTensionState("bonus", 1400);
  }

  public playBonusEntry(type: BonusType): void {
    if (!this.unlocked || this.muted) {
      return;
    }

    const bonusSound = this.bonusEntrySounds[type];

    if (type === "EMBER_RESPIN") {
      bonusSound.rate(0.94);
    } else if (type === "WHEEL_ASCENSION") {
      bonusSound.rate(1.02);
    } else {
      bonusSound.rate(0.98);
    }

    bonusSound.play();
    this.setTensionState("bonus", type === "WHEEL_ASCENSION" ? 2600 : 2400);
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
      idle: 0.17,
      spin: 0.24,
      bonus: 0.34,
      jackpot: 0.39
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
