/**
 * The story characters: who the creatures are as people, for the writer. EDIT THE WORDING HERE.
 *
 * Characters are by CLASS (a Dwarf, a Priest), not by card face, so any Dwarf in any game can be any of the names. Each class has a
 * general line (always given), a pool of names, and pools of habits, worries, wants and strengths to pick from. The classes that can
 * start a party also have `explorer` options: why they went down, from the point of view of someone setting out. The code assigns
 * names (so two Dwarfs are different people, and the same game keeps the same names when rewritten); the planner picks a few items
 * from the pools for the people who matter, and the writer and editor follow the plan.
 *
 * Everything here is colour for who the record says was there. None of it is a source of events.
 */
import { mentions } from "./storyBible";

export interface Character {
  general: string;
  names: string[];
  habits: string[];
  worries: string[];
  wants: string[];
  strengths: string[];
  /** Small comic habits that surface under pressure (dry, never at someone's expense); optional, and used sparingly. */
  quirks?: string[];
  /** Fears, phobias and psychological flaws, often ironic for the class (the elephant afraid of the mouse); used for depth or, lightly, for humour. */
  flaws?: string[];
  /** Why they went down, as an explorer; only for classes that can start a party. */
  explorer?: string[];
}
export interface Pairing { a: string; b: string; text: string }
export interface CharacterBundle { header: string; characters: [string, Character][]; pairings: Pairing[] }

export const CHARACTERS_HEADER = `THE PEOPLE, for colour and for the beginning. The names below are fixed for this story: use them, and never give a creature \
another name. Use a person's general line and a pick or two of their habits, worries and wants to make them someone before the cave \
and someone after it. Choose few and make them count: a person is better for one worry shown three times than for six mentioned once. \
Nothing here happened in the cave unless the record says it did; this is who they were when they went in. Where two people in the \
party have a pairing below, a line of it is enough to show how they stand with each other.`;

const C = (general: string, names: string, habits: string, worries: string, wants: string, strengths: string, explorer?: string): Character => ({
  general,
  names: names.split("|").map((s) => s.trim()),
  habits: habits.split("|").map((s) => s.trim()),
  worries: worries.split("|").map((s) => s.trim()),
  wants: wants.split("|").map((s) => s.trim()),
  strengths: strengths.split("|").map((s) => s.trim()),
  ...(explorer ? { explorer: explorer.split("|").map((s) => s.trim()) } : {}),
});

export const CHARACTERS: Record<string, Character> = {
  "Hero": C(
    "A seasoned adventurer past the first flush of youth, steady in a crisis, whom strangers and animals trust without knowing why. Speaks little and plainly.",
    "Corin Vale | Aldric Rooke | Maren Hale | Tobias Wren | Edric Lowe | Joss Harrow | Ansel Thorne | Rowan Pike",
    "mends their own gear at night | counts the party twice before sleeping | talks to animals as if they were people | keeps a notched stick for each job finished | eats last",
    "that the name is bigger than the person | that someone will follow them into something they cannot get them out of | being found out as ordinary | growing old without anything to show for it",
    "one great find to set on a table and say this is what the years came to | to be asked to stay somewhere | to pass the work on to someone worth it | to be trusted for who they are and not for the name",
    "calm that spreads | a good eye for a person | never leaves anyone behind | knows when not to draw a blade",
    "twenty years of guarding caravans and nothing to show for it | a debt to a name that was lent on credit | the last big job before the knees give out | a promise made to a dying friend to see the cave"),
  "W-Hero": C(
    "A woman hero, the equal of any in nerve, quick to read a room and to act. Dry in her humour and slow to praise; strangers warm to her at once. The record calls her 'W-Hero'; the story says 'the heroine' or uses her name.",
    "Isolde Marr | Brenna Kestrel | Thea Rook | Maud Ashgrove | Sabine Orlo | Hester Vane | Wynne Calloway | Odile Frost",
    "checks the exits first in any room | hums when she is afraid and does not know it | sharpens a knife she never uses | names every horse she rides | refuses to be thanked",
    "that being the capable one means nobody asks if she is tired | being the reason someone else is hurt | a family that has stopped writing | that she will never be anything but useful",
    "a hearth of her own, once | to be beaten at something by someone she respects | to prove it was the cave and not her | to bring back proof for a sister who said she would not",
    "reads fear in others and steadies it | the nerve to go first | fair in a quarrel | does not hold a grudge past the doorway",
    "left a guard captain's post because she would not take an order she thought wrong | following a brother who went down and did not come up | wagered her savings on this and will not go home empty-handed | cannot stand to be asked to wait"),
  "Ogre": C(
    "Huge, slow to anger and slower to be understood, with a back that carries what would break anyone else. Says little, and means all of it. Once won over, the most dependable thing in a party.",
    "Grum | Brod | Hulk the Quiet | Mogg | Thrask | Old Bors | Dunk | Gorrim",
    "hums one low note when thinking | picks up other people's dropped things without being asked | arranges stones in rows | will not step on anything alive | eats slowly and stares at a fire",
    "being thought stupid because he speaks slowly | breaking something small by mistake | being the cause of a fight | being left behind because of his size",
    "to be asked for his opinion | a roof he does not have to stoop under | someone to say his name twice | to be of use and thanked once",
    "carries what no one else can | immovable in a doorway | gentle with the small | does not forget a kindness",
    "paid in food to carry another person's bags down | thrown out of a village for being large and went to find where large things were wanted | follows a voice that spoke kindly once | does not know why he came and does not mind"),
  "Troll": C(
    "Broad and stony-skinned, stolid and sullen on first meeting, with a dry sense of humour that takes an hour to show. Hard to move; loyal once it has chosen a side.",
    "Gravel | Stonk | Mud | Brakka | Tolm | Old Gneiss | Skarn | Rudge",
    "grumbles in a low voice at the same pace as walking | knocks twice on any wall | refuses to sleep in the open | keeps one pebble he calls his luck | stops dead when he has made up his mind",
    "the sun, in a vague way | being laughed at | being owed and not paid | losing the one who spoke to him first",
    "to be the last one standing | a cellar to himself | a story told about him that is true | a quiet job, well done",
    "does not tire | never retreats | honest to a fault | sees in the dark",
    "was hired for his bulk and stayed for the company | wanted to see whether the stories about the cave's trolls were true | has a quarrel with one of the cave's dwellers from long ago | a cold winter and not enough to eat"),
  "Priest": C(
    "Robed, quiet and steadier at the back of a line than the front. Brings prayer and a little power; fragile in a fight and often the one who sees what it costs. Counts people as other people count coin.",
    "Brother Anselm | Sister Ula | Father Cadoc | Brother Perrin | Sister Maelis | Father Osric | Brother Tam | Sister Iris",
    "says grace over every meal, even bad ones | touches each person on the shoulder once at night | writes names in a small book | stops to bury what the others leave | has a cough that comes in the cold",
    "that his faith is more habit than belief | that he blessed someone who died | being asked a question he cannot answer | the cold below",
    "to hear his prayer answered once | to be needed rather than tolerated | to put the dead somewhere that is not a floor | to find out whether the cave has any god in it",
    "calm near the dying | counts and remembers everyone | listens | hard to frighten once the worst has happened",
    "sent by an abbot who wanted to know what lay below the old workings | a vow to bring back what a drowned parish had lost | left a post where nobody listened to him | cannot say why, and thinks that may be the reason"),
  "Man": C(
    "An ordinary man: neither brave nor craven by nature, which is what makes him matter. Tired in the way that people are when they have walked a long way carrying something, and ready to follow anyone who asks him a straight question. Give him no bodily trait of your own invention.",
    "Wat | Piers | Dunstan | Hob | Ned | Garth | Silas | Ellis",
    "whistles through his teeth | folds a cloth before he sits | pats his pockets for something not there | says 'well' before every sentence | cannot sleep without his boots on",
    "debts at home | being asked to do something brave and doing it badly | the dark, once he is alone in it | going home and having nothing to say",
    "just to finish the job and be paid | to be asked what he thinks, once | to be thought well of by one person | a bed that is his",
    "does what he is asked | surprisingly fair when he is given the chance | notices small things | keeps going",
    "owes money to a man he does not like | a farm that would not feed him | followed his brother here and lost him | was out of work and the notice said six silver"),
  "Woman": C(
    "A capable ordinary woman, practical and unsentimental, who has run a household or a business and does not need to be impressed. Unicorns will come to her.",
    "Agnes | Bess | Maud | Tilda | Joan | Nell | Cecily | Alys",
    "counts supplies aloud | ties her hair back before any hard thing | hands out food without comment | cuts bread in even pieces | keeps a list in her head of who is owed what",
    "that someone at home is relying on the money | being the one who must decide | being underestimated, and being right about it | the children's faces when she is gone",
    "to bring back enough to pay what is owed | to be taken seriously by someone who has not taken her so | a quiet room | to see one unicorn and not tell anyone",
    "keeps a party fed and in order | blunt in a way that clears the air | cool in a crisis | can drive a bargain",
    "widowed and in debt, and the work was down the stair | hired to cook and cannot say no to a job | a daughter's dowry | curious, and the first to admit it"),
  "Dwarf": C(
    "Small, stubborn, and in his element underground: he knows how stone is laid and reads a floor for a trap. A hard bargain-driver, and a man whose pride is his trade. Losing the one who knows the way is felt.",
    "Brann | Thorgil | Durin Flint | Hjalmar | Orri | Gimle | Bofur | Nori",
    "taps every wall with a knuckle | names the stone he stands on | refuses to eat cold food on a descent | drives a hard bargain over trifles | keeps a ledger of favours",
    "being underpaid | a ceiling he cannot trust | being the smallest one in the room and ignored | the day his hands stop being steady",
    "to be paid in full and say so | to find a vein no one else has | to be thought the best at what he does | a hearth in the mountains again",
    "reads stone | sees a trap before he is on it | never lost underground | hard bargain, honest deal",
    "heard of a gold chamber nobody could map and wanted to be the one who did | paid by a guild to survey the lower floors | a rival who said he could not do it | owes his master a debt of work"),
  "Wizard": C(
    "Gaunt and dry, wary of rivals, with power held in a staff or a gesture. Carries what others cannot, and is rarely a friend to a Sorcerer.",
    "Ostrander | Maleth | Vellum | Quillon | Aurelian Grey | Sethis | Brome | Hollis",
    "speaks as if every sentence cost him | consults an old book at the wrong moment | stands with a staff like a post | glances at doors | pauses before answering anything",
    "being outshone | being found out | something that has no body | the Sorcerer",
    "to keep what he guards | a worthy pupil, one day | to be left alone | to be thanked and be unable to say it",
    "power in a staff | patience | a long memory | dry, deadly wit",
    ""),
  "Spectre": C(
    "A cold thing with no body, felt before it is seen. Steel does nothing to it, and the party's fear of it is out of proportion to anything it does.",
    "the Grey One | the Cold One | the Whisperer | the Pale One",
    "appears in a draught | speaks in a whisper that seems to come from the wall | lingers near the dying | drifts rather than walks",
    "being forgotten | being walked through | the daylight",
    "to be remembered | company, though it will not say so | to be let go",
    "cannot be struck | does not tire | unafraid",
    ""),
  "Dragon": C(
    "The old hoard-keeper: vast, slow to turn, smelling of scorched stone, sleeping lightly on what it guards. Killing one is the kind of thing a party remembers for the rest of its life.",
    "Skaldrath | Vorn | Ember-of-the-Deep | Old Karn | Ashmaw",
    "turns once in its sleep, and the floor shakes | counts its hoard in its dreams | breathes slowly | one eye half open",
    "being robbed | being woken | the loss of one coin it cannot account for",
    "to sleep | to keep what is its own | to be left alone",
    "armoured scale | heat | terrible patience",
    ""),
  "Sorcerer": C(
    "The master of the cave, still and patient, wrapped in gems and old magic. While he lives, curses laid on a party hold; his death lifts them.",
    "Mordain | Vexil | the Warden | Ulthar | Kesh | Aldous Grey",
    "speaks to the empty air | turns a ring on one finger | never raises his voice | collects what others lose",
    "being alone with what he has made | the day someone bests him | the dark that is not his",
    "to be understood | to be obeyed | to be brought something beautiful",
    "old magic | patience | a gift for silence",
    ""),
  "Giant": C(
    "The strongest thing in the cave and mostly good-natured about it, slow-spoken, able to carry more than anyone and to wade where others cannot. A Giant in the party changes how a fight feels.",
    "Hrungnir | Bolg | Old Tor | Gaunt | Big Wend | Ulf the Slow | Jorun | Magnus Ash",
    "ducks under every doorway out of habit | speaks slowly and checks he has been understood | carries small things in a large hand | laughs late and loudly | sits down gently",
    "stepping on someone | being feared on sight | being the reason a floor gives way | loneliness at a height",
    "to be gentle and have it noticed | to find another of his kind | a roof of his own height | to carry something that matters",
    "carries more than anyone | wades where others cannot | calm | patient",
    ""),
  "Unicorn": C(
    "Pale and shy, and it comes only to women and heroines. Its joining is a rare grace, and the party that has it knows it.",
    "Silverbrook | Moonmane | Lily | the Pale Horse | Wisp",
    "stands at the edge of the lamplight | watches before it comes | lowers its head to one person only | startles at sudden sound",
    "being hunted | loud voices | being unnoticed",
    "to be trusted | a quiet field | to follow one who is gentle",
    "grace | stillness | an uncanny calm",
    ""),
  "Apprentice": C(
    "A nervous young caster with more talent than judgement; his power frightens him as much as his enemies.",
    "Pip | Wick | Tam Quill | Little Orrin | Fenn | Dill",
    "chews his sleeve | mutters spells under his breath | checks his hands | reads aloud from a book while walking",
    "his own power | disappointing his master | getting a spell wrong at the wrong time",
    "to be told he did well | to finish his training | to be allowed to be afraid",
    "talent | quickness | a good heart",
    ""),
  "Demon": C(
    "Not of this world, unhurried and wrong in the way it moves. Ordinary weapons do not trouble it; only certain things can stand against it.",
    "Azrak | the Smiling One | Vael | Mor | the Tall Dark",
    "smiles at the wrong moment | moves without making sound | speaks politely | keeps perfectly still",
    "being sent back | the light | being named",
    "to be bargained with | to be amused | to be let out",
    "fear itself | cannot be harmed by ordinary weapons | patience",
    ""),
  "Lion": C(
    "Tawny, wary, a great cat that has chosen to walk with people and does not quarrel. It sees in the dark and settles near the one it trusts.",
    "Sol | Amber | Kesari | Old Gold | Tawny | Marrow",
    "lies across the doorway at night | studies a stranger a long time before approaching | leans on the one it trusts | yawns at danger and watches it",
    "being chained | the smell of smoke | being left behind",
    "to be near a warm back | a quiet place to sleep | one hand that does not shake",
    "sees in the dark | moves silently | fierce when it must be",
    "chose the one who stood still and did not reach for it | was alone in a side chamber and tired of it | followed a smell of cooking"),
  "Scholar": C(
    "Bookish and curious, more at home reading an inscription than holding a line. Fascinated by the cave in a way the others are not.",
    "Master Ivo | Doctor Pell | Lucan Ashby | Perpetua | Cyril Wend | Magister Hale",
    "reads a wall aloud whether or not anyone asks | carries a candle stub in his sleeve | forgets to eat | corrects a date mid-story | writes in the dark by feel",
    "dying before he finishes a book | being proved wrong in public | a fire in the library | being useful only for his reading",
    "to be the one who reads the last inscription | to publish what he finds | to be listened to | to be thought brave once",
    "reads old script | patience | memory | cheerful in the face of danger",
    "wanted to see the writing on the cave's walls with his own eyes | a stipend that ran out | a rival who said the cave had no inscriptions | a legend he could not leave alone"),
  "Witch": C(
    "Sharp-eyed and unsentimental, with fierce magic and no patience for fools. A useful ally and an uneasy one.",
    "Hazel Crow | Morwen | Ysolde | Old Nan | Grizel | Tansy Blythe",
    "hums a counting rhyme | collects small bones | never turns her back on a door | spits on a good luck coin | talks to her own hands",
    "being cheated | being blamed for what she did not do | the day her power fails | being thought a fool",
    "to be paid in full | to be left alone | to have one friend who does not flinch | to find the thing that makes the cave worth it",
    "fierce magic | cunning | reads a liar | holds a grudge and a bargain",
    "was paid, and the pay was good | a long quarrel with someone in the cave | wanted to see what the cave kept | fled a village that had decided what she was"),
  "Thief": C(
    "Quick-handed and watchful, a person who looks at what others carry. May lift one thing from a stranger who has not noticed, and the stranger turns hostile when they do.",
    "Fenn | Jack Quick | Nan Weasel | Sparrow | Rook | Kit Dobbs | Pell | Lark",
    "counts other people's pockets | knows where every exit is without looking | returns a thing they have taken, once in a while | sleeps with one eye open | tells small lies for no reason",
    "being caught | being trusted and betraying it | the rope | an empty pocket",
    "one last job, and out | to be thought honest by someone | to buy a place and a name | to be forgiven",
    "quick hands | quiet feet | reads people | knows when to run",
    "the one job left that would let them stop | owed a favour to someone who does not forget | heard the cave kept more than it could ever count | cannot resist a lock"),
  "Wolf": C(
    "Lean, silent and hard to fool; keeps close to the edge of the light. Immune to the cave's cruelest tricks (the Medusa's gaze, mutiny).",
    "Grey | Ash | Shadow | Hollow | Pale | Flint",
    "sits at the edge of the firelight | watches the dark | listens rather than looks | falls asleep last",
    "being penned | the sound of a trap | being the last of its kind",
    "a pack | a trail | one person who does not raise a hand",
    "senses danger | cannot be fooled | loyal once it has chosen",
    "followed a scent and a voice | lost its own pack | chose the one who sat down on the floor"),
  "Sibyl": C(
    "A seer, calm and unreadable, who has already seen how it ends and says little of it.",
    "the Sibyl | Cassia | Pythe | Old Tamsin | Auria",
    "looks at a person a moment too long | speaks of the future in the past tense | does not blink often | turns away before a question is finished",
    "being asked | being wrong | a thing she has seen and will not say",
    "to be left alone | to see one thing she did not expect | to be asked a better question",
    "sees clearly | calm | patient",
    ""),
  "Ghoul": C(
    "A thing that feeds on the dead, shambling and patient. Wards keep it off; nothing else does for long.",
    "the Gnawer | Fetch | the Hungry | Rot",
    "waits in the dark | shuffles in step | sniffs the air | follows at a distance",
    "light | wards | being alone",
    "to be fed | to be left alone",
    "patience | does not tire",
    ""),
};

/** Funny habits by class: small, dry, character-driven, and never at the expense of a loss. Merged into CHARACTERS below. */
const QUIRKS: Record<string, string> = {
  "Hero": "is unfailingly polite to things that are trying to kill them | gives every river a short talk before crossing it | has a speech for strangers that has not changed in twenty years | apologises to doors they have to kick",
  "W-Hero": "keeps a running score of who is wrong about the route, and it is never her | answers a compliment with a complaint about the weather | is the only one who has ever won an argument with the dwarf",
  "Ogre": "apologises to every doorway as he ducks it | carries a small stone and consults it as if it were a map | nods gravely at everything, including the weather | is startled every time he hears his own name said kindly",
  "Troll": "treats every cheerful remark as a personal insult, and is quietly pleased | announces that he is not impressed, about everything | is very good at standing perfectly still while others panic",
  "Priest": "blesses the food, the road and, once, a trap | answers every question with a quotation, and is then upset when it does not fit | counts the party under his breath and always comes out one short before he finds himself",
  "Man": "says 'I'm sure it's fine' about things that are not | is sure he has seen this room before, in every room | has a theory about everything, none of them correct | carries a spoon, for emergencies",
  "Woman": "has priced everything in the cave and thinks it is overvalued | gives a running review of each room as if it were an inn | corrects other people's packing without being asked",
  "Dwarf": "taps a wall and pronounces it 'adequate' | haggles with anything that speaks | is personally offended by bad masonry, even while being chased | refuses to admit he is lost, only that the cave has moved",
  "Wizard": "mislays his staff while holding it | speaks to rivals only in the third person | has an answer to everything that begins 'as I foresaw'",
  "Giant": "is very careful about tables | asks whether anyone else would like to sit down, and means the floor | warns people before he sneezes",
  "Lion": "regards the whole expedition with the patience of a cat that has seen it before | yawns at the dragon | lies in the one place everyone needs to walk through",
  "Scholar": "corrects the inscription's grammar while running from what it says | is thrilled by every new danger, as an example | cites a book no one has read, always with page numbers",
  "Witch": "mutters about people who 'should have known better' | has a curse for every occasion and the manners not to use most of them | greets monsters as if they were late for an appointment",
  "Thief": "returns things he took, with an explanation | says 'I was only holding it for them' | is the only one who can open a door and the only one who insists it was already open",
  "Wolf": "disapproves of the party's singing | looks at the lion as if it were a colleague | sits down at the exact moment it is time to go",
  "Dragon": "is clearly most put out that it has been woken for this",
  "Sorcerer": "talks to his own treasure as if it were a disappointing relative",
  "Unicorn": "wanders off at exactly the wrong moment and appears to be completely unconcerned about it",
};
for (const [cls, q] of Object.entries(QUIRKS)) CHARACTERS[cls]!.quirks = q.split("|").map((x) => x.trim());

/**
 * Fears, phobias and psychological flaws by class, often ironic for the class (the elephant afraid of the mouse). They are colour for who
 * a person is, not events: the thing feared may be a memory, a sound, a sign or an ordinary object, and in the cave it is only ever
 * dread, never a new creature or incident. A flaw never makes anyone leave the party; they face it badly, or freeze, and go on.
 * Merged into CHARACTERS below.
 */
const FLAWS: Record<string, string> = {
  "Hero": "is terrified of geese, and of nothing else | cannot bear to be thanked in front of others | dreads an empty house more than any cave | cannot rest when nobody depends on them | is certain that the next person to look closely will see through them",
  "W-Hero": "cannot bear to be pitied, and will take a wound rather than be helped | is afraid of moths, the soft kind, and will not say so | never lets anyone see her asleep | must be early, and is shaken if she is not",
  "Ogre": "is afraid of mice, and of the sound of small scratching | cannot stand a low ceiling, however much he pretends to | is shaken to the bone by a raised voice, even a cheerful one | dreads being laughed at more than being hurt",
  "Troll": "is afraid of the dawn, and counts the hours to it | will not cross a bridge without a long look under it | is afraid of goats, for reasons he refuses to explain | cannot bear to be called gentle",
  "Priest": "is plagued by the fear that he has left out a word of the rite | dreads the silence after a prayer, in case nothing answers | cannot light a candle without counting the flame | is afraid of the dark, and keeps this from the others",
  "Man": "fears being noticed, and will stand at the back of anything | is afraid of dogs, even small, friendly ones | cannot make a choice without asking someone first | dreads owing anyone anything",
  "Woman": "will not sit with her back to a door | cannot abide idle hands, her own or anyone's | is afraid of deep water, and has never learned to swim | dreads being thought soft more than being thought cruel",
  "Dwarf": "is afraid of the open sky, and keeps his hat low outdoors | has a terror of bees | is quietly sick at the thought of a day with no money in his purse | cannot bear being the one who gives way in a bargain",
  "Wizard": "dreads forgetting one word of a spell in the middle of it | is afraid of being laughed at, above all by an apprentice | cannot look at himself in a polished surface | will not owe a favour to a stranger",
  "Spectre": "dreads being named, and flinches at its own name | is unsettled by the morning | is afraid of being forgotten, and so cannot leave anyone alone",
  "Dragon": "is afraid of a small, quick thief, more than of any knight | cannot reach an itch beneath one scale, and it haunts it | is secretly afraid of getting wet",
  "Sorcerer": "dreads being ordinary again | cannot stand a room left untidy | is afraid to be liked, in case he comes to need it",
  "Giant": "is afraid of spiders, and of small quick things in general | dreads breaking something delicate | gets dizzy when he looks down, and is embarrassed about it | is uneasy in a crowd, in case he steps on someone",
  "Unicorn": "startles at a sudden noise, and will not be coaxed back | cannot bear mud | is afraid of being touched by anyone it does not know",
  "Apprentice": "dreads being examined, by anyone | is afraid of his master's footstep on the stair | cannot cast with someone watching",
  "Demon": "is unsettled by kindness | cannot bear a bargain left unfinished | is afraid of being thanked",
  "Lion": "is afraid of small scuttling sounds, as in the old fable | cannot bear to be laughed at when it purrs | is uneasy about water that drips",
  "Scholar": "is afraid of fire among books, and of fire generally | cannot let a wrong date pass, and suffers when he lets one | dreads the dark more than he lets on, and reads by the smallest light | is afraid of birds, and cannot say why",
  "Witch": "cannot cross running water without a long breath | is afraid of her own reflection, in clear water | is mortified to be thought kind | is afraid of toads, which is awkward in her trade",
  "Thief": "is afraid of being shut in, and always props a door | cannot look at a rope without thinking of one use for it | dreads being owed a favour | is unable to pass a bell without flinching",
  "Wolf": "is afraid of fire, and keeps just beyond its light | startles at its own echo | is uneasy near a dog",
  "Sibyl": "dreads being surprised by the one thing she did not see | cannot stop herself from looking at hands",
  "Ghoul": "is afraid of its own shadow | cannot bear light, and is ashamed of it",
};
for (const [cls, f] of Object.entries(FLAWS)) CHARACTERS[cls]!.flaws = f.split("|").map((x) => x.trim());

/** Pairings: how two classes stand with each other when they travel together. A line of one is enough in a story. */
export const PAIRINGS: Pairing[] = [
  { a: "Dwarf", b: "Ogre", text: "The dwarf talks and the ogre carries; each thinks the other is the sensible one." },
  { a: "Dwarf", b: "Troll", text: "Stone-kin who each claim to know it better, and bicker about it with great satisfaction." },
  { a: "Dwarf", b: "Hero", text: "The dwarf drives the bargain and the hero pays it without arguing, which the dwarf takes as respect." },
  { a: "Hero", b: "W-Hero", text: "Rivals who respect each other and will not say so, each waiting to see if the other will go first." },
  { a: "Hero", b: "Lion", text: "The lion settles by the one whose hand does not shake; the hero pretends not to notice." },
  { a: "Priest", b: "Ogre", text: "The priest talks the ogre through the night and the ogre listens with his whole face." },
  { a: "Priest", b: "Wizard", text: "Two kinds of power that neither trusts the other with; each privately thinks the other is a fraud." },
  { a: "Scholar", b: "Dwarf", text: "One reads the inscription, the other the floor, and each is quietly sure the other is wasting his time." },
  { a: "Thief", b: "Witch", text: "Each watching what the other carries, with great courtesy." },
  { a: "Woman", b: "Dwarf", text: "Both practical, both counting; they trade prices the way others trade stories." },
  { a: "Woman", b: "Unicorn", text: "The unicorn comes to her, and she makes no remark of it." },
  { a: "Wolf", b: "Lion", text: "Not friends: they keep each to a side of the fire and share the dark." },
  { a: "Man", b: "Ogre", text: "The man is the only one who speaks to the ogre as to an equal, and the ogre does not forget it." },
  { a: "Hero", b: "Priest", text: "The hero leads and the priest counts the cost; neither says what each is thinking." },
];

export const defaultCharacters = (): CharacterBundle => ({ header: CHARACTERS_HEADER, characters: Object.entries(CHARACTERS), pairings: PAIRINGS });

const FIELDS = ["general", "names", "habits", "worries", "wants", "strengths", "quirks", "flaws", "explorer"] as const;
const POOLS = new Set(["names", "habits", "worries", "wants", "strengths", "quirks", "flaws", "explorer"]);

/** The bundle as editable text: a header, a `## Class` block per creature (`field: a | b | c` lines), then `## pairings` with `A + B: text`. */
export function renderCharacters(b: CharacterBundle = defaultCharacters()): string {
  const out = ["## header", "", b.header, ""];
  for (const [name, c] of b.characters) {
    // A blank line between every field so each reads as its own paragraph (the parser ignores blank lines).
    const fields = [`general: ${c.general}`, `names: ${c.names.join(" | ")}`, `habits: ${c.habits.join(" | ")}`, `worries: ${c.worries.join(" | ")}`,
      `wants: ${c.wants.join(" | ")}`, `strengths: ${c.strengths.join(" | ")}`];
    if (c.quirks?.length) fields.push(`quirks: ${c.quirks.join(" | ")}`);
    if (c.flaws?.length) fields.push(`flaws: ${c.flaws.join(" | ")}`);
    if (c.explorer?.length) fields.push(`explorer: ${c.explorer.join(" | ")}`);
    out.push(`## ${name}`, "", fields.join("\n\n"), "");
  }
  out.push("## pairings", "", b.pairings.map((p) => `${p.a} + ${p.b}: ${p.text}`).join("\n\n"));
  return out.join("\n");
}

/** Read the editable text back into a bundle, with every problem found. */
export function parseCharacters(text: string): { bundle: CharacterBundle; problems: string[] } {
  const problems: string[] = [];
  const bundle: CharacterBundle = { header: "", characters: [], pairings: [] };
  let section: string | null = null;
  let cur: Character | null = null;
  const header: string[] = [];
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    const sec = line.match(/^##\s*(.+?)\s*$/);
    if (sec) {
      section = sec[1]!;
      cur = null;
      if (section.toLowerCase() === "header") section = "header";
      else if (section.toLowerCase() === "pairings") section = "pairings";
      else { cur = { general: "", names: [], habits: [], worries: [], wants: [], strengths: [] }; bundle.characters.push([section, cur]); }
      return;
    }
    if (section === "header") { header.push(raw); return; }
    if (!line) return;
    if (section === null) { problems.push(`Line ${i + 1}: this line is outside any section.`); return; }
    const m = line.match(/^([^:+]+(?:\s\+\s[^:]+)?):\s*(.*)$/);
    if (!m || !m[2]!.trim()) { problems.push(`Line ${i + 1}: expected "field: value" (${line.slice(0, 40)}…).`); return; }
    const key = m[1]!.trim(), value = m[2]!.trim();
    if (section === "pairings") {
      const [a, b] = key.split("+").map((s) => s.trim());
      if (!a || !b) problems.push(`Line ${i + 1}: a pairing is "Class + Class: text".`);
      else bundle.pairings.push({ a, b, text: value });
      return;
    }
    if (!cur) return;
    if (!(FIELDS as readonly string[]).includes(key)) { problems.push(`Line ${i + 1}: unknown field "${key}" (use ${FIELDS.join(", ")}).`); return; }
    if (key === "general") cur.general = value;
    else if (POOLS.has(key)) (cur as unknown as Record<string, string[]>)[key] = value.split("|").map((s) => s.trim()).filter(Boolean);
  });
  bundle.header = header.join("\n").trim();
  return { bundle, problems };
}

/** Why a characters text cannot be saved: it does not parse, names a class the game does not have, or a class lacks a general line or any names. */
export function characterProblems(text: string, knownCreatures: readonly string[]): string[] {
  const { bundle, problems } = parseCharacters(text);
  if (!bundle.header) problems.push("The characters need a header section.");
  const known = new Set(knownCreatures);
  for (const [n, c] of bundle.characters) {
    if (!known.has(n)) problems.push(`"${n}" is not a creature in the game (spelling must match, e.g. W-Hero).`);
    if (!c.general) problems.push(`${n} has no general line.`);
    if (!c.names.length) problems.push(`${n} has no names.`);
  }
  for (const p of bundle.pairings) for (const n of [p.a, p.b]) if (!known.has(n)) problems.push(`Pairing names "${n}", which is not a creature in the game.`);
  return problems;
}

/** A short stable hash (FNV-1a), so a game's names do not change when the same game is rewritten. */
const hash = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** `n` distinct names for a class, chosen by the key; when the pool runs out the rest are "the second Dwarf" and so on. */
export function namesFor(key: string, cls: string, pool: readonly string[], n: number): string[] {
  const out: string[] = [];
  let at = pool.length ? hash(`${key}|${cls}`) % pool.length : 0;
  for (let i = 0; i < n; i++) {
    out.push(pool.length > i ? pool[(at + i) % pool.length]! : `the ${["first", "second", "third", "fourth", "fifth"][i] ?? `#${i + 1}`} ${cls.toLowerCase()}`);
  }
  return out;
}

/** The classes (and how many of each) named in the digest's "Starting party:" line. */
export function startingParty(digestText: string, classes: readonly string[]): [string, number][] {
  const line = digestText.match(/^Starting party:\s*(.*)$/m)?.[1] ?? "";
  const out: [string, number][] = [];
  for (const cls of classes) {
    const n = (line.match(new RegExp(`(?<![\\w-])${cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?(?![\\w-])`, "g")) ?? []).length;
    if (n) out.push([cls, n]);
  }
  return out;
}

/**
 * The company for this run, ready to put in a prompt: each person of the starting party with a fixed name, a general line and the pools
 * they may be drawn from; then the other classes in the record with a general line and one name; then any pairings that apply.
 * Empty when no known creature appears.
 */
export function castFor(digestText: string, key: string, text?: string): string {
  const b = text === undefined ? defaultCharacters() : parseCharacters(text).bundle;
  const byName = new Map(b.characters);
  const start = startingParty(digestText, b.characters.map(([n]) => n));
  const startSet = new Set(start.map(([n]) => n));
  const others = b.characters.filter(([n]) => !startSet.has(n) && mentions(digestText, n));
  if (!start.length && !others.length) return "";
  const pool = (label: string, xs: string[]): string => (xs.length ? ` ${label}: ${xs.join("; ")}.` : "");
  const lines: string[] = [b.header];
  if (start.length) {
    lines.push("", "THE PARTY THAT WENT DOWN (their names are fixed; the options are for you or the plan to pick from, a few for each):");
    for (const [cls, n] of start) {
      const c = byName.get(cls)!;
      namesFor(key, cls, c.names, n).forEach((name) => {
        lines.push(`- ${name}, the ${cls === "W-Hero" ? "heroine" : cls.toLowerCase()}: ${c.general}` +
          pool("Habits", c.habits) + pool("Worries", c.worries) + pool("Wants", c.wants) + pool("Strengths", c.strengths) + pool("Funny habits, for a light touch under pressure", c.quirks ?? []) + pool("Fears and flaws, to pick one from for depth or a light comic touch", c.flaws ?? []) + pool("As an explorer, why they went down", c.explorer ?? []));
      });
    }
  }
  if (others.length) {
    lines.push("", "OTHERS THEY MEET (a name to use if the story names one; a general line to colour them):");
    for (const [cls, c] of others) lines.push(`- ${cls === "W-Hero" ? "A heroine" : `A ${cls.toLowerCase()}`} may be called ${namesFor(key, cls, c.names, 1)[0]}: ${c.general}`);
  }
  const present = new Set([...startSet, ...others.map(([n]) => n)]);
  const pairs = b.pairings.filter((p) => startSet.has(p.a) && present.has(p.b) || startSet.has(p.b) && present.has(p.a));
  if (pairs.length) lines.push("", "HOW THEY STAND WITH EACH OTHER:", ...pairs.map((p) => `- ${p.a} and ${p.b}: ${p.text}`));
  return lines.join("\n");
}
