# Wielding Weapons

We want to now implement the requirement that players must *wield* rather than carry weapons to be able to use
their benefits in combat. We already have a mechanism in place for selecting whether a weapon is wielded or 
carried.

Here are the rules I'd like implementing:

1. When a weapon is picked up it should be carried rather than wielded.
2. Each party member has two hands, left and right, that are able to carry weapons. 
3. Attacking weapons can only be wielded individually. This is explicitly in the rules for the Magic Axe, but
   applies to all attacking weapons.
4. A player may wield the Magic Shield and an attacking weapon at the same time.
5. The weapon bonus only applies in combat if the weapon is wielded.

## Answers:

1. The Magic Staff is the only other wielded weapon.
2. The Ring and Talisman will need a separate state of 'Worn' rather than 'Wielded'. They can be worn in addition
   to the wielded weapons.
3. The Eye of God works just by being carried.
4. No automatic wielding. The party should be prepared before a fight.
5. Strangers are fine as is
6. Don't worry about saved games, but testing needs to reflect these new requirements.
7. No weapons are lost with the fallen holder. Treat all weapons as carried in this regard.