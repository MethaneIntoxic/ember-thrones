import type { BonusType } from "../net/apiClient";

export type BonusToneClass = "is-hold-and-spin" | "is-free-games";

export interface BonusTheme {
  type: BonusType;
  label: string;
  kicker: string;
  tagline: string;
  panelCopy: string;
  liveLabel: string;
  idleLabel: string;
  accentLabel: string;
  accentValueLabel: string;
  detailLabel: string;
  storyLead: string;
  storySupport: string;
  toneClass: BonusToneClass;
  crestAsset: string;
}

const BASE_URL = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

function toAssetPath(relativePath: string): string {
  return `${BASE_URL}${relativePath.replace(/^\/+/, "")}`;
}

const THEMES: Record<BonusType, BonusTheme> = {
  HOLD_AND_SPIN: {
    type: "HOLD_AND_SPIN",
    label: "Hold & Spin",
    kicker: "Linked Orb Feature",
    tagline:
      "Six or more orbs lock onto the 5x3 board, every new orb resets the counter, and a full board chases the Grand.",
    panelCopy:
      "High-volatility orb feature with sticky values, jackpot labels, and a true three-respin pressure loop.",
    liveLabel: "Board locked",
    idleLabel: "Waiting for 6+ orbs",
    accentLabel: "Orb pressure",
    accentValueLabel: "Locked spots",
    detailLabel: "Respin ladder",
    storyLead:
      "Hold & Spin should feel like the reels snap into a linked bonus board the moment the trigger lands.",
    storySupport:
      "Fresh orbs reset the count, jackpot labels stay visible, and the room should feel tighter with every empty respin.",
    toneClass: "is-hold-and-spin",
    crestAsset: toAssetPath("assets/sprites/bonus-hold-and-spin-seal.svg")
  },
  FREE_GAMES: {
    type: "FREE_GAMES",
    label: "Free Games",
    kicker: "Scatter Feature",
    tagline:
      "Scatter symbols award a modifier-driven free-game series with deterministic reveal beats and retrigger potential.",
    panelCopy:
      "Feature-spins package tuned around cabinet modifiers such as royals removed, mystery symbol reveals, and expanding wild reels.",
    liveLabel: "Games awarded",
    idleLabel: "Waiting for scatters",
    accentLabel: "Modifier state",
    accentValueLabel: "Games awarded",
    detailLabel: "Reveal trail",
    storyLead: "Free Games should read like a real feature package, not a detached mini game.",
    storySupport:
      "The modifier needs to lead the presentation so players instantly understand why this series feels different from the base game.",
    toneClass: "is-free-games",
    crestAsset: toAssetPath("assets/sprites/bonus-free-games-seal.svg")
  }
};

export function getBonusTheme(type: BonusType): BonusTheme {
  return THEMES[type];
}
