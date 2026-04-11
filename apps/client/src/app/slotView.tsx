import { useEffect, useMemo, useRef, useState } from "react";
import { audioBus } from "../game/audio/audioBus";
import { installAudioUnlock } from "../game/audio/unlockAudio";
import { PixiStage } from "../game/engine/pixiStage";
import { EventClient } from "../game/net/eventClient";
import { budgetForTier, inferPerfTier, PerfBudgetMonitor } from "../game/platform/perfBudget";
import { useGameStore, type MiniGameType } from "../game/state/store";
import { BonusPanels } from "../game/ui/bonusPanels";
import { Hud } from "../game/ui/hud";
import { LanternPick } from "../game/ui/miniGames/lanternPick";
import { SkyPath } from "../game/ui/miniGames/skyPath";
import { WyrmDuel } from "../game/ui/miniGames/wyrmDuel";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const MINI_GAME_TABS: Array<{ key: MiniGameType; label: string }> = [
  { key: "lantern-pick", label: "Lantern Pick" },
  { key: "sky-path", label: "Sky Path" },
  { key: "wyrm-duel", label: "Wyrm Duel" }
];

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
  const error = useGameStore((state) => state.error);
  const jackpotLadder = useGameStore((state) => state.jackpotLadder);
  const emberLock = useGameStore((state) => state.emberLock);
  const freeQuest = useGameStore((state) => state.freeQuest);
  const progression = useGameStore((state) => state.progression);
  const apiMode = useGameStore((state) => state.apiMode);
  const activeMiniGame = useGameStore((state) => state.activeMiniGame);

  const bootstrap = useGameStore((state) => state.bootstrap);
  const spin = useGameStore((state) => state.spin);
  const syncOfflineQueue = useGameStore((state) => state.syncOfflineQueue);
  const adjustBet = useGameStore((state) => state.adjustBet);
  const setOnlineStatus = useGameStore((state) => state.setOnlineStatus);
  const setMiniGame = useGameStore((state) => state.setMiniGame);
  const awardMiniGameReward = useGameStore((state) => state.awardMiniGameReward);
  const consumeServerEvent = useGameStore((state) => state.consumeServerEvent);

  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<PixiStage | null>(null);
  const previousSpinsRef = useRef(0);

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

  const onSpin = async (): Promise<void> => {
    audioBus.playSpin();
    await spin();
  };

  const onMiniGameReward = (coins: number): void => {
    const gemReward = Math.floor(coins / 120);
    awardMiniGameReward(coins, gemReward);
    audioBus.playFeature("mini-game");
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
          <p className="panel-kicker">Original Dragon-Fantasy Vertical Slice</p>
          <h1>Ember Thrones</h1>
          <p>
            Hold-and-respin tension with jackpot ladder drama and side mini-games.
            {profile ? ` Welcome back, ${profile.nickname}.` : ""}
          </p>
        </div>

        <div className="perf-chip">{perfLabel}</div>
      </header>

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
          apiMode={apiMode}
        />
      </section>

      <section className="mini-section">
        <div className="mini-switch">
          {MINI_GAME_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={tab.key === activeMiniGame ? "is-active" : ""}
              onClick={() => setMiniGame(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeMiniGame === "lantern-pick" ? <LanternPick onReward={onMiniGameReward} /> : null}
        {activeMiniGame === "sky-path" ? <SkyPath onReward={onMiniGameReward} /> : null}
        {activeMiniGame === "wyrm-duel" ? <WyrmDuel onReward={onMiniGameReward} /> : null}
      </section>
    </article>
  );
}
