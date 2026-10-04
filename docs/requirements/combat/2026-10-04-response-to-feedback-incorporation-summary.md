# Incorporating Peter's Response to Feedback (03-OCT-2026)

`DATE: 04-OCT-2026`
`SOURCES: [response-to-feedback-20261003.md](../../rules/response-to-feedback-20261003.md), [strangers-default-loadout-v2-20261003.md](../../rules/strangers-default-loadout-v2-20261003.md), Consolidated-Rules-20260925-2.pdf`
`UPDATED: [2026-10-03-combat-revision-technical-spec.md](2026-10-03-combat-revision-technical-spec.md), [2026-10-03b-neural-net-stranger-pairing-feasibility.md](2026-10-03b-neural-net-stranger-pairing-feasibility.md)`

This summarises what changed in the combat plans after Peter's response. Nothing here is committed, and no engine code has changed.

## Decision made: Sorcerer house rule is an Addendum

The Sorcerer using artefacts as a Wizard is a **house rule**, not in the original rules. Peter asked whether to change the Consolidated Rules text or add an Addendum. **Mark decided on 04-OCT-2026: Addendum**, referenced from the main text where relevant (Q-L7, now answered). It is recorded as note #4 in `Expanded Consolidated Rules PV2026 V2.md`, marked as not original, with references from the Sorcerer, Magic Staff and The Ring entries and from the "Artefacts – who can use?" table.

## What Peter's response settles

| Item | Answer | Effect |
|---|---|---|
| **Eye of God (Q-L5)** | Always on in the area it is in, held or lying on the floor, for both sides | The engine only counts an Eye held by the party, so a floor Eye does nothing today |
| **Thief and Woman (Q-L1)** | Woman now ranks above Thief, because the Unicorn rule makes her ability useful to strangers. The Thief uses artefacts as a Man, so it can use Sword, Axe and Shield | Preference lists reordered |
| **Staff and other classes (Q-L2)** | Witch and Scholar count as a Priest, Apprentice as a Wizard, Sorcerer as a Wizard (house rule, Addendum note #4) | One capability table |
| **Wording (Q-L3, Q-L4)** | "Weapon" is gone. The Axe goes to creatures "not bearing Magic Sword"; the Shield to those "bearing either Sword or Axe". A creature's adjusted strength for the Ring is its strength plus any Sword, Axe or Staff bonus | Loadout table and test vectors re-derived |
| **Strengths (D1, D2)** | Hero 5, Spectre 5 (MAG 5) | The engine already matches, so nothing changes |

## Peter's suspected bug is real

Artefact cards predate the Thief, Witch, Scholar and Apprentice, so who may use an artefact has to be read from the creature card too ("uses artefacts as…", "has all the capabilities of…"). The engine does not do this consistently:

- The Sword and Axe bonuses, the Shield ward and the Spectre-with-Sword check all test creature ids `[0, 1, 5, 6]`. A **Thief gets no bonus and an inert Shield**.
- The Staff bonus covers only creature 4 (+1) and creature 8 (+2), so the **Witch, Scholar, Apprentice and Sorcerer get nothing**.
- `usesArtifactsAs` already exists and is used for the non-fight artefacts, but not in the strength code.

Fixing this changes fight results for Thief, Witch, Scholar and Apprentice parties. The spec therefore applies it only when `combatRevision` is on, so existing golden snapshots are untouched. Whether to fix the legacy path as well is left open.

## Edits made

**Technical spec**
- New section on capability resolution ("uses artefacts as"), with file:line references to the engine code above.
- New section on the area-wide Eye.
- Loadout table now follows V2 of the default loadout.
- Loadout test vectors (Appendix C) re-derived; V11 to V15 are new: Thief as Man, Witch and Scholar, Apprentice, a floor Eye, and Woman-Hero.
- Register: 45 items, 8 answered (Q-L1 to Q-L5, Q-L7, D1, D2), 37 open. New items Q-L7 (since answered) and Q-L8.
- New improvements I13 (one capability table) and I14 (Eye present in the party or on the area floor).
- M0 scope and the risk row updated.

**Feasibility doc**
- The loadout file reference now points to V2.
- Notes added on the area-wide Eye and on "uses artefacts as".
- The odds tables already used the same eligibility sets, so their figures stand.

## Still open from the loadout

- **Q-L6:** what triggers the loadout, and whether "creature in the party" in Step 5 means the stranger party.
- **D3:** the Staff card says +2 for a Priest or Wizard; the engine gives the Priest +1. Peter's response does not address it.
- **Q-L8:** the Woman-Hero's card says "all the capabilities of a woman and a hero". The proposed reading is the union of the two.

One transcription point for Peter: V2 of the loadout reads "Man already not bearing…" at Shield item 8. The spec reads it as "Man not bearing…".
