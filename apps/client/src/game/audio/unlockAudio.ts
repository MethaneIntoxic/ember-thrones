import { Howler } from "howler";
import { audioBus } from "./audioBus";

export function installAudioUnlock(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  let unlocked = false;

  const unlock = (): void => {
    if (unlocked) {
      return;
    }

    unlocked = true;

    if (Howler.ctx && Howler.ctx.state === "suspended") {
      void Howler.ctx.resume();
    }

    audioBus.prime();
    cleanup();
  };

  const cleanup = (): void => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });

  return cleanup;
}
