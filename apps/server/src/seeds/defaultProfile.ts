import type { ProfileBootstrap } from "../lib/db.js";

export const DEFAULT_PROFILE_ID = "local-player";
export const DEFAULT_PROFILE_NICKNAME = "Dragon Seeker";

export const createDefaultProfile = (
  overrides: Partial<ProfileBootstrap> = {},
): ProfileBootstrap => {
  return {
    id: overrides.id ?? DEFAULT_PROFILE_ID,
    nickname: overrides.nickname ?? DEFAULT_PROFILE_NICKNAME,
    level: overrides.level ?? 1,
    xp: overrides.xp ?? 0,
    coins: overrides.coins ?? 50_000,
    gems: overrides.gems ?? 25,
  };
};
