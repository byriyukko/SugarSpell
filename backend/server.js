import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
const { default: db } = await import('./db.js');

const app = express();
const PORT = process.env.PORT || 5000;
const ORIGINS = ['http://localhost:5180'];

app.use(cors({ origin: ORIGINS }));

app.use(cors({ origin: ORIGINS }));
app.use(express.json());

const TAGS = ['bloom', 'blight', 'might', 'wisp'];
const isCount = (v) => Number.isInteger(v) && v >= 0;
const startingIngredients = 3;
const startingGold = 50;

const ingredientRows = () =>
  db.prepare('SELECT id, name, tag, description, price, icon FROM ingredients ORDER BY rowid').all();

/** all that a save needs */
function loadSave(id) {
  const save = db.prepare(
    'SELECT id, name, gold, gold_earned AS goldEarned, play_seconds AS playSeconds FROM saves WHERE id = ?'
  ).get(id);
  if (!save) return null;

  const inventory = {};
  for (const r of db.prepare('SELECT ingredient_id, quantity FROM save_ingredients WHERE save_id = ?').all(id)) {
    inventory[r.ingredient_id] = r.quantity;
  }
  const recipes = db.prepare('SELECT id, name, tag, ingredients FROM recipes WHERE save_id = ? ORDER BY id').all(id)
    .map((r) => ({ ...r, ingredients: JSON.parse(r.ingredients) }));
  const items = {};
  for (const r of db.prepare('SELECT recipe_id, quantity FROM save_items WHERE save_id = ?').all(id)) {
    items[r.recipe_id] = r.quantity;
  }
  return { ...save, inventory, recipes, items };
}

const cleanName = (v, fallback) => String(v ?? '').trim().slice(0, 30) || fallback;

/* health */
app.get('/', (req, res) => res.send('SugarSpell Backend is running!'));
app.get('/api/health', (req, res) => res.json({ success: true, message: 'Welcome to the SugarSpell API!' }));

/* tags for ingre*/
app.get('/api/ingredients', (req, res) => res.json(ingredientRows()));

app.get('/api/customers', (req, res) => {
  const rows = db.prepare(
    'SELECT id, name, description, image_base AS imageBase, voice, lines FROM customers ORDER BY rowid'
  ).all();
  res.json(rows.map((r) => ({ ...r, lines: JSON.parse(r.lines) })));
});

/* saves */
app.get('/api/saves', (req, res) => {
  res.json(db.prepare(
    `SELECT id, name, gold, gold_earned AS goldEarned, play_seconds AS playSeconds, updated_at AS updatedAt
     FROM saves ORDER BY updated_at DESC, id DESC`
  ).all());
});

app.get('/api/saves/:id', (req, res) => {
  const save = loadSave(Number(req.params.id));
  if (!save) return res.status(404).json({ error: 'Save not found.' });
  res.json(save);
});

app.post('/api/saves', (req, res) => {
  const name = cleanName(req.body.name, 'New Save');
  const create = db.transaction(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO saves (name, gold) VALUES (?, ?)').run(name, startingGold);
    const add = db.prepare('INSERT INTO save_ingredients (save_id, ingredient_id, quantity) VALUES (?, ?, ?)');
    for (const ing of ingredientRows()) add.run(lastInsertRowid, ing.id, startingIngredients);
    return Number(lastInsertRowid);
  });
  res.status(201).json(loadSave(create()));
});

app.patch('/api/saves/:id', (req, res) => {
  const id = Number(req.params.id);
  const name = cleanName(req.body.name, '');
  if (!name) return res.status(400).json({ error: 'Name cannot be empty.' });
  const { changes } = db.prepare('UPDATE saves SET name = ? WHERE id = ?').run(name, id);
  if (!changes) return res.status(404).json({ error: 'Save not found.' });
  res.json({ ok: true });
});

app.delete('/api/saves/:id', (req, res) => {
  const { changes } = db.prepare('DELETE FROM saves WHERE id = ?').run(Number(req.params.id));
  if (!changes) return res.status(404).json({ error: 'Save not found.' });
  res.json({ ok: true });
});

/** save */
app.put('/api/saves/:id/state', (req, res) => {
  const id = Number(req.params.id);
  const { gold, goldEarned, playSeconds, inventory = {}, items = {} } = req.body;

  if (!db.prepare('SELECT 1 FROM saves WHERE id = ?').get(id)) return res.status(404).json({ error: 'Save not found.' });
  if (![gold, goldEarned, playSeconds].every(isCount)) return res.status(400).json({ error: 'Invalid numbers.' });

  db.transaction(() => {
    db.prepare(
      'UPDATE saves SET gold = ?, gold_earned = ?, play_seconds = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(gold, goldEarned, playSeconds, id);

    const upIng = db.prepare(
      `INSERT INTO save_ingredients (save_id, ingredient_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT(save_id, ingredient_id) DO UPDATE SET quantity = excluded.quantity`
    );
    for (const ing of ingredientRows()) {
      if (isCount(inventory[ing.id])) upIng.run(id, ing.id, inventory[ing.id]);
    }

    const upItem = db.prepare(
      `INSERT INTO save_items (save_id, recipe_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT(save_id, recipe_id) DO UPDATE SET quantity = excluded.quantity`
    );
    const delItem = db.prepare('DELETE FROM save_items WHERE save_id = ? AND recipe_id = ?');
    for (const r of db.prepare('SELECT id FROM recipes WHERE save_id = ?').all(id)) {
      const q = items[r.id];
      if (!isCount(q)) continue;
      if (q > 0) upItem.run(id, r.id, q); else delItem.run(id, r.id);
    }
  })();

  res.json({ ok: true });
});

/* all below is recipe*/
function parseRecipe(body) {
  const name = cleanName(body.name, '');
  const { tag, ingredients } = body;
  if (!name) return { error: 'Give your creation a name.' };
  if (!TAGS.includes(tag)) return { error: 'Choose what kind of item this is.' };
  if (!Array.isArray(ingredients) || ingredients.length !== 3) {
    return { error: 'A recipe needs exactly 3 ingredients.' };
  }
  const byId = new Map(ingredientRows().map((i) => [i.id, i]));
  if (!ingredients.every((i) => byId.has(i))) return { error: 'Unknown ingredient.' };
  if (!ingredients.some((i) => byId.get(i).tag === tag)) {
    return { error: `At least one ingredient must be a ${tag} ingredient.` };
  }
  return { name, tag, ingredients, key: [...ingredients].sort().join('|') };
}

const DUPLICATE = 'You already have a recipe with that name or those ingredients.';

//recipe book
app.post('/api/saves/:id/recipes', (req, res) => {
  const saveId = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM saves WHERE id = ?').get(saveId)) return res.status(404).json({ error: 'Save not found.' });

  const r = parseRecipe(req.body);
  if (r.error) return res.status(400).json({ error: r.error });

  try {
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO recipes (save_id, name, tag, ingredient_key, ingredients) VALUES (?, ?, ?, ?, ?)'
    ).run(saveId, r.name, r.tag, r.key, JSON.stringify(r.ingredients));
    res.status(201).json({ id: Number(lastInsertRowid), name: r.name, tag: r.tag, ingredients: r.ingredients });
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: DUPLICATE });
    throw e;
  }
});

app.put('/api/saves/:saveId/recipes/:recipeId', (req, res) => {
  const saveId = Number(req.params.saveId);
  const recipeId = Number(req.params.recipeId);

  const r = parseRecipe(req.body);
  if (r.error) return res.status(400).json({ error: r.error });

  try {
    const { changes } = db.prepare(
      'UPDATE recipes SET name = ?, tag = ?, ingredient_key = ?, ingredients = ? WHERE id = ? AND save_id = ?'
    ).run(r.name, r.tag, r.key, JSON.stringify(r.ingredients), recipeId, saveId);
    if (!changes) return res.status(404).json({ error: 'Recipe not found.' });
    res.json({ id: recipeId, name: r.name, tag: r.tag, ingredients: r.ingredients });
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return res.status(409).json({ error: DUPLICATE });
    throw e;
  }
});

app.delete('/api/saves/:saveId/recipes/:recipeId', (req, res) => {
  const { changes } = db.prepare('DELETE FROM recipes WHERE id = ? AND save_id = ?')
    .run(Number(req.params.recipeId), Number(req.params.saveId));
  if (!changes) return res.status(404).json({ error: 'Recipe not found.' });
  res.json({ ok: true });
});


app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status === 400 ? 'Bad request.' : 'Server error.' });
});

app.listen(PORT, () => console.log(`SugarSpell server running on http://localhost:${PORT}`));