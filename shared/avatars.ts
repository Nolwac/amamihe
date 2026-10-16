export const CHARACTERS = [
  {
    id: "amani",
    name: "Amani",
    description: "Braided hair, patterned jacket",
    height: 1.65,
  },
  {
    id: "kofi",
    name: "Kofi",
    description: "Short curls, broad jacket",
    height: 1.7,
  },
  {
    id: "nia",
    name: "Nia",
    description: "Curly bob, rounded face",
    height: 1.56,
  },
  {
    id: "tayo",
    name: "Tayo",
    description: "Close crop, warm complexion",
    height: 1.62,
  },
] as const;
export type CharacterId = (typeof CHARACTERS)[number]["id"];
export const CITY_ASSET_BYTE_LIMITS = {
  animated: 1_500_000,
  resident: 600_000,
  portrait: 100_000,
} as const;
/** Public transfer limits shared by pre-merge and live-release validation. */
export function cityAssetDownloads() {
  return [
    ...[...CHARACTERS.map(({ id }) => id), "officer"].flatMap((id) => [
      {
        file: `character-${id}.glb`,
        maxBytes: CITY_ASSET_BYTE_LIMITS.animated,
      },
      {
        file: `character-${id}-portrait.png`,
        maxBytes: CITY_ASSET_BYTE_LIMITS.portrait,
      },
    ]),
    ...["kofi", "nia", "tayo"].map((id) => ({
      file: `character-${id}-resident.glb`,
      maxBytes: CITY_ASSET_BYTE_LIMITS.resident,
    })),
  ];
}
export function characterId(value: unknown): CharacterId {
  return CHARACTERS.some((c) => c.id === value)
    ? (value as CharacterId)
    : "amani";
}
export function character(value: unknown) {
  return CHARACTERS.find((c) => c.id === characterId(value))!;
}
export function characterAsset(value: unknown) {
  return `/assets/character-${characterId(value)}.glb`;
}
