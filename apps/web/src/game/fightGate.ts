// Should the FightSurface render this frame?
//
// The fight phase arrives via the Convex subscription while the dice overlay that explains it
// arrives with the mutation result — an unordered race (see useDispatchWithRolls). Deferring the
// INITIAL mount while a roll-producing dispatch is in flight guarantees the reaction roll
// presents no later than the fight screen it caused. Once the fight is on screen, mid-fight
// dispatches (resolve round, retreat…) must NOT unmount it — the overlay simply lands on top,
// as it always has.
export function showFightSurface(inFight: boolean, pending: boolean, alreadyShown: boolean): boolean {
  if (!inFight) return false;
  return alreadyShown || !pending;
}
