import './App.css';

import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from './API';
import { SFX, playSfx, playWhenAllowed } from './Sound';
import IntroScroll from './IntroScroll';
import Modal from './Modal';
import Dialogue from './Dialogue';

import { TAGS } from './GameData';

import {
  SavePanel,
  PantryPanel,
  RecipePanel,
  FacesPanel,
  SettingsPanel
} from './Panels';

/*game constants */
const STIR_LOOP_MS = 2000;  
const STIR_LOOPS = 2;       
const ORDER_TIME = 60;     
const GOLD_CHANCE = 0.08;   
const MAX_CONTENTS = 3;      
const TEXT_SPEEDS = { slow: 60, normal: 35, fast: 15 };

const DEFAULT_SETTINGS = {
  musicVolume: 0.5,
  sfxVolume: 0.7,
  voiceVolume: 1,
  blips: true,
  textSpeed: 'normal',
  autosave: true,
  reduceMotion: false,
};
const loadSettings = () => {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('ss_settings')) }; }
  catch { return DEFAULT_SETTINGS; }
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const introKey = (id) => `ss_introSeen_${id}`;

function App() {
//whats in my db
  const [ingredients, setIngredients] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [save, setSave] = useState(null);       
  const [saves, setSaves] = useState([]);
  const [error, setError] = useState('');

//ui stuff
  const [panel, setPanel] = useState(null);
  const [settings, setSettings] = useState(loadSettings);
  const [toast, setToast] = useState('');
  const [result, setResult] = useState(null);
  const [showIntro, setShowIntro] = useState(false);

//all ab cauldron
  const [cauldronContents, setCauldronContents] = useState([]); 
  const [isOverCauldron, setIsOverCauldron] = useState(false);
  const [isStirring, setIsStirring] = useState(false);
  const [stirKey, setStirKey] = useState(0);
  const stirTimers = useRef([]);
  const stirAudio = useRef(null);

//all ab customers
  const [customer, setCustomer] = useState(null); 
  const [dialogue, setDialogue] = useState(null);
  const leaveTimer = useRef(null);
  const toastTimer = useRef(null);

//music
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const saveRef = useRef(null);
  useEffect(() => { saveRef.current = save; }, [save]);

  const formatTime = (time) => {
    if (!Number.isFinite(time)) return '0:00';
    return `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
  };

  const notify = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2500);
  };

  const closePanel = useCallback(() => setPanel(null), []);

 const finishIntro = () => {
  if (save) localStorage.setItem(introKey(save.id), '1');
  setShowIntro(false);
};

//sfx and music autoplay for wvyern
 
  const sfxVolumeRef = useRef(settings.sfxVolume);
  useEffect(() => { sfxVolumeRef.current = settings.sfxVolume; }, [settings.sfxVolume]);


  useEffect(() => {
    const onClick = (e) => {
      const el = e.target.closest?.('button, select, input[type="checkbox"]');
      if (!el || el.dataset.sfx === 'none') return;
      playSfx(SFX.click, sfxVolumeRef.current);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  
  const gameReady = Boolean(save) && ingredients.length > 0;
  useEffect(() => {
    if (!gameReady || !audioRef.current) return;
    return playWhenAllowed(audioRef.current);
  }, [gameReady]);

//saves n loads
  const refreshSaves = useCallback(async () => setSaves(await api.saves()), []);

  const persist = useCallback(async () => {
    const s = saveRef.current;
    if (!s) return;
    try {
      await api.saveState(s.id, {
        gold: s.gold, goldEarned: s.goldEarned, playSeconds: s.playSeconds,
        inventory: s.inventory, items: s.items,
      });
    } catch {
      setError('Could not save progress. Is the backend running?');
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [ing, cus, list] = await Promise.all([api.ingredients(), api.customers(), api.saves()]);
        setIngredients(ing);
        setCustomers(cus);
        const lastId = Number(localStorage.getItem('ss_lastSave'));
        const target = list.find((s) => s.id === lastId) || list[0];
        const loaded = target ? await api.getSave(target.id) : await api.createSave('Save 1');
        setSave(loaded);
        setShowIntro(!localStorage.getItem(introKey(loaded.id)));
        setSaves(await api.saves());
      } catch {
        setError('Cannot reach the SugarSpell server. Is the backend running?');
      }
    })();
  }, []);

  useEffect(() => { if (save?.id) localStorage.setItem('ss_lastSave', String(save.id)); }, [save?.id]);

  // playtime counter
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      setSave((s) => (s ? { ...s, playSeconds: s.playSeconds + 1 } : s));
    }, 1000);
    return () => clearInterval(t);
  }, []);


  useEffect(() => {
    if (!settings.autosave) return;
    const t = setInterval(persist, 30000);
    return () => clearInterval(t);
  }, [settings.autosave, persist]);

  useEffect(() => {
    if (!settings.autosave || !save) return;
    const t = setTimeout(persist, 800);
    return () => clearTimeout(t);

  }, [save?.gold, save?.inventory, save?.items, settings.autosave]);


  useEffect(() => { localStorage.setItem('ss_settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = settings.musicVolume; }, [settings.musicVolume]);
  const updateSettings = (patch) => setSettings((s) => ({ ...s, ...patch }));


  useEffect(() => () => {
    stirTimers.current.forEach(clearTimeout);
    clearTimeout(leaveTimer.current);
    clearTimeout(toastTimer.current);
  }, []);

 const switchTo = async (fullSave) => {
  stirTimers.current.forEach(clearTimeout);
  clearTimeout(leaveTimer.current);
  setIsStirring(false);
  setCauldronContents([]);
  setCustomer(null);
  setDialogue(null);
  setSave(fullSave);
  setShowIntro(!localStorage.getItem(introKey(fullSave.id)));
  await refreshSaves();
};

  

//pop up save actions
  const handleSaveNow = async () => { await persist(); await refreshSaves(); notify('Progress saved!'); };

  const handleCreateSave = async (name) => {
    await persist();
    await switchTo(await api.createSave(name));
    closePanel();
    notify('New save created');
  };

  const handleLoadSave = async (id) => {
    await persist();
    await switchTo(await api.getSave(id));
    notify('Save loaded');
  };

  const handleDeleteSave = async (id) => {
    if (!window.confirm('Delete this save forever?')) return;
    await api.deleteSave(id);
    if (id === save.id) {
      const list = await api.saves();
      await switchTo(list.length ? await api.getSave(list[0].id) : await api.createSave('Save 1'));
    } else {
      await refreshSaves();
    }
  };

  const handleRename = async (name) => {
    if (!name.trim()) return;
    await api.renameSave(save.id, name);
    setSave((s) => ({ ...s, name: name.trim() }));
    await refreshSaves();
  };

//pantry n recipe book
  const handleBuy = (ing) => {
    if (save.gold < ing.price) return;
    playSfx(SFX.coin, settings.sfxVolume);
    setSave((s) => ({
      ...s,
      gold: s.gold - ing.price,
      inventory: { ...s.inventory, [ing.id]: (s.inventory[ing.id] || 0) + 1 },
    }));
  };

  const handleCreateRecipe = async (data) => {
    try {
      const recipe = await api.createRecipe(save.id, data);
      setSave((s) => ({ ...s, recipes: [...s.recipes, recipe] }));
      return null;
    } catch (e) {
      return e.message;
    }
  };

  const handleUpdateRecipe = async (recipeId, data) => {
  try {
    const recipe = await api.updateRecipe(save.id, recipeId, data);
    setSave((s) => ({ ...s, recipes: s.recipes.map((r) => (r.id === recipeId ? recipe : r)) }));
    setCustomer((c) => (c && c.recipe.id === recipeId ? { ...c, recipe } : c));
    return null;
  } catch (e) {
    return e.message;
  }
};

const handleDeleteRecipe = async (recipeId) => {
  if (customer?.phase === 'waiting' && customer.recipe.id === recipeId) {
    notify('A customer is waiting for that recipe!');
    return false;
  }
  if (!window.confirm('Delete this recipe? Any potions of it in your satchel will be lost.')) return false;
  try {
    await api.deleteRecipe(save.id, recipeId);
    setSave((s) => {
      const items = { ...s.items };
      delete items[recipeId];
      return { ...s, recipes: s.recipes.filter((r) => r.id !== recipeId), items };
    });
    return true;
  } catch (e) {
    notify(e.message);
    return false;
  }
};

//cauldron
  const available = (id) => (save.inventory[id] || 0) - cauldronContents.filter((x) => x === id).length;

  const handleDragStart = (e, id) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsOverCauldron(false);
    if (isStirring) return;
    const id = e.dataTransfer.getData('text/plain');
    if (!ingredients.some((i) => i.id === id)) return;
    if (cauldronContents.length >= MAX_CONTENTS) return notify('The cauldron is full (3 ingredients max).');
    if (available(id) <= 0) return notify('You are out of that ingredient. Visit the Pantry!');
    setCauldronContents((prev) => [...prev, id]);
  };

  const handleEmpty = () => {
    stirTimers.current.forEach(clearTimeout);
    stirAudio.current?.pause();
    setIsStirring(false);
    setCauldronContents([]);
  };

  const finishStir = (contents) => {
    const s = saveRef.current;
    const key = [...contents].sort().join('|');
    const recipe = contents.length === MAX_CONTENTS &&
      s.recipes.find((r) => [...r.ingredients].sort().join('|') === key);

    const inventory = { ...s.inventory };
    contents.forEach((id) => { inventory[id] = Math.max(0, (inventory[id] || 0) - 1); });
    const next = { ...s, inventory };
    let outcome;

    if (recipe) {
      next.items = { ...s.items, [recipe.id]: (s.items[recipe.id] || 0) + 1 };
      outcome = { title: 'Success!', text: `You brewed "${recipe.name}"! It's in your satchel.` };
    } else if (Math.random() < GOLD_CHANCE) {
      const g = 5 + Math.floor(Math.random() * 11);
      next.gold = s.gold + g;
      next.goldEarned = s.goldEarned + g;
      outcome = { title: 'Lucky!', text: `The mixture hardened into ${g} gold coins!` };
    } else {
      outcome = {
        title: 'Failed…',
        text: contents.length < MAX_CONTENTS
          ? 'The brew fizzles into smoke. (Recipes need exactly 3 ingredients.)'
          : 'The brew fizzles into smoke. You have no recipe for that mix.',
      };
    }
    setSave(next);
    setCauldronContents([]);
    setIsStirring(false);
    setResult(outcome);
  };

  const handleStir = () => {
    if (!cauldronContents.length || isStirring) return;
    const contents = [...cauldronContents];
    setIsStirring(true);
    setStirKey((k) => k + 1);
    stirAudio.current = playSfx(SFX.stir, settings.sfxVolume);

    // for the stirring cauldron gif
    stirTimers.current = [];
    for (let i = 1; i < STIR_LOOPS; i += 1) {
      stirTimers.current.push(setTimeout(() => setStirKey((k) => k + 1), i * STIR_LOOP_MS));
    }
    stirTimers.current.push(setTimeout(() => finishStir(contents), STIR_LOOPS * STIR_LOOP_MS));

    if (customer?.phase === 'waiting' && Math.random() < 0.5) say(customer.data, pick(customer.data.lines.quips));
  };

  let cauldronImage = '/images/emptyCauldron.svg';
  if (isStirring) cauldronImage = `/images/stirringCauldron.gif?v=${stirKey}`;
  else if (cauldronContents.length > 0) cauldronImage = '/images/filledCauldron.svg';

  /* ============================ customers ============================ */
  const say = (data, text) =>
    setDialogue({ id: `${Date.now()}-${Math.random()}`, speaker: data.name, text, pitch: data.voice });

  const callNext = () => {
    if (customer) return;
    if (showIntro) finishIntro();
    if (!save.recipes.length) return notify('Write a recipe in the Recipe Book first!');
    if (!customers.length) return;
    const data = pick(customers);
    const recipe = pick(save.recipes);
    setCustomer({ data, phase: 'waiting', recipe, timeLeft: ORDER_TIME });
    say(data, `${pick(data.lines.greet)} ${pick(data.lines.order).replace('{item}', recipe.name)}`);
  };

  const finishCustomer = (success) => {
    const c = customer;
    playSfx(success ? SFX.correct : SFX.late, settings.sfxVolume);
    setCustomer({ ...c, phase: success ? 'happy' : 'angry', emote: success ? 'happy' : 'angry', emoteKey: Date.now() });
    say(c.data, pick(success ? c.data.lines.thanks : c.data.lines.angry));
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => setCustomer(null), 6000);
  };

  // order countdown
  useEffect(() => {
    if (customer?.phase !== 'waiting') return;
    const t = setInterval(
      () => setCustomer((c) => (c && c.phase === 'waiting' ? { ...c, timeLeft: c.timeLeft - 1 } : c)),
      1000
    );
    return () => clearInterval(t);
  }, [customer?.phase]);


  useEffect(() => {
    if (customer?.phase !== 'waiting') return;
    if (customer.timeLeft <= 0) finishCustomer(false);
    else if (customer.timeLeft === 40 || customer.timeLeft === 20) say(customer.data, pick(customer.data.lines.quips));
  
  }, [customer?.timeLeft, customer?.phase]);

  const serve = (recipeId) => {
    if (customer?.phase !== 'waiting') return notify('No customer is waiting.');

    if (recipeId !== customer.recipe.id) {
      playSfx(SFX.wrong, settings.sfxVolume);
      setCustomer((c) => ({ ...c, emote: 'disappointed', emoteKey: Date.now() }));
      setTimeout(
        () => setCustomer((c) => (c && c.phase === 'waiting' && c.emote === 'disappointed' ? { ...c, emote: null } : c)),
        2000
      );
      return say(customer.data, pick(customer.data.lines.wrong?.length ? customer.data.lines.wrong : ["That's not what I ordered!"]));
    }

    const reward = 15 + Math.ceil(customer.timeLeft / 3);
    setSave((s) => ({
      ...s,
      gold: s.gold + reward,
      goldEarned: s.goldEarned + reward,
      items: { ...s.items, [recipeId]: s.items[recipeId] - 1 },
    }));
    finishCustomer(true);
    notify(`+${reward} gold`);
  };

//actual html territory
  if (!save || !ingredients.length) {
    return <div className="game-layout"><p className="boot-msg">{error || 'Loading SugarSpell…'}</p></div>;
  }

  const playerMood = customer?.phase === 'happy' ? 'happy' : customer?.phase === 'angry' ? 'angry' : 'neutral';
  const satchel = save.recipes.filter((r) => (save.items[r.id] || 0) > 0);

  return (
    <div className={`game-layout ${settings.reduceMotion ? 'reduce-motion' : ''}`}>

      <div className="leftside-dashboard">

        <div className="title-container">
          <h1 className="game-title">
            <span className="sparkle">˖✦ ݁.</span>
            SugarSpell
            <span className="sparkle">.✦ ݁˖</span>
          </h1>
          <img src="/images/Heart2.svg" className="title-decoration" alt="Heart decoration" />
        </div>

        <div className="dashboard-buttons">
          <button onClick={() => setPanel('save')}>Save</button>
          <button onClick={() => setPanel('pantry')}>Pantry</button>
          <button onClick={() => setPanel('recipes')}>Recipe Book</button>
          <button onClick={() => setPanel('faces')}>Familiar Faces</button>
          <button onClick={() => setPanel('settings')}>Settings</button>
        </div>

        <div className="music-player">
          <audio
            ref={audioRef}
            src="/audio/Winking.mp3"
            loop
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
            onLoadedMetadata={(e) => { setDuration(e.target.duration); e.target.volume = settings.musicVolume; }}
          />

          <div className="music-info">
            <span className="music-icon">♫</span>
            <div>
              <h4>The Winking Wyvern Inn</h4>
              <p>Melantos</p>
            </div>
          </div>

          <div className="music-progress">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range" min="0" max={duration || 1} value={currentTime}
              onChange={(e) => { audioRef.current.currentTime = Number(e.target.value); }}
            />
            <span>{formatTime(duration)}</span>
          </div>

          <div className="music-controls">
            <button onClick={() => { const a = audioRef.current; if (a.paused) a.play(); else a.pause(); }}>
              {isPlaying ? 'Ⅱ' : '▶'}
            </button>
            <input
              className="volume-control" type="range" min="0" max="1" step="0.01"
              value={settings.musicVolume}
              onChange={(e) => updateSettings({ musicVolume: Number(e.target.value) })}
            />
            <span>♫</span>
          </div>
        </div>
      </div>

      <div className="game-screen">
        <div className="hud-gold">🪙 {save.gold}</div>

        <div className="player-profile">
          <img src={`/images/player/player_${playerMood}.svg`} alt="You" />
        </div>

        {customer?.phase === 'waiting' && (
          <div className="order-timer">
            Order: {customer.recipe.name} · {customer.timeLeft}s
            <div className="order-timer-bar">
              <div
                className={`order-timer-fill ${customer.timeLeft <= 15 ? 'low' : ''}`}
                style={{ width: `${(customer.timeLeft / ORDER_TIME) * 100}%` }}
              />
            </div>
          </div>
        )}

        {customer && (
          <div className="customer">
            {customer.emote && (
              <img
                key={`${customer.emote}-${customer.emoteKey}`}
                className="emote"
                src={`/images/emotes/${customer.emote}.svg`}
                alt=""
              />
            )}
            <img
              className="customer-sprite"
              src={`${customer.data.imageBase}_${customer.phase === 'waiting' ? 'neutral' : customer.phase}.svg`}
              alt={customer.data.name}
            />
          </div>
        )}

        {satchel.length > 0 && (
          <div className="satchel">
            <span>Satchel</span>
            {satchel.map((r) => (
              <button key={r.id} data-sfx="none" onClick={() => serve(r.id)} title="Give to customer">
                {r.name} ×{save.items[r.id]}
              </button>
            ))}
          </div>
        )}

        <button className="call-btn" onClick={callNext} disabled={!!customer}>
          Call Next Customer
        </button>
      </div>

      <div className="crafting-area">
        <div className="shelf-section">
          {showIntro ? (
            <IntroScroll
              speed={TEXT_SPEEDS[settings.textSpeed]}
              blipsOn={settings.blips}
              volume={settings.voiceVolume}
              onDone={finishIntro}
            />
          ) : (
            <Dialogue
              dialogue={dialogue}
              speed={TEXT_SPEEDS[settings.textSpeed]}
              blipsOn={settings.blips}
              volume={settings.voiceVolume}
            />
          )}

          <p>Ingredient Shelf</p>

          <div className="shelf">
            {ingredients.map((ing) => {
              const left = available(ing.id);
              return (
                <div
                  className={`shelf-slot ${left <= 0 ? 'empty' : ''}`}
                  key={ing.id}
                  title={`${ing.name} (${TAGS[ing.tag].label})`}
                >
                  <img
                    src={ing.icon}
                    alt={ing.name}
                    className="ingredient-icon"
                    draggable={left > 0}
                    onDragStart={(e) => handleDragStart(e, ing.id)}
                  />
                  <span className="slot-count">{left}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="cauldron">
          <h3>Cauldron</h3>

          <div
            className={`cauldron-container ${isOverCauldron ? 'drop-active' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setIsOverCauldron(true); }}
            onDragLeave={() => setIsOverCauldron(false)}
            onDrop={handleDrop}
          >
            <img
              src={cauldronImage}
              className="emptyCauldron"
              alt={isStirring ? 'Stirring cauldron' : cauldronContents.length > 0 ? 'Filled cauldron' : 'Empty cauldron'}
            />
          </div>

          <div className="cauldron-contents">
            {cauldronContents.map((id, i) => {
              const ing = ingredients.find((x) => x.id === id);
              return <img key={i} src={ing.icon} alt={ing.name} title={ing.name} />;
            })}
          </div>

          <div className="cauldronOptions">
            <button onClick={handleStir} disabled={cauldronContents.length === 0 || isStirring}>
              Stir the Cauldron
            </button>
            <button onClick={handleEmpty}>Empty</button>
          </div>
        </div>
      </div>

      {/* POPUPS*/}
      {panel === 'save' && (
        <Modal title="Save" onClose={closePanel}>
          <SavePanel
            save={save} saves={saves}
            onSaveNow={handleSaveNow} onCreate={handleCreateSave} onLoad={handleLoadSave}
            onDelete={handleDeleteSave} onRename={handleRename}
          />
        </Modal>
      )}
      {panel === 'pantry' && (
        <Modal title="Pantry" onClose={closePanel}>
          <PantryPanel ingredients={ingredients} save={save} onBuy={handleBuy} />
        </Modal>
      )}
      {panel === 'recipes' && (
        <Modal title="Recipe Book" onClose={closePanel}>
          <RecipePanel
          ingredients={ingredients}
          save={save}
          onCreate={handleCreateRecipe}
           onUpdate={handleUpdateRecipe}
           onDelete={handleDeleteRecipe}
          />
        </Modal>
      )}
      {panel === 'faces' && (
        <Modal title="Familiar Faces" onClose={closePanel}>
          <FacesPanel customers={customers} />
        </Modal>
      )}
      {panel === 'settings' && (
        <Modal title="Settings" onClose={closePanel}>
          <SettingsPanel
            settings={settings}
            onChange={updateSettings}
            onReplayIntro={() => { setPanel(null); setShowIntro(true); }}
          />
        </Modal>
      )}
      {result && (
        <Modal title={result.title} onClose={() => setResult(null)}>
          <p>{result.text}</p>
          <button onClick={() => setResult(null)}>OK</button>
        </Modal>
      )}

      {toast && <div className="toast">{toast}</div>}
      {error && <div className="toast error" onClick={() => setError('')}>{error}</div>}
    </div>
  );
}

export default App;