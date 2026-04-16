import { useEffect, useMemo, useRef, useState } from "react";
import { audioBus } from "../game/audio/audioBus";
import { installAudioUnlock } from "../game/audio/unlockAudio";
import { PixiStage } from "../game/engine/pixiStage";
import type { BonusType } from "../game/net/apiClient";
import { EventClient } from "../game/net/eventClient";
import { budgetForTier, inferPerfTier, PerfBudgetMonitor } from "../game/platform/perfBudget";
import type { RuntimeExperience } from "../game/platform/runtimePolicy";
import { useGameStore } from "../game/state/store";
import { BonusPanels } from "../game/ui/bonusPanels";
import { BonusPresentationOverlay } from "../game/ui/bonusPresentation";
import { Hud } from "../game/ui/hud";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function formatBonusType(type: BonusType): string {
  if (type === "EMBER_RESPIN") {
    return "Ember Respin";
  }

  if (type === "WHEEL_ASCENSION") {
    return "Wheel Ascension";
  }

  if (type === "RELIC_VAULT_PICK") {
    return "Relic Vault";
  }

  return "Relic Vault";
}

function runtimeEventLabel(eventStreamState: "idle" | "connected" | "disconnected" | "unavailable"): string {
  if (eventStreamState === "connected") {
    return "Live events online";
  }

  if (eventStreamState === "disconnected") {
    return "Live events reconnecting";
  }

  if (eventStreamState === "unavailable") {
    return "Live events unavailable";
  }

  return "Live events standing by";
}

function runtimeToneClass(experience: RuntimeExperience): string {
  if (experience === "connected") {
    return "is-connected";
  }

  if (experience === "disconnected") {
    return "is-disconnected";
  }

  return "is-demo";
}

export function SlotView(): JSX.Element {
  const profile = useGameStore((state) => state.profile);
  const wallet = useGameStore((state) => state.wallet);
  const reels = useGameStore((state) => state.reels);
  const winLines = useGameStore((state) => state.winLines);
  const lastWin = useGameStore((state) => state.lastWin);
  const bet = useGameStore((state) => state.bet);
  const config = useGameStore((state) => state.config);
  const spinning = useGameStore((state) => state.spinning);
  const online = useGameStore((state) => state.online);
  const queuedSpins = useGameStore((state) => state.queuedSpins);
  const strandedQueuedSpins = useGameStore((state) => state.strandedQueuedSpins);
  const error = useGameStore((state) => state.error);
  const runtimeCapabilities = useGameStore((state) => state.runtimeCapabilities);
  const runtimeSummary = useGameStore((state) => state.runtimeSummary);
  const queueSummary = useGameStore((state) => state.queueSummary);
  const eventStreamState = useGameStore((state) => state.eventStreamState);
  const jackpotLadder = useGameStore((state) => state.jackpotLadder);
  const emberLock = useGameStore((state) => state.emberLock);
  const freeQuest = useGameStore((state) => state.freeQuest);
  const progression = useGameStore((state) => state.progression);
  const activeBonus = useGameStore((state) => state.activeBonus);
  const bonusSessions = useGameStore((state) => state.bonusSessions);

  const bootstrap = useGameStore((state) => state.bootstrap);
  const spin = useGameStore((state) => state.spin);
  const syncOfflineQueue = useGameStore((state) => state.syncOfflineQueue);
  const adjustBet = useGameStore((state) => state.adjustBet);
  const setOnlineStatus = useGameStore((state) => state.setOnlineStatus);
  const dismissBonus = useGameStore((state) => state.dismissBonus);
  const consumeServerEvent = useGameStore((state) => state.consumeServerEvent);

  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<PixiStage | null>(null);
  const previousSpinsRef = useRef(0);
  const previousBonusSessionRef = useRef<string | null>(null);

  const [perfLabel, setPerfLabel] = useState("Performance: sampling...");
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

  const perfTier = useMemo(() => {
    const deviceMemory =
      typeof navigator !== "undefined" && "deviceMemory" in navigator
        ? Number(navigator.deviceMemory)
        : 4;

    const hardwareConcurrency = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 4;
    return inferPerfTier(window.innerWidth, deviceMemory, hardwareConcurrency);
  }, []);

  useEffect(() => {
    const monitor = new PerfBudgetMonitor(perfTier);
    const budget = budgetForTier(perfTier);

    let frameId = 0;
    const tick = (timestamp: number): void => {
      monitor.markFrame(timestamp);
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    const interval = window.setInterval(() => {
      const snap = monitor.snapshot();
      setPerfLabel(
        `Performance: ${snap.avgFps.toFixed(0)} fps · Tier ${snap.tier} · Budget ${budget.targetFps} fps`
      );
    }, 1000);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(interval);
    };
  }, [perfTier]);

  useEffect(() => {
    void bootstrap();
    void syncOfflineQueue();
  }, [bootstrap, syncOfflineQueue]);

  useEffect(() => {
    const cleanupAudioUnlock = installAudioUnlock();

    return () => {
      cleanupAudioUnlock();
    };
  }, []);

  useEffect(() => {
    const onlineHandler = (): void => {
      setOnlineStatus(true);
      void syncOfflineQueue();
    };

    const offlineHandler = (): void => {
      setOnlineStatus(false);
    };

    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);

    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
    };
  }, [setOnlineStatus, syncOfflineQueue]);

  useEffect(() => {
    const client = new EventClient();

    client.connect((event) => {
      consumeServerEvent(event);
    });

    return () => {
      client.close();
    };
  }, [consumeServerEvent]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    const onUpdateReady = (): void => {
      setUpdateReady(true);
    };

    window.addEventListener("sw:update-ready", onUpdateReady);
    return () => {
      window.removeEventListener("sw:update-ready", onUpdateReady);
    };
  }, []);

  useEffect(() => {
    const stage = new PixiStage();
    stageRef.current = stage;

    const mountStage = async (): Promise<void> => {
      const host = stageHostRef.current;
      if (!host) {
        return;
      }

      await stage.mount(host);
      stage.resize(host.clientWidth, host.clientHeight);
      await stage.presentSpinResult(reels, winLines, lastWin);
    };

    void mountStage();

    const onResize = (): void => {
      if (!stageHostRef.current) {
        return;
      }

      stage.resize(stageHostRef.current.clientWidth, stageHostRef.current.clientHeight);
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      stage.destroy();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!stageRef.current) {
      return;
    }

    void stageRef.current.presentSpinResult(reels, winLines, lastWin);
  }, [reels, winLines, lastWin]);

  useEffect(() => {
    if (wallet.lifetimeSpins <= previousSpinsRef.current) {
      return;
    }

    previousSpinsRef.current = wallet.lifetimeSpins;
    audioBus.playWin(lastWin);

    if (emberLock.active) {
      audioBus.playFeature("ember-lock");
    }

    if (freeQuest.active) {
      audioBus.playFeature("free-quest");
    }
  }, [wallet.lifetimeSpins, lastWin, emberLock.active, freeQuest.active]);

  useEffect(() => {
    if (activeBonus) {
      audioBus.setTensionState("bonus");
      return;
    }

    audioBus.setTensionState(spinning ? "spin" : "idle");
  }, [spinning, activeBonus]);

  useEffect(() => {
    if (!activeBonus) {
      previousBonusSessionRef.current = null;
      return;
    }

    if (previousBonusSessionRef.current === activeBonus.sessionId) {
      return;
    }

    previousBonusSessionRef.current = activeBonus.sessionId;
    audioBus.playBonusEntry(activeBonus.type);

    if (stageRef.current) {
      void stageRef.current.playBonusEntry(activeBonus.type);
    }
  }, [activeBonus]);

  const onSpin = async (): Promise<void> => {
    audioBus.playSpin();
    await spin();
  };

  const onInstall = async (): Promise<void> => {
    if (!deferredInstallPrompt) {
      return;
    }

    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setDeferredInstallPrompt(null);
    }
  };

  const onApplyUpdate = async (): Promise<void> => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
      return;
    }

    window.location.reload();
  };

  const minBet = config?.minBet ?? 10;
  const maxBet = config?.maxBet ?? 500;

  return (
    <article className="slot-view">
      <header className="top-banner">
        <div className="title-block">
          <p className="panel-kicker">Authoritative Dragon-Fantasy Slot</p>
          <h1>Ember Thrones</h1>
          <p>
            Reel-triggered bonus volatility with deterministic reveal sessions and jackpot tension.
            {profile ? ` Welcome back, ${profile.nickname}.` : ""}
          </p>
        </div>

        <div className="perf-chip">{perfLabel}</div>
      </header>

      <section className={`runtime-ribbon ${runtimeToneClass(runtimeCapabilities.experience)}`} aria-live="polite">
        <div className="runtime-pill-row">
          <span className={`runtime-badge ${runtimeToneClass(runtimeCapabilities.experience)}`}>
            {runtimeCapabilities.label} Runtime
          </span>
          <span className="runtime-chip">
            {runtimeCapabilities.configuredMode === "hybrid" ? "Connected channel configured" : "Demo-only build"}
          </span>
          <span className="runtime-chip">{runtimeEventLabel(eventStreamState)}</span>
          <span className="runtime-chip">
            {runtimeCapabilities.offlineQueue.supported
              ? runtimeCapabilities.offlineQueue.canReplayNow
                ? "Queue replay available"
                : "Queue replay paused"
              : "Queue replay disabled"}
          </span>
        </div>
        <p className="runtime-summary">{runtimeSummary}</p>
        <p className="runtime-queue">{queueSummary}</p>
      </section>

      <section className="slot-grid">
        <div className="main-column">
          <div className="reel-stage" ref={stageHostRef} />

          <Hud
            coins={wallet.coins}
            gems={wallet.gems}
            bet={bet}
            minBet={minBet}
            maxBet={maxBet}
            spinning={spinning}
            lastWin={lastWin}
            queuedSpins={queuedSpins}
            online={online}
            runtimeExperience={runtimeCapabilities.experience}
            runtimeLabel={runtimeCapabilities.label}
            queueSupported={runtimeCapabilities.offlineQueue.supported}
            queueCanReplayNow={runtimeCapabilities.offlineQueue.canReplayNow}
            onSpin={() => {
              void onSpin();
            }}
            onAdjustBet={adjustBet}
            onSyncQueue={() => {
              void syncOfflineQueue();
            }}
            installAvailable={Boolean(deferredInstallPrompt)}
            onInstall={() => {
              void onInstall();
            }}
            updateAvailable={updateReady}
            onApplyUpdate={() => {
              void onApplyUpdate();
            }}
          />

          {error ? <p className="error-banner">{error}</p> : null}
        </div>

        <BonusPanels
          jackpotLadder={jackpotLadder}
          emberLock={emberLock}
          freeQuest={freeQuest}
          progression={progression}
          activeBonus={activeBonus}
          bonusSessionCount={bonusSessions.length}
          runtimeCapabilities={runtimeCapabilities}
          runtimeSummary={runtimeSummary}
          queueSummary={queueSummary}
          eventStreamState={eventStreamState}
          queuedSpins={queuedSpins}
          strandedQueuedSpins={strandedQueuedSpins}
        />
      </section>

      <section className="bonus-showcase">
        <p className={`bonus-tracker ${activeBonus ? "" : "is-idle"}`}>
          {activeBonus
            ? `Active Bonus: ${formatBonusType(activeBonus.type)} · Seed ${activeBonus.revealSeed.slice(0, 8)} · Source ${activeBonus.source === "event" ? "Server Event" : "Spin Payload"}`
            : "No bonus active. Trigger Ember Respin, Wheel Ascension, or Relic Vault from the reels."}
        </p>
        <p className="bonus-session-count">Tracked Bonus Sessions: {bonusSessions.length}</p>
      </section>

      <BonusPresentationOverlay
        bonus={activeBonus}
        onClose={dismissBonus}
      />
    </article>
  );
}
