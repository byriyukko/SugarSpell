import { useState } from 'react';
import { TAGS, formatPlay } from './GameData';

const TagBadge = ({ tag }) => <span className={`tag tag-${tag}`}>{TAGS[tag].label}</span>;

/* for saving */
export function SavePanel({ save, saves, onSaveNow, onCreate, onLoad, onDelete, onRename }) {
  const [newName, setNewName] = useState('');
  const [name, setName] = useState(save.name);

  return (
    <>
      <section className="panel-section">
        <h3>Current save</h3>
        <div className="row">
          <input type="text" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
          <button onClick={() => onRename(name)}>Rename</button>
          <button onClick={onSaveNow}>Save progress</button>
        </div>
        <p className="dim">
          Played {formatPlay(save.playSeconds)} · {save.goldEarned} gold earned
        </p>
      </section>

      <section className="panel-section">
        <h3>Create new save</h3>
        <div className="row">
          <input type="text" placeholder="Name your save…" value={newName} maxLength={30}
                 onChange={(e) => setNewName(e.target.value)} />
          <button onClick={() => { onCreate(newName); setNewName(''); }}>Create</button>
        </div>
      </section>

      <section className="panel-section">
        <h3>All saves</h3>
        <ul className="save-list">
          {saves.map((s) => {
            const live = s.id === save.id ? save : s;
            return (
              <li key={s.id} className={s.id === save.id ? 'current' : ''}>
                <div>
                  <strong>{live.name}</strong>
                  <div className="dim">
                    {formatPlay(live.playSeconds)} played · {live.goldEarned} gold earned
                  </div>
                </div>
                <div className="row">
                  <button disabled={s.id === save.id} onClick={() => onLoad(s.id)}>Play</button>
                  <button onClick={() => onDelete(s.id)}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/* for pantry */
export function PantryPanel({ ingredients, save, onBuy }) {
  return (
    <>
      <p>Your purse: <strong>🪙 {save.gold}</strong></p>
      <div className="card-grid">
        {ingredients.map((ing) => (
          <div className="card" key={ing.id}>
            <div className="row">
              <img src={ing.icon} alt="" />
              <div>
                <strong>{ing.name}</strong> <TagBadge tag={ing.tag} />
                <div className="dim">Owned: {save.inventory[ing.id] || 0}</div>
              </div>
            </div>
            <p>{ing.description}</p>
            <button data-sfx="none" disabled={save.gold < ing.price} onClick={() => onBuy(ing)}>
              Buy · 🪙 {ing.price}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

/* for recipe book */
export function RecipePanel({ ingredients, save, onCreate, onUpdate, onDelete }) {
  const [tag, setTag] = useState('bloom');
  const [name, setName] = useState('');
  const [picks, setPicks] = useState(['', '', '']);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');

  const byId = Object.fromEntries(ingredients.map((i) => [i.id, i]));
  // ingredients you own, plus any already picked (so editing an old recipe still shows its ingredients)
  const options = ingredients.filter((i) => (save.inventory[i.id] || 0) > 0 || picks.includes(i.id));

  const resetForm = () => { setEditingId(null); setName(''); setPicks(['', '', '']); setTag('bloom'); };

  const startEdit = (r) => {
    setEditingId(r.id);
    setName(r.name);
    setTag(r.tag);
    setPicks([...r.ingredients]);
    setMsg('');
  };

  const submit = async () => {
    if (!name.trim()) return setMsg('Give your creation a name.');
    if (picks.some((p) => !p)) return setMsg('Choose three ingredients.');
    if (!picks.some((p) => byId[p].tag === tag)) {
      return setMsg(`At least one ingredient must be a ${TAGS[tag].label} ingredient.`);
    }
    const data = { name: name.trim(), tag, ingredients: picks };
    const err = editingId ? await onUpdate(editingId, data) : await onCreate(data);
    setMsg(err || (editingId ? 'Recipe updated!' : 'Recipe written in your book!'));
    if (!err) resetForm();
  };

  const handleDelete = async (id) => {
    const deleted = await onDelete(id);
    if (deleted && editingId === id) resetForm();
  };

  return (
    <>
      <section className="panel-section">
        <h3>{editingId ? 'Edit recipe' : 'Write a new recipe'}</h3>
        <div className="row wrap">
          {Object.entries(TAGS).map(([key, t]) => (
            <button key={key} className={tag === key ? 'selected' : ''} onClick={() => setTag(key)}>
              {t.label} · {t.purpose}
            </button>
          ))}
        </div>
        <div className="row">
          <input type="text" placeholder="Name your recipe…" value={name} maxLength={30}
                 onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="row wrap">
          {picks.map((p, i) => (
            <select key={i} value={p}
                    onChange={(e) => setPicks(picks.map((x, j) => (j === i ? e.target.value : x)))}>
              <option value="">Ingredient {i + 1}…</option>
              {options.map((ing) => (
                <option key={ing.id} value={ing.id}>{ing.name} ({TAGS[ing.tag].label})</option>
              ))}
            </select>
          ))}
        </div>
        <p className="dim">Needs 3 ingredients, at least one matching the type you chose.</p>
        <div className="row">
          <button onClick={submit}>{editingId ? 'Save changes' : 'Add to recipe book'}</button>
          {editingId && <button onClick={() => { resetForm(); setMsg(''); }}>Cancel</button>}
        </div>
        {msg && <p><em>{msg}</em></p>}
      </section>

      <section className="panel-section">
        <h3>Your recipes</h3>
        {save.recipes.length === 0 && <p className="dim">No recipes yet.</p>}
        <ul className="save-list">
          {save.recipes.map((r) => (
            <li key={r.id} className={editingId === r.id ? 'current' : ''}>
              <div>
                <strong>{r.name}</strong> <TagBadge tag={r.tag} />
                <div className="dim">{TAGS[r.tag].purpose}</div>
              </div>
              <div className="row">
                {r.ingredients.map((id, i) => (
                  <img key={i} className="mini-icon" src={byId[id]?.icon} alt={byId[id]?.name} title={byId[id]?.name} />
                ))}
                <button onClick={() => startEdit(r)}>Edit</button>
                <button onClick={() => handleDelete(r.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/* for familiar faces */
export function FacesPanel({ customers }) {
  return (
    <div className="card-grid">
      {customers.map((c) => (
        <div className="card face" key={c.id}>
          <img src={`${c.imageBase}_neutral.svg`} alt={c.name} />
          <strong>{c.name}</strong>
          <p>{c.description}</p>
        </div>
      ))}
    </div>
  );
}

/* for settings */
export function SettingsPanel({ settings, onChange, onReplayIntro }) {
  return (
    <div className="settings">
      <label>
        Music volume
        <input type="range" min="0" max="1" step="0.01" value={settings.musicVolume}
               onChange={(e) => onChange({ musicVolume: Number(e.target.value) })} />
      </label>
      <label>
        Sound effects volume
        <input type="range" min="0" max="1" step="0.01" value={settings.sfxVolume}
               onChange={(e) => onChange({ sfxVolume: Number(e.target.value) })} />
      </label>
      <label>
        Voice volume
        <input type="range" min="0" max="1" step="0.01" value={settings.voiceVolume}
               onChange={(e) => onChange({ voiceVolume: Number(e.target.value) })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.blips} onChange={(e) => onChange({ blips: e.target.checked })} />
        Customer voice blips
      </label>
      <label>
        Text speed
        <select value={settings.textSpeed} onChange={(e) => onChange({ textSpeed: e.target.value })}>
          <option value="slow">Slow</option>
          <option value="normal">Normal</option>
          <option value="fast">Fast</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.autosave} onChange={(e) => onChange({ autosave: e.target.checked })} />
        Autosave
      </label>
      <label className="check">
        <input type="checkbox" checked={settings.reduceMotion} onChange={(e) => onChange({ reduceMotion: e.target.checked })} />
        Reduce motion (stops the floating title)
      </label>
      <button onClick={onReplayIntro}>Replay intro</button>
    </div>
  );
}