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

function transportLabel(transport: "streamed" | "seeded" | "demo"): string {
  if (transport === "streamed") {
    return "Server stream";
  }

  if (transport === "demo") {
    return "Demo staging";
  }

  return "Seeded snapshot";
}

export function SlotView(): JSX.Element {
  const profile = useGameStore((state) => state.profile);
  const wallet = useGameStore((state) => state.wallet);
  const reels = useGameStore((state) => state.reels);
  const winLines = useGameStore((state) => state.winLines);
  const lastWin = useGameStore((state) => state.lastWin);
  const config = useGameStore((state) => state.config);
  const mathConfig = useGameStore((state) => state.mathConfig);
  const wager = useGameStore((state) => state.wager);
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
  const activeBonus = useGameStore((state) => state.activeBonus);
  const bonusSessions = useGameStore((state) => state.bonusSessions);

  const bootstrap = useGameStore((state) => state.bootstrap);
  const spin = useGameStore((state) => state.spin);
  const syncOfflineQueue = useGameStore((state) => state.syncOfflineQueue);
  const setDenomination = useGameStore((state) => state.setDenomination);
  const setCreditsPerSpin = useGameStore((state) => state.setCreditsPerSpin);
  const setSpeedMode = useGameStore((state) => state.setSpeedMode);
  const setMaxBet = useGameStore((state) => state.setMaxBet);
  const setOnlineStatus = useGameStore((state) => state.setOnlineStatus);
  const dismissBonus = useGameStore((state) => state.dismissBonus);
  const consumeServerEvent = useGameStore((state) => state.consumeServerEvent);

  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<PixiStage | null>(null);
  const previousSpinsRef = useRef(0);
  const previousBonusSessionRef = useRef<string | null>(null);
  const autoSpinTimerRef = useRef<number | null>(null);

  const [perfLabel, setPerfLabel] = useState("Performance: sampling...");
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [autoSpinArmed, setAutoSpinArmed] = useState(false);

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
      stage.setSpinSpeedMode(wager.speedMode);
      stage.resize(host.clientWidth, host.clientHeight);
      await stage.presentSpinResult(reels, winLines, lastWin, wager.speedMode);
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

    stageRef.current.setSpinSpeedMode(wager.speedMode);
  }, [wager.speedMode]);

  useEffect(() => {
    if (!stageRef.current) {
      return;
    }

    void stageRef.current.presentSpinResult(reels, winLines, lastWin, wager.speedMode);
  }, [reels, winLines, lastWin, wager.speedMode]);

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

  useEffect(() => {
    if (!activeBonus || !autoSpinArmed) {
      return;
    }

    setAutoSpinArmed(false);
  }, [activeBonus, autoSpinArmed]);

  useEffect(() => {
    if (wager.speedMode === "auto") {
      return;
    }

    setAutoSpinArmed(false);
  }, [wager.speedMode]);

  useEffect(() => {
    const clearTimer = (): void => {
      if (autoSpinTimerRef.current !== null) {
        window.clearTimeout(autoSpinTimerRef.current);
        autoSpinTimerRef.current = null;
      }
    };

    if (!autoSpinArmed || wager.speedMode !== "auto" || spinning || activeBonus) {
      clearTimer();
      return clearTimer;
    }

    if (!online && runtimeCapabilities.experience !== "demo") {
      clearTimer();
      return clearTimer;
    }

    autoSpinTimerRef.current = window.setTimeout(() => {
      void handleSpinRequest();
    }, 420);

    return clearTimer;
  }, [
    autoSpinArmed,
    wager.speedMode,
    spinning,
    activeBonus,
    online,
    runtimeCapabilities.experience
  ]);

  useEffect(() => {
    return () => {
      if (autoSpinTimerRef.current !== null) {
        window.clearTimeout(autoSpinTimerRef.current);
      }
    };
  }, []);

  const handleSpinRequest = async (): Promise<void> => {
    if (wager.speedMode === "auto" && autoSpinArmed && !spinning) {
      setAutoSpinArmed(false);
      return;
    }

    if (wager.speedMode === "auto" && !autoSpinArmed) {
      setAutoSpinArmed(true);
    }

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

  return (
    <article className="slot-view">
      <header className="top-banner">
        <div className="title-block">
          <p className="panel-kicker">Vegas-Style 5x3 Cabinet Harness</p>
          <h1>Dragon Link</h1>
          <p>
            Fixed-geometry reels, denomination-led wagering, credits-per-spin ladders, and feature
            sessions that distinguish authoritative streams from demo staging.
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
          <span className="runtime-chip">{mathConfig.reels}x{mathConfig.rows} cabinet</span>
          <span className="runtime-chip">{mathConfig.fixedLines} fixed lines</span>
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
            wager={wager}
            mathConfig={mathConfig}
            minBet={config?.minBet ?? 10}
            maxBet={config?.maxBet ?? 500}
            spinning={spinning}
            lastWin={lastWin}
            queuedSpins={queuedSpins}
            online={online}
            runtimeExperience={runtimeCapabilities.experience}
            runtimeLabel={runtimeCapabilities.label}
            queueSupported={runtimeCapabilities.offlineQueue.supported}
            queueCanReplayNow={runtimeCapabilities.offlineQueue.canReplayNow}
            installAvailable={Boolean(deferredInstallPrompt)}
            updateAvailable={updateReady}
            autoSpinArmed={autoSpinArmed}
            onSpin={() => {
              void handleSpinRequest();
            }}
            onSetDenomination={setDenomination}
            onSetCreditsPerSpin={setCreditsPerSpin}
            onSetSpeedMode={setSpeedMode}
            onMaxBet={setMaxBet}
            onSyncQueue={() => {
              void syncOfflineQueue();
            }}
            onInstall={() => {
              void onInstall();
            }}
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
          activeBonus={activeBonus}
          bonusSessionCount={bonusSessions.length}
          runtimeCapabilities={runtimeCapabilities}
          runtimeSummary={runtimeSummary}
          queueSummary={queueSummary}
          eventStreamState={eventStreamState}
          queuedSpins={queuedSpins}
          strandedQueuedSpins={strandedQueuedSpins}
          mathConfig={mathConfig}
          wager={wager}
        />
      </section>

      <section className="bonus-showcase">
        <p className={`bonus-tracker ${activeBonus ? "" : "is-idle"}`}>
          {activeBonus
            ? `Active Feature: ${formatBonusType(activeBonus.type)} · ${transportLabel(activeBonus.transport)} · ${activeBonus.featureSession.remainingLabel}`
            : `No feature active. Grand qualification ${wager.qualifiesForProgressive ? "is live at this wager" : "requires max bet"}.`}
        </p>
        <p className="bonus-session-count">
          Tracked Sessions: {bonusSessions.length} · Speed {wager.speedMode.toUpperCase()} · Wager {wager.totalBet.toLocaleString()} coins
        </p>
      </section>

      <BonusPresentationOverlay bonus={activeBonus} onClose={dismissBonus} />
    </article>
  );
}
