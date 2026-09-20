
## Bug Report: 2026-09-16-demon-surprise

### Game Code: *SSNT*

### DateTimeStamp: *20260916T1657*

### Scenario Description

A party of 2 Wizards and 2 Priests scout a chamber and draw a Demon. The party backtrack one area to the previous chamber and surprise attack the Demon.

### Scenario Saved As Code: *WWZC*

### Scenario Comments

Saved after drawing the Demon but before backtracking.

### Expected Outcome

The party backtrack towards the area containing the Demon, and have the standard options on scouting an area containing a creature that has not previously been approached: They can test its reaction, attack or withdraw.

### Pass/Fail: *Fail*

### Test Outcome

The Demon surprise attacks the party. The strangers surprised you -1 this round

### Tester Comments

I previously suspected that the issue may lie with the fact that I was causing the Demon to appear in a tunnel - so I resolved here to make the Demon appear in a chamber. It makes no difference, the Demon just surprise-attacks you regardless of which type of area it appears in.

## Resolution (2026-09-17)

**Duplicate of an already-confirmed, deliberate design decision — no change.** This is the same
complaint as `docs/requirements/bug-fixes/2026-08-05-demon.md` (Scenario 20260804-YYBQ-01), which
was investigated and resolved on 2026-08-05: "Confirmed with the designer: the instant ambush is
the correct, original, deliberate design; no engine change made."

A drawn Demon relocates into `state.prev` (the area the party just came from) instead of the
chamber it was drawn in (`chamber.ts`'s `classify`/`spawnDemon`), then forces an immediate, no
reaction-test fight with the strangers holding surprise (`surprise: -1`) the instant the party
(re-)enters or withdraws into that area, uniformly across every entry path — chamber, tunnel,
Deep Pool, Viper Pit (`reduce.ts`'s `ambushIfDemon`; design doc
`docs/requirements/extension-kit/2026-07-26-engine-integration-design.md`, US-13; spec
SC-EXT-21). This is why the tester's tunnel-vs-chamber test made no difference: the ambush is
deliberately uniform regardless of area type.

Verified current behaviour matches this design and is test-covered:
`kit-apprentice-demon.test.ts` › "forces the ambush when the party WITHDRAWS back into a
Demon-holding area" (and 7 sibling ambush tests) — all passing, no regression.

No engine or spec change made. Filing note for future reports: this mechanic (Demon forces an
instant ambush with surprise against the party on backtrack, no Withdraw/Attack/Test menu) is
intended and has now been independently reported and confirmed twice (2026-08-05, 2026-09-16).

