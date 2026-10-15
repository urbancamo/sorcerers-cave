# Notes for Peter: your 14 October rules against the game

```
DATE: 15-OCT-2026
FOR: Peter
RE: "Fighting Rules Reformulated (Draft 20261014)" compared with the new combat engine
STATUS: Three changes made (the chest Spectre, the Scroll, the Ghouls). The rest are listed below, not yet built.
```

I read your 14 October draft and compared each passage you marked in blue with the new (revised) combat engine. This
note says what already matches, what I changed, what is still different, and two questions for you.

The old combat is untouched throughout. Nothing in the live game switches the new combat on yet, so players cannot reach
any of this.

## Already matching your draft

- **Stalemate.** A match is a stalemate when neither side can beat the other on any roll.
- **Ending a fight.** The fight is over when no creature can continue a match, be deployed to make a new one, or be
  deployed to break a stalemate.
- **Curses in the roll.** The party's current curse penalty is taken off its die result.
- **Quarrel.** No change needed. The Ring and curse bonus applies to both fighters equally, so it never changes who wins,
  and your "no Ring, curse or surprise bonuses" rule already holds in effect.

## Changed today

**The chest Spectre now fights for one round only.** Your draft says the fight "ends automatically after one round" and the
Spectre gets no surprise bonus (no surprise was already built).

- After that round, if the Spectre is still standing, it vanishes and the party carries on.
- Anyone killed in that round stays dead.
- Before this change the fight ran on like any other.

**Your ruling needed (answered provisionally):** your draft does not say what happens to a Spectre that survives the
round. I chose "it vanishes", which fits the old wording that it "appears and attacks". The alternative is that it stays in
the area as an ordinary stranger and the party meets it again if they linger or come back. If you prefer that, say so and
I will change it.

**The Scroll is now a step of each round in the new combat**, following your Step b and your ring-bearer clarification of
15 October.

- It is offered only to a player party that is the attacker, carries the Scroll with a human present, with no Eye, and
  not in an area where it has already been used.
- It can destroy every stranger without innate magical power. A non-magic Ring-bearer on level 4 or deeper is destroyed
  like the rest and drops the Ring. The Sibyl is never destroyed. What the destroyed carried falls to the floor.
- In round 1 the attacker can instead add 1 to its surprise bonus.
- Either way the attacker is cursed. The Scroll is not used up, but cannot be used again in the same area.
- If nobody is left the party has won (a round with no matches); a caster that survives is fought as usual.
- Strangers never read it, and the standard party in our tests always declines it, because it costs a curse.
- Reading it any other way is closed in the new combat. The old combat is unchanged.

**The Ghouls are now a stranger party of their own in the new combat**, following your "Ghouls Fight" procedure.

- When a party enters a chamber with the Ghouls, there is one Ghoul (strength 2, no magic) for each creature in the party,
  and the fight uses the full round procedure. There is no surprise for either side; the Ring bonus and the curse penalty
  apply as usual. The Talisman still turns them away.
- Heavy treasure is dropped to the floor for the fight, as in any other fight.
- The Ghouls are persistent. Whether they are beaten, the party retreats, or the party dies, they stay in the chamber and
  attack the next party that comes in.
- Any ordinary strangers in the same chamber wait behind the Ghouls. Once the Ghouls are beaten the party deals with them
  in the usual way (reaction roll, or a fight if they attack on sight). If the party retreats, those strangers stay where
  they were.
- The old one-roll-per-member Ghouls resolution is kept for the old combat only.

**A small departure from the fixed hazard order:** the Ghouls are fought after the chamber's other hazards (Mutiny, Trap
and so on), straight before its strangers, not between Medusa and Mutiny. If Mutiny thins the party first, there are
fewer Ghouls. A party that falls through a trap never meets them. Please say if you want the original order kept.

## Still different from your draft (not yet built)

Roughly smallest to largest.

1. **The Scroll: now built for the new combat** (see below). The old combat still reads it the old way.
2. **Turncoat Apprentice.** Today the Apprentice turns into a stranger the moment the Sorcerer is slain, and the fight
   that follows has no surprise. Your draft says she joins the other strangers only if the party does not leave in its next
   turn, and then they attack with surprise. That needs a "stay or leave" step the game does not have.
3. **Ghouls: now built for the new combat** (see above). The old combat still uses one roll per member.
4. **Stranger preparation.** Your draft says all artefacts are assumed to be on the floor, guarded by the strangers, before
   they choose loadouts. I believe this is already how it works, but I have not traced it line by line.

## Where the draft still leaves things open

- **Who attacks in the chest Spectre fight?** Your draft gives it no surprise bonus but does not name the attacker.
  The game has the party as the attacker. Please confirm.
- **The deployment rule for strangers (the "dumb deployment", Q9)** is not in this draft. The "work in progress" section is
  empty, so the placeholder in the game stays until you provide one.

## What I did not do

- I made the chest Spectre, Scroll and Ghouls changes, with tests. All of the engine tests pass (1336), as do the web tests (784).
- Nothing in the web game shows the Scroll choice yet. The new combat is not reachable by players, and the choice will
  come with the formation screen.
- The turncoat Apprentice item above is not started. It will be built for the new combat only, leaving the old combat as
  it is.
- The rules as converted into the project: `docs/rules/fighting-rules-reformulated-20261014.md` (your wording, with the
  changed passages marked).
