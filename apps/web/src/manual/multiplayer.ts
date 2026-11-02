import { p, list, note } from './blocks';
import type { Section } from './types';

// Manual §XII Multiplayer Games. None of these are gated by an option: they are only reachable from multiplayer screens.
export const MULTIPLAYER: Section = {
  id: 'multiplayer', numeral: 'XII', title: 'Multiplayer Games',
  topics: [
    { id: 'mp-overview', title: 'Multiplayer at a glance', brief: 'Up to four parties race the same cave, each from their own browser.', cards: [], screens: ['mp-play'], blocks: [
      p('Up to four parties race the same cave at once, taking turns from their own browsers — first to the richest haul out wins. The cave is **shared**: it grows as everyone explores, and you see the other parties as small coloured tokens on the map where they stand.'),
    ] },
    { id: 'mp-create-join', title: 'Creating and joining a game', brief: 'The host creates a game and shares its four-letter code; others join with it.', cards: [], screens: ['mp-setup'], blocks: [
      list(
        '**Create** a game from the title screen: choose your party name and a colour, and you become the *host*. The game is given a unique **four-letter code**.',
        'Share that code with your friends. Each of them picks **Join Multiplayer Game**, enters the code in their own browser, and chooses a party name and an **unused colour** (colours already taken are greyed out).',
        'Up to **four** players may gather in the lobby. When everyone is ready the **host starts the game** — after that no one new can join (apart from rejoining a party that is already in it).',
      ),
    ] },
    { id: 'mp-options', title: 'Game options', brief: 'The host picks the options in the lobby; they are fixed once the game starts.', cards: [], screens: ['mp-lobby'], blocks: [
      p('Before the game starts the host may switch on any of these in the lobby (everyone else sees them as read-only chips). They are fixed for the whole game once it begins.'),
    ] },
    { id: 'mp-opt-fog', title: 'Fog of war', brief: 'Tiles you have never stood on show only as face-down stubs.', cards: [], screens: ['mp-lobby'], blocks: [
      p('Tiles you have never stood on show only as face-down stubs, so other parties\' discoveries stay hidden until you have been there yourself.'),
    ] },
    { id: 'mp-opt-concurrent', title: 'Concurrent exploration', brief: 'No waiting for turns: every party explores at once.', cards: [], screens: ['mp-lobby'], blocks: [
      p('No waiting for turns: every party explores freely at once. A fight still holds the parties taking part in it.'),
    ] },
    { id: 'mp-draft', title: 'Choosing parties', brief: 'Everyone drafts from one shared pack, in turn.', cards: [], screens: ['mp-draft'], blocks: [
      p('Everyone drafts their party from *one shared pack* of creatures, so the draft is taken in turns — a card another player takes is gone for the rest of you. Once the last player has chosen, the expedition begins.'),
      p('The budget and the creatures work as in a solitaire game: spend up to 6 selection points, and click a creature\'s card to read about it.'),
    ] },
    { id: 'mp-turns', title: 'Turn by turn', brief: 'Act on your turn; the "Now" marker shows whose it is.', cards: [], screens: ['mp-play'], blocks: [
      list(
        'Players take turns in a set order. The **“Now”** marker (in that party\'s colour) always shows whose turn it is; you can only act on **your** turn.',
        'A turn plays out until your party is back at rest — a reaction, picking up treasure, and so on. A fight against strangers is the exception: it is fought **one round per turn**, so other parties act between your rounds.',
        'Secret-door knowledge is personal in a shared cave: you may use a hidden stair only once your party has used it or watched a party standing with you use it — or if you hold the Charmed Flute.',
      ),
    ] },
    { id: 'mp-chat', title: 'Keeping in touch', brief: 'Toasts announce what other parties do; a docked chat lets you talk.', cards: [], screens: ['mp-play'], blocks: [
      list(
        '**Toast messages** slide in to announce what every other party does — defeating or befriending creatures, taking treasure, descending or climbing, and finishing their run.',
        'A docked **chat** (bottom-left) lets the players talk; a red dot on the “Chat” tab marks unread messages, and incoming chat is also mirrored as a toast.',
      ),
    ] },
    { id: 'mp-finish', title: 'When a party finishes', brief: 'A run ends by escaping, being wiped out, or abandoning; the game ends when every party has finished.', cards: [], screens: ['mp-standings'], blocks: [
      p('A party\'s run ends when it **escapes** the cave, is **wiped out**, or the player **abandons** it. The outcome and score are recorded to a separate multiplayer **high-score table** and announced to everyone still below. You are *not* kicked out — you land on the **standings**, and the whole game ends once every party has finished.'),
    ] },
    { id: 'mp-standings', title: 'The standings page', brief: 'A live scoreboard of every party, with ways to watch the cave.', cards: [], screens: ['mp-standings'], blocks: [
      p('A live scoreboard ranks every party by score, showing finished parties\' outcomes and the live depth, turns, enemies slain and running score of those still exploring. From it you can:'),
      list(
        '**Dip into the cave** — drop into a free-roaming, read-only view to watch the action.',
        '**Follow a party** — click any row to see *exactly* what that player sees, until you go back to the standings.',
        '**My run** — review your own party\'s final score breakdown.',
        '**Leave to menu** — your party stays in the game; you can rejoin later with the code.',
      ),
    ] },
    { id: 'mp-leave-vs-abandon', title: 'Leaving or abandoning', brief: 'Leaving keeps your party in the game; abandoning forsakes it to the cave.', cards: [], screens: ['mp-play', 'mp-standings'], blocks: [
      p('**Leave to menu** keeps your party in the game — rejoin any time with the code. **Abandon the expedition** forsakes your party to the cave: they do not escape, your final score is tallied, and the others are told. You can only abandon on your turn.'),
    ] },
    { id: 'mp-meeting', title: 'Meeting another party', brief: 'When parties share a tile, an "Also here" strip offers Trade, Attack and Unite.', cards: [], screens: ['mp-play'], blocks: [
      p('Parties share one cave, so they can meet. When another party stands on the same tile as yours, an **Also here** strip names it and offers up to three buttons: **Trade**, **Attack** and **Unite**. Whoever you are dealing with answers from their own browser, so each step has a time limit — if it runs out, the step takes its default and play goes on.'),
    ] },
    { id: 'mp-trade', title: 'Trading', brief: 'Each side picks what it gives; the swap happens all at once or not at all.', cards: [], screens: ['mp-trade'], blocks: [
      p('**Trade** offers the other party an exchange. Each side picks what it *gives* — treasure, artefacts, even members — and both must confirm. The swap happens all at once or not at all: if anything has gone missing or would overload someone\'s carrying capacity, nothing moves and the confirmations are cleared. Either side may *call it off*.'),
      p('An Eye of God passed on in a trade carries no curse. Trade offers wait about a minute.'),
    ] },
    { id: 'mp-pvp', title: 'Fighting another party', brief: 'Attack is greyed out when a fight would not be allowed; rounds alternate between the parties.', cards: [], screens: ['mp-pvp', 'mp-play'], blocks: [
      p('**Attack** is greyed out, with the reason as its tooltip, when a fight would not be allowed: not across the Viper Pit, Deep Pool, Whirlpool or Chasm, not while strangers still stand in the chamber, and not while one of you is already fighting them.'),
      list(
        '**Surprise.** The attacker gets the usual +1 in the first round — unless it followed the defender in, so that both parties came in by the same way.',
        '**Heavy treasure** is thrown down on the tile by *both* sides before the fight, as in any fight. The victor gathers the spoils from the floor.',
        '**The layout.** The defender lines up first, with casters behind only if numbers allow. The attacker then engages — one against one, one against two or two against one, never two against two — and must engage every defender it can. Last, the defender assigns any background casters to the engagements, and the round is fought.',
        '**The round** uses the same arithmetic as a fight against strangers. The strongest of each losing group falls, and the Ring protects its bearer as ever. The fallen\'s belongings are spilled for the eventual victor. A party reduced to nothing is out of the game.',
        '**Rounds alternate** between the two parties\' turns. Either side may **retreat**: it leaves its dropped treasure behind and gets two turns to get clear. Both sides may also agree to **stop**, and each takes back its own dropped treasure. A stage nobody answers within about 45 seconds takes its default rather than stalling the game.',
      ),
    ] },
    { id: 'mp-union', title: 'Unions', brief: 'Unite proposes that another party march under your command.', cards: [], screens: ['mp-union'], blocks: [
      p('**Unite** proposes that another party march with yours *under your command*; they have about a minute to accept. A united party joins its members into the commander\'s band: each non-commander **forfeits one turn** to join, and while united they take no turns of their own — the commander plays for the whole force, including in a fight against another party, where the strongest of the union must face the strongest of the enemy.'),
      p('A union ends when the commander chooses **Dissolve** or a member picks **Leave union**. Allies the union has won together are then divided by agreement: every former member must name the same new home for each ally, and a split vote leaves the ally neutral, behind where the union broke up. If a union fells the Sorcerer, the 30-point bounty is shared equally among its seats.'),
    ] },
  ],
};
