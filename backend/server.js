
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
const { default: db } = await import('./db.js');

const app = express();
const PORT = process.env.PORT || 5000;




const ORIGINS = [
  'http://localhost:5180',
  'http://localhost:4173',
  'https://sugar-spell-bay.vercel.app'
];

const corsOptions = {
  origin: (origin, callback) => {
    const isVercelPreview =
      /^https:\/\/sugar-spell-[a-z0-9-]+-byriyukko\.vercel\.app$/.test(origin || '');

    if (!origin || ORIGINS.includes(origin) || isVercelPreview) {
      callback(null, true);
    } else {
      callback(new Error('Origin not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));




app.use(express.json());

const TAGS = ['bloom', 'blight', 'might', 'wisp'];
const isCount = (v) => Number.isInteger(v) && v >= 0;
const startingIngredients = 3;
const startingGold = 50;


async function queryAll(sql, args = []) {
  const result = await db.execute({ sql, args });
  return [...result.rows];
}

async function queryOne(sql, args = []) {
  const rows = await queryAll(sql, args);
  return rows[0] ?? null;
}

async function ingredientRows() {
  return queryAll(
    'SELECT id, name, tag, description, price, icon FROM ingredients ORDER BY rowid'
  );
}


async function loadSave(id) {
  const save = await queryOne(
    `SELECT id, name, gold,
      gold_earned AS goldEarned,
      play_seconds AS playSeconds
     FROM saves WHERE id = ?`,
    [id]
  );

  if (!save) return null;

  const inventory = {};
  const inventoryRows = await queryAll(
    'SELECT ingredient_id, quantity FROM save_ingredients WHERE save_id = ?',
    [id]
  );

  for (const r of inventoryRows) {
    inventory[r.ingredient_id] = r.quantity;
  }

  const recipes = (await queryAll(
    'SELECT id, name, tag, ingredients FROM recipes WHERE save_id = ? ORDER BY id',
    [id]
  )).map((r) => ({
    ...r,
    ingredients: JSON.parse(r.ingredients)
  }));

  const items = {};
  const itemRows = await queryAll(
    'SELECT recipe_id, quantity FROM save_items WHERE save_id = ?',
    [id]
  );

  for (const r of itemRows) {
    items[r.recipe_id] = r.quantity;
  }

  return { ...save, inventory, recipes, items };
}

const cleanName = (v, fallback) =>
  String(v ?? '').trim().slice(0, 30) || fallback;

const isConstraintError = (e) =>
  String(e.code || '').includes('CONSTRAINT') ||
  /unique constraint|constraint failed/i.test(String(e.message || ''));


app.get('/', (req, res) => {
  res.send('SugarSpell Backend is running!');
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to the SugarSpell API!'
  });
});


app.get('/api/ingredients', async (req, res) => {
  res.json(await ingredientRows());
});


app.get('/api/customers', async (req, res) => {
  const rows = await queryAll(
    `SELECT id, name, description,
      image_base AS imageBase,
      voice, lines
     FROM customers ORDER BY rowid`
  );

  res.json(rows.map((r) => ({
    ...r,
    lines: JSON.parse(r.lines)
  })));
});


app.get('/api/saves', async (req, res) => {
  const rows = await queryAll(
    `SELECT id, name, gold,
      gold_earned AS goldEarned,
      play_seconds AS playSeconds,
      updated_at AS updatedAt
     FROM saves
     ORDER BY updated_at DESC, id DESC`
  );

  res.json(rows);
});

app.get('/api/saves/:id', async (req, res) => {
  const save = await loadSave(Number(req.params.id));

  if (!save) {
    return res.status(404).json({ error: 'Save not found.' });
  }

  res.json(save);
});

app.post('/api/saves', async (req, res) => {
  const name = cleanName(req.body.name, 'New Save');

  const tx = await db.transaction('write');

  try {
    const result = await tx.execute({
      sql: 'INSERT INTO saves (name, gold) VALUES (?, ?) RETURNING id',
      args: [name, startingGold]
    });

    const saveId = Number(result.rows[0].id);
    const ingredients = await ingredientRows();

    for (const ing of ingredients) {
      await tx.execute({
        sql: `INSERT INTO save_ingredients
          (save_id, ingredient_id, quantity)
          VALUES (?, ?, ?)`,
        args: [saveId, ing.id, startingIngredients]
      });
    }

    await tx.commit();

    const save = await loadSave(saveId);
    res.status(201).json(save);
  } catch (e) {
    await tx.rollback();
    throw e;
  }
});

app.patch('/api/saves/:id', async (req, res) => {
  const id = Number(req.params.id);
  const name = cleanName(req.body.name, '');

  if (!name) {
    return res.status(400).json({ error: 'Name cannot be empty.' });
  }

  const result = await db.execute({
    sql: 'UPDATE saves SET name = ? WHERE id = ?',
    args: [name, id]
  });

  if (!result.rowsAffected) {
    return res.status(404).json({ error: 'Save not found.' });
  }

  res.json({ ok: true });
});

app.delete('/api/saves/:id', async (req, res) => {
  const result = await db.execute({
    sql: 'DELETE FROM saves WHERE id = ?',
    args: [Number(req.params.id)]
  });

  if (!result.rowsAffected) {
    return res.status(404).json({ error: 'Save not found.' });
  }

  res.json({ ok: true });
});


app.put('/api/saves/:id/state', async (req, res) => {
  const id = Number(req.params.id);
  const {
    gold,
    goldEarned,
    playSeconds,
    inventory = {},
    items = {}
  } = req.body;

  const save = await queryOne(
    'SELECT 1 FROM saves WHERE id = ?',
    [id]
  );

  if (!save) {
    return res.status(404).json({ error: 'Save not found.' });
  }

  if (![gold, goldEarned, playSeconds].every(isCount)) {
    return res.status(400).json({ error: 'Invalid numbers.' });
  }

  const tx = await db.transaction('write');

  try {
    await tx.execute({
      sql: `UPDATE saves
        SET gold = ?,
            gold_earned = ?,
            play_seconds = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      args: [gold, goldEarned, playSeconds, id]
    });

    const ingredients = await ingredientRows();

    for (const ing of ingredients) {
      if (isCount(inventory[ing.id])) {
        await tx.execute({
          sql: `INSERT INTO save_ingredients
            (save_id, ingredient_id, quantity)
            VALUES (?, ?, ?)
            ON CONFLICT(save_id, ingredient_id)
            DO UPDATE SET quantity = excluded.quantity`,
          args: [id, ing.id, inventory[ing.id]]
        });
      }
    }

    const recipes = await queryAll(
      'SELECT id FROM recipes WHERE save_id = ?',
      [id]
    );

    for (const r of recipes) {
      const q = items[r.id];

      if (!isCount(q)) continue;

      if (q > 0) {
        await tx.execute({
          sql: `INSERT INTO save_items
            (save_id, recipe_id, quantity)
            VALUES (?, ?, ?)
            ON CONFLICT(save_id, recipe_id)
            DO UPDATE SET quantity = excluded.quantity`,
          args: [id, r.id, q]
        });
      } else {
        await tx.execute({
          sql: 'DELETE FROM save_items WHERE save_id = ? AND recipe_id = ?',
          args: [id, r.id]
        });
      }
    }

    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }

  res.json({ ok: true });
});

/* Recipes */
async function parseRecipe(body) {
  const name = cleanName(body.name, '');
  const { tag, ingredients } = body;

  if (!name) {
    return { error: 'Give your creation a name.' };
  }

  if (!TAGS.includes(tag)) {
    return { error: 'Choose what kind of item this is.' };
  }

  if (!Array.isArray(ingredients) || ingredients.length !== 3) {
    return { error: 'A recipe needs exactly 3 ingredients.' };
  }

  const availableIngredients = await ingredientRows();
  const byId = new Map(
    availableIngredients.map((i) => [i.id, i])
  );

  if (!ingredients.every((i) => byId.has(i))) {
    return { error: 'Unknown ingredient.' };
  }

  if (!ingredients.some((i) => byId.get(i).tag === tag)) {
    return {
      error: `At least one ingredient must be a ${tag} ingredient.`
    };
  }

  return {
    name,
    tag,
    ingredients,
    key: [...ingredients].sort().join('|')
  };
}

const DUPLICATE =
  'You already have a recipe with that name or those ingredients.';


app.post('/api/saves/:id/recipes', async (req, res) => {
  const saveId = Number(req.params.id);

  const save = await queryOne(
    'SELECT 1 FROM saves WHERE id = ?',
    [saveId]
  );

  if (!save) {
    return res.status(404).json({ error: 'Save not found.' });
  }

  const r = await parseRecipe(req.body);

  if (r.error) {
    return res.status(400).json({ error: r.error });
  }

  try {
    const result = await db.execute({
      sql: `INSERT INTO recipes
        (save_id, name, tag, ingredient_key, ingredients)
        VALUES (?, ?, ?, ?, ?)
        RETURNING id`,
      args: [
        saveId,
        r.name,
        r.tag,
        r.key,
        JSON.stringify(r.ingredients)
      ]
    });

    const recipeId = Number(result.rows[0].id);

    res.status(201).json({
      id: recipeId,
      name: r.name,
      tag: r.tag,
      ingredients: r.ingredients
    });
  } catch (e) {
    if (isConstraintError(e)) {
      return res.status(409).json({ error: DUPLICATE });
    }

    throw e;
  }
});


app.put('/api/saves/:saveId/recipes/:recipeId', async (req, res) => {
  const saveId = Number(req.params.saveId);
  const recipeId = Number(req.params.recipeId);

  const r = await parseRecipe(req.body);

  if (r.error) {
    return res.status(400).json({ error: r.error });
  }

  try {
    const result = await db.execute({
      sql: `UPDATE recipes
        SET name = ?,
            tag = ?,
            ingredient_key = ?,
            ingredients = ?
        WHERE id = ? AND save_id = ?`,
      args: [
        r.name,
        r.tag,
        r.key,
        JSON.stringify(r.ingredients),
        recipeId,
        saveId
      ]
    });

    if (!result.rowsAffected) {
      return res.status(404).json({ error: 'Recipe not found.' });
    }

    res.json({
      id: recipeId,
      name: r.name,
      tag: r.tag,
      ingredients: r.ingredients
    });
  } catch (e) {
    if (isConstraintError(e)) {
      return res.status(409).json({ error: DUPLICATE });
    }

    throw e;
  }
});


app.delete('/api/saves/:saveId/recipes/:recipeId', async (req, res) => {
  const result = await db.execute({
    sql: 'DELETE FROM recipes WHERE id = ? AND save_id = ?',
    args: [
      Number(req.params.recipeId),
      Number(req.params.saveId)
    ]
  });

  if (!result.rowsAffected) {
    return res.status(404).json({ error: 'Recipe not found.' });
  }

  res.json({ ok: true });
});


app.use((err, req, res, next) => {
  console.error(err);

  res.status(err.status || 500).json({
    error: err.status === 400 ? 'Bad request.' : 'Server error.'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SugarSpell server running on port ${PORT}`);
});
