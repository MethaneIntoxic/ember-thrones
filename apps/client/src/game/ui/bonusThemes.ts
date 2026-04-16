import type { BonusType } from "../net/apiClient";

export type BonusToneClass = "is-ember" | "is-wheel" | "is-relic";

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
  EMBER_RESPIN: {
    type: "EMBER_RESPIN",
    label: "Ember Respin",
    kicker: "Collector Hold Feature",
    tagline: "Locked embers pin the board while every fresh orb reignites the respin counter.",
    panelCopy: "High-heat lock feature built around collector resets and sticky orb value pressure.",
    liveLabel: "Board ignited",
    idleLabel: "Waiting for ember lock",
    accentLabel: "Collector heat",
    accentValueLabel: "Locked cells",
    detailLabel: "Respin loop",
    storyLead: "The collector wakes once the reels trap glowing embers on the grid.",
    storySupport: "Every new orb snaps the count back to three, so the reveal should feel like a heated chase instead of a static audit.",
    toneClass: "is-ember",
    crestAsset: toAssetPath("assets/sprites/bonus-ember-seal.svg")
  },
  WHEEL_ASCENSION: {
    type: "WHEEL_ASCENSION",
    label: "Wheel Ascension",
    kicker: "Orbit Ladder Feature",
    tagline: "Scatter energy climbs into a celestial wheel that can extend its own flight path.",
    panelCopy: "Blue-sky retrigger feature that should feel suspended, ascending, and slightly ceremonial.",
    liveLabel: "Wheel charging",
    idleLabel: "Awaiting ascent",
    accentLabel: "Orbit charge",
    accentValueLabel: "Awarded spins",
    detailLabel: "Retrigger loop",
    storyLead: "Once the wheel takes over, every wedge reveal should feel like altitude and momentum.",
    storySupport: "The presentation needs to emphasize the build toward extra spins rather than dropping the player into a metrics table.",
    toneClass: "is-wheel",
    crestAsset: toAssetPath("assets/sprites/bonus-wheel-seal.svg")
  },
  RELIC_VAULT_PICK: {
    type: "RELIC_VAULT_PICK",
    label: "Relic Vault",
    kicker: "Vault Pick Feature",
    tagline: "Keys break open a relic chamber where each pick exposes the next layer of value.",
    panelCopy: "Treasure-room bonus with deliberate unlock rhythm, key scarcity, and vault-door drama.",
    liveLabel: "Vault open",
    idleLabel: "Chamber sealed",
    accentLabel: "Vault resonance",
    accentValueLabel: "Keys primed",
    detailLabel: "Pick cycle",
    storyLead: "Relic Vault should land like entering a chamber, not just opening another spreadsheet panel.",
    storySupport: "Keys, picks, and hidden symbols need clear staging so the player senses the room unlocking around them.",
    toneClass: "is-relic",
    crestAsset: toAssetPath("assets/sprites/bonus-relic-seal.svg")
  }
};

export function getBonusTheme(type: BonusType): BonusTheme {
  return THEMES[type];
}