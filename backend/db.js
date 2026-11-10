
import Database from 'better-sqlite3';

const db = new Database(process.env.DB_FILE || 'sugarspell.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS ingredients (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  tag         TEXT NOT NULL CHECK (tag IN ('bloom','blight','might','wisp')),
  description TEXT NOT NULL,
  price       INTEGER NOT NULL,
  icon        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  image_base  TEXT NOT NULL,   -- e.g. /images/customers/mira  ->  mira_neutral.png / mira_happy.png / mira_angry.png
  voice       INTEGER NOT NULL DEFAULT 400, -- blip pitch in Hz
  lines       TEXT NOT NULL    -- JSON: greet, order ({item}), thanks, angry, wrong, quips
);

CREATE TABLE IF NOT EXISTS saves (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  gold         INTEGER NOT NULL DEFAULT 50,
  gold_earned  INTEGER NOT NULL DEFAULT 0,
  play_seconds INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at   TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS save_ingredients (
  save_id       INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  ingredient_id TEXT    NOT NULL REFERENCES ingredients(id),
  quantity      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (save_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS recipes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id        INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  tag            TEXT NOT NULL CHECK (tag IN ('bloom','blight','might','wisp')),
  ingredient_key TEXT NOT NULL,  -- sorted ingredient ids joined by |
  ingredients    TEXT NOT NULL,  -- JSON array of 3 ingredient ids
  UNIQUE (save_id, ingredient_key),
  UNIQUE (save_id, name)
);

CREATE TABLE IF NOT EXISTS save_items (
  save_id   INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  quantity  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (save_id, recipe_id)
);
`);



const INGREDIENTS = [
  ['moonpetal',   'Moonpetal',    'bloom',  6, 'A purple petal that only opens under moonlight. Stolen from Rapunzel\'s garden, you might feel Mother Gothel\'s eyes on you.'],
  ['honeycomb',   'Honeycomb',    'bloom',  9, 'Golden wax from the stressful bees that stings everyone at first glance. Be grateful you survived the encounter.'],
  ['dragonspice', 'Dragon Spice', 'might', 10, 'A spicy herb. One whiff and you\'ll feel like a dragon breathing fire. It\'s a shame it doesn\'t actually make you breathe fire.'],
  ['frostberry',  'Frostberry',   'might',  7, 'Cold icy berries that makes the atmosphere cold. Goodluck if you want to keep your hands warm while holding them.'],
  ['starsugar',   'Star Sugar',   'wisp',  12, 'Crystals that fell from the sky. They sparkle, fizz and hum with raw magic. Careful, they might fly away!'],
  ['mushroom',    'Glow Cap',     'blight', 9, 'A faintly glowing mushroom. Pretty, but its spores bring nasty rashes and worse.'],
];

const upsertIngredient = db.prepare(`
  INSERT INTO ingredients (id, name, tag, price, description, icon)
  VALUES (@id, @name, @tag, @price, @description, @icon)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, tag=excluded.tag, price=excluded.price,
    description=excluded.description, icon=excluded.icon
`);


const CUSTOMERS = [
  {
    id: 'mori', name: 'Mori', voice: 720,
    description: 'A sharp-witted fox demihuman with a permanently unimpressed expression, a dry sense of humor, and little patience for nonsense. Has an odd habit of silently judging people while her tail gives away every emotion.',
    lines: {
      greet: ['You\'re here. How... unexpected.', 'Hey. Don\'t mind me.',
        'Oh. It\'s you. ...Not that I\'m complaining.', 'Oh, hello. Didn\'t hear you coming.'
      ],

      order: ['I\'ll take {item} . I\'m not particularly picky.', '{item}, please. Nothing complicated.',
        'That one... {item} . Looks useful enough.', 'I\'ll have a {item} . I trust you know what you\'re doing.',
        'One {item} . And no, I\'m not buying it just because the bottle looks pretty.'
      ],

      thanks: ['Pretty good. ...Don\'t let it get to your head.', 'Heh. You\'re alright.',
        'Appreciated. You\'re not so bad.', 'Thanks. ...There, was that polite enough?',
        'Oh. You remembered my order. Nice.'
      ],

      angry: ['Did my order grow legs and run away?', 'My patience is running out. Unlike your preparation time.',
        'You know, I could\'ve taken a nap by now.', 'Is my order coming, or should I fetch it myself?',
        'A little urgency wouldn\'t hurt.'
      ],

      wrong: ['Hm. Did you even listen?', 'My order seems to have taken a wrong turn.',
        'Should I pretend this is what I wanted?', 'I\'m fairly certain I know what I ordered.'
      ],

      quips: ['I like quiet places. And people who know when to be quiet.', 'If I look annoyed, it\'s probably because I am.',
        'I have a lot to say. I just don\'t feel like saying it.', 'I\'m not judging you. Out loud, anyway.',
        'I\'m surrounded by interesting people. Unfortunately.'
      ],
    },
  },
  {
    id: 'kyousuke', name: 'Kyousuke', voice: 360,
    description: 'An optimistic adventurer who is always looking for the next big thrill. He\'s a bit clumsy, but his heart is in the right place. Has once defeated an orc.',
    lines: {
      greet: ['Back for another round of trouble? You know it!', 'Hey, hey! What\'s the good word?',
        'Well, if it isn\'t my favorite supplier of questionable necessities!', 'Morning! Or afternoon? Ah, who cares! Adventure waits for no one!'
      ],
      order: ['One {item}, I need to slay some monsters!', 'Feeling like a {item} right now.',
        'I\'ll take a {item}! Never know when it\'ll come in handy!', 'A {item}! Just what I need for my next expedition!',
        'Can\'t go adventuring empty-handed! I\'ll take a {item}!'
      ],

      thanks: ['Brilliant! This\'ll definitely come in handy!', 'Cheers! Here\'s hoping I don\'t have to use it!',
        'Excellent! Fortune favors the prepared, eh?', 'Ha! With this, I\'m practically unstoppable!'
      ],

      angry: ['I gotta go, can\'t have myself waiting around.', 'Oh, come on! I\'ve had better luck with cursed treasure!',
        'I\'ve been waiting here for ages! What gives?', 'I\'m not one to complain, but this is getting ridiculous!',
        'Oi! Hold your horses! What\'s this supposed to be?'
      ],

      wrong: ['Now, I\'m all for surprises, but this isn\'t what I asked for!', 'Wait a minute... I don\'t remember ordering THIS!',
        'Erm... did my order get lost on its own adventure?', 'Well, that\'s a fine mess you\'ve gotten me into!'
      ],

      quips: ['I\'ve got a good feeling about this! Probably.', 'I wonder if dragons enjoy pastries...',
        'The world won\'t explore itself, you know!', 'Treasure, trouble, and tasty food! That\'s the life!',
        'Wonder what trouble we\'ll stumble into today?'
      ],
    },
  },
  {
    id: 'rumpwick', name: 'Rumpwick', voice: 150,
    description: 'A peculiar old Irish dwarf with a sharp tongue, a bottomless appetite, and an endless supply of tall tales. Claims to know kings, witches, dragons, and the occasional talking mushroom.',
    lines: {
      greet: ['Ah! A new face! How wonderfully peculiar!', 'Heh heh! Come closer, don\'t be shy!',
        'Oh, don\'t mind me, just enjoying the finer things in life!', 'Well, well! What have we got here?'
      ],

      order: ['A little {item} should do the trick! Heh heh!', 'Bring me some {item}! And don\'t go skimping on the portions!',
        'Oho! A taste for {item}, if you please!', 'I\'ll take {item} . A fine choice, if I do say so myself!'
      ],

      thanks: ['Bless these hands of yours! Wonderful work!', 'Heh heh! You\'ve earned yourself a little favor!',
        'Ahh! Just the way I like it! Splendid!', 'Heh heh! You\'ve got a knack for this, I\'ll give you that!',
        'Now THAT is worth every last coin!'
      ],

      angry: ['AHEM! Has my order gone on an adventure of its own?!"', 'Now, now! I haven\'t got all century!',
        'Good heavens! I\'ve seen snails move faster than this!', 'Oi! Don\'t leave an old man waiting! My patience isn\'t what it used to be!',
        'What\'s taking so long? Are you growing the ingredients yourself?!'
      ],

      wrong: ['Now, I may be old, but my memory hasn\'t turned to soup!', 'Hmm... Not quite what I had in mind, my dear!',
        'I ordered one thing and received another! Is this some sort of trick?', 'Eh?! What in the blazes is THIS?'
      ],

      quips: ['A watched pot never boils! Now, where\'s my order?', 'Never trust a mushroom that looks too happy.',
            'You know, I once wrestled a dragon for a pot of gold. It was a very polite dragon, actually.',
            'Is it legal to borrow the government\'s funds? I\'ve been doing it for years!'  ],
    },
  },
];

const upsertCustomer = db.prepare(`
  INSERT INTO customers (id, name, description, image_base, voice, lines)
  VALUES (@id, @name, @description, @image_base, @voice, @lines)
  ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description,
    image_base=excluded.image_base, voice=excluded.voice, lines=excluded.lines
`);

db.transaction(() => {
  for (const [id, name, tag, price, description] of INGREDIENTS) {
    upsertIngredient.run({ id, name, tag, price, description, icon: `/images/ingredients/${id}.svg` });
  }
  for (const c of CUSTOMERS) {
    upsertCustomer.run({
      id: c.id, name: c.name, description: c.description, voice: c.voice,
      image_base: `/images/customers/${c.id}`, lines: JSON.stringify(c.lines),
    });
  }

   const keep = CUSTOMERS.map((c) => c.id);
  db.prepare(`DELETE FROM customers WHERE id NOT IN (${keep.map(() => '?').join(',')})`).run(...keep);

})();

export default db;