# The Lost Ruby Statue (issue #59)

Status: **implemented on a branch-less working tree, not committed.** Written 2026-11-13 from Peter's ruling (relayed on issue #59) and
the answers to the follow-up questions. Resolved (Peter, 14-NOV-2026): there is no "wrestle" in the rules; the Statue is a standard fight against a physical foe (fs 8, mp 0) with the Statue as attacker, like a Chest Spectre appearing; magic users count as usual, in front at full strength or in support behind; once freed the Ruby is ordinary treasure; multiplayer state is cave-shared; no retreat on re-entry stands. Gated by a new
`variants.statueFight` (stamped with `combatRevision` on new games) so that older games and their replays keep the wrestle.

## Today

`takeTreasure` on the Lost Ruby (treasure 11, until `rubyFreed`) makes **one member** wrestle: `frontStrength + d6` against
`8 + d6`, no combat screen. A win frees the Ruby; a loss slays that member and leaves the Ruby, and the Statue never attacks anyone
else (SC-7.3-9, SC-11-26..28, SC-11-47). The rulebook line "aroused then retreated, it attacks any party entering" was removed
in `3ffcf6e`.

## The ruling

1. **Nothing is forced.** Once the hazards and strangers in the chamber are resolved, the Ruby is just treasure on offer. The party
   may leave it and move on freely. Nothing warns the player about the Statue.
2. **Someone must make the attempt.** As today, a member explicitly "wrestles" for the Ruby from its card in the pickup. That
   action starts a fight.
3. **The attempt is a full fight.** The Statue attacks the **whole party** as a single non-Stranger creature of **strength 8
   with magic**, played through the revised combat screen. The party has **no surprise** and the Statue has none.
4. **Win:** the Statue is destroyed, the Ruby is taken, and it is ordinary treasure from then on (SC-11-47 stays).
5. **Retreat** (a normal retreat, when the party chooses it): the Statue stays in that chamber and the Ruby stays guarded. The
   party now has aroused it.
6. **Re-entry after a retreat:** the Statue **attacks the party on entry**, with **no retreat** and **no surprise**, and the fight runs to
   its end (the Statue destroyed, or the party gone).
7. **The Eye of God:** the Statue is powerless. The Ruby is taken **without a fight**, but a member still has to make the attempt.
8. **The Ring** and every other normal fight rule apply to the Statue's attacks (the Ring's protection at level 4 and below, curses,
   Dragon-slayer, Magic Shield and so on).
9. **The Ruby stays guarded wherever it is**, until the Statue has been destroyed once.

## Approach (follows the Ghouls)

The Ghouls of the revised combat are the precedent: a data row (`C_GHOUL`, id 22, in `GHOUL_CREATURES`) that exists only for the
length of one fight, started with `state.strangers = [...]`, `fight`, `phase = "fight"` and `beginRevised`.

- **Creature row:** `C_STATUE` (id 23) in a separate `STATUE_CREATURES` table, so `CREATURES` stays pinned. `fs: 8`, `mp`: see
  open question 1, flag `FLAG_INHUMAN`, never drawn, parked or scored.
- **State:** `statueAroused?: number` (the area coordinate where it was aroused), guarded so a game that never meets the
  Statue keeps its hash (as `rubyFreed` does).
- **Attempt:** in `takeTreasure` for treasure 11 while `!rubyFreed`:
  - revised combat on and Eye held: take the Ruby, `rubyFreed`, `statuePowerless` (as now);
  - revised combat on: start a fight against one `C_STATUE`, surprise 0, with a "this is the Ruby fight" marker so that a win
    takes the Ruby and sets `rubyFreed`, and a retreat sets `statueAroused`;
  - revised combat off (classic): the existing one-wrestler roll, unchanged.
- **Re-entry:** `settleChamber` (next to the `ghoulsPending` branch) starts the same fight when `statueAroused` is this area and
  `!rubyFreed`, with retreat disabled. The Eye of God held on entry means no attack.
- **Destroyed:** a win clears `statueAroused`, sets `rubyFreed`, and the winning party takes the Ruby (a win by a party that has
  members able to carry it; otherwise it is dropped into the pickup as any won treasure).
- **Events / UI:** reuse `fightStarted`, label the foe "Statue" in the fight screen, and add `statueAttacks` / `statueDestroyed`
  events for the log. The existing `statueAroused` event keeps its meaning for the classic path.

## Open questions

1. **Magic strength.** "MAGIC" is confirmed, but not a number. I would use `fs 8, mp 0` marked magical only for the
   rules that read the flag, so that the total stays "strength 8". If Peter means 8 plus a magic value, give me the number.
2. **"Guarded wherever it is."** I read this as: the Statue stays tied to the Ruby until destroyed, and a Ruby cannot be lifted
   away without winning, so the only case is the Ruby still in its own chamber. If a Ruby can reach another chamber unfreed (a
   spill in multiplayer, for example) which chamber does the Statue defend, and does re-entry there attack too?
3. **Multiplayer.** Does one party's retreat arouse the Statue for every party, and does a win by one party free the Ruby for
   all? My default: the state is cave-shared (as `cryptCoord` is) and the first win frees it for everyone.
4. **No retreat on re-entry** can wipe a party that cannot win. That is the ruling, so I will implement it, and the manual will say
   it plainly. Say so if you want a softer rule (for example retreat allowed once surprise is lost).

## Deliverables

- Engine: `data/creatures.ts`, `state.ts`, `reduce.ts` (`takeTreasure`, `settleChamber`, fight end and retreat), `revisedRound.ts`
  (retreat disabled, foe label), selectors if they list "retreat".
- `docs/specs/engine-spec.md`: amend SC-7.3-9, SC-11-26, SC-11-27, SC-11-28, SC-11-37, SC-11-47; add new SC-11-48.. rows; Part II prose;
  Appendix A (new row and state field); Appendix C (test coverage).
- Rules text: `docs/rules/Expanded Consolidated Rules PV2026 V3.md:667` and the copies named in the issue, once Peter confirms.
- Manual (`apps/web/src/manual/`): the treasure and play topics (the Ruby no longer a one-member wrestle; the attempt, retreat, and
  re-entry).
- Tests (`ruby.test.ts`, `wards.test.ts`, `ring-invincibility.test.ts`, a new `ruby-statue-revised.test.ts`): attempt starts a
  fight; win frees; retreat arouses; re-entry attacks with no retreat or surprise; Eye needs an attempt but no fight; Ring at level 4
  and below; leaving the Ruby never fights; classic path unchanged; replay/hash stable for games that never meet it.

## Combat UI and Card Types

We have a mismatch now we are using the Combat UI. The treasure card 'Lost Ruby' doesn't fit well in the combat system,
because it is expecting the party to be fighting a creature.

Peter is producing some artwork that will provide an additional card. This will represent the lost ruby as a treasure,
having defeated the statue.

In order to make this more consistent, create a creature card from the existing 'Lost Ruby' card. Keep the current
treasure card. Add a creature called 'Lost Ruby Statue' with attributes as defined (strength 8). Use that new card
in the combat system. If the party defeats the statue, they then gain the treasure card. Create a treasure card we 
can use as a placeholder, it can simply contain the text 'Lost Ruby' for now, to be replaced with Peter's artwork.

Let me know if you need clarification on any of this? In the original board-game version the players would have used
the one small card dual-purpose, but it works better in the computer version if there are two separate cards.

### Decided and built (2026-11-14)

- **Before the fight** the Ruby is embedded in the Statue's forehead, so it has no card of its own: the chamber floor, the draw display
  and the card panel show the **Lost Ruby Statue** creature card (id 23, the original dual-purpose card art, `small-card-s04-2.png`),
  and the Ruby is taken from that card ("Who takes it?"). The panel's treasure line omits the Ruby. (Only in games with
  `variants.statueFight`; older games keep the Ruby's own card.)
- **After the fight** the Statue card is gone, as for any beaten stranger, and the **Lost Ruby treasure card** appears: a placeholder
  (`small-card-lost-ruby.png`, text "Lost Ruby") until Peter's artwork replaces it. It goes to the member who reached for it.
- The manifest now has creature 23 "Lost Ruby Statue" (reusing the old card file) and treasure 11 pointing at the placeholder.
