/** Baked city palettes and police uniforms never use a player's equipped fabric. */
export function usesEquippedFabric(actorId: string, materialName: string) {
  return (
    actorId === "explorer" &&
    /(?:^|-)(?:Explorer_Jacket|(?:Kofi|Nia|Tayo)_WovenJacket)(?:[.-]|$)/.test(
      materialName,
    )
  );
}
