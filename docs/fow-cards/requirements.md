In this directory are cards that solely represent dead-ends. We are to use these instead of 
flipping an area card when discovering a dead end. The flipping effect should be replaced
with a fade transition from the briefly displayed area card to one of these cards.

Integrate these card images into the assets directory in a suitable place and add them to
the index. The cards will need to be rotated 90 degrees counter-clockwise.
The card name contains the location of the dead ends.

Additional requirements (agreed 2026-10-23):

1. The 'stub' on the fog card should always be in the doorway that the party attempted to
   move into when discovering a dead end. (The stub is on the side of the fog card that faces
   the party: a failed move north puts it on the card's south edge. It is not taken from the
   dead-end card's own printed doorways.)

2. If the party subsequently attempts to access the fog-of-war area location and encounters
   another dead end, the fog card displayed should include the correct stubs for both
   directions attempted (one stub per side tried; the new card fades in over the old one).

3. When the party does subsequently enter the fog-of-war area tile from a valid direction,
   it should fade into the actual area tile at that location (instead of flipping).

4. When the Sibyl peeks at a fog-of-war tile (Peter's wish), the transition is a fade in and
   out, not a flip: the fog card fades to the real card, holds, and fades back to the fog
   card. The tile is framed in the same violet glow as the Sibyl's top-of-the-pack peek card,
   and follows the same timing (3.4 s: in over the first fifth, held to 70%, out by the end).

Implementation notes:

- There is no fog card for three stubs, or for none (e.g. a Spell-remapped tile nobody has
  tried a doorway into); those use the plain fog card, which has no stubs (ALL-FOG).
