// The tutorial's opening demo (Peter's step 1): the first part of the best searched kit game (K001), played through with captions.
// The captions name the frame (move number) they appear at and stay up until the next one. goldenGame.test checks the game still replays;
// demo.test.ts checks the captions still fit it.
export const DEMO_CODE = 'K001';
export const DEMO_FRAMES = 24;

export const DEMO_CAPTIONS: Record<number, string> = {
  0: 'A game in progress. The party stands at the Gateway. The aim: explore the cave, gather treasure, and bring the party back out alive.',
  1: 'Each move reveals a new area, laid face down as it is found. This one is a tunnel.',
  2: 'A chamber, and strangers in it: here, a Woman.',
  3: 'Strangers may be friendly, indifferent or hostile. The party tests her reaction: indifferent, so she neither joins nor fights.',
  11: 'Stairs lead down to deeper levels. Deeper means more cards, more danger, and more treasure.',
  15: 'A Troll guarding silver and gems: too strong for this party to fight just yet...',
  16: '...so the party withdraws, back the way it came.',
  21: 'A friendly reaction: the Priest, the Hero and the Thief join the party.',
  23: 'Treasure is carried by members of the party. Whatever they bring out alive counts towards the score.',
  24: 'That is a game in progress. Now you will play one yourself.',
};
