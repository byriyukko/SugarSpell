
import { useEffect, useMemo, useState } from 'react';
import Dialogue from './Dialogue';
import { SFX, playWhenAllowed } from './Sound';

const PAGES = [
  'Hear ye, hear ye! Welcome to Gilded Acorn, a village of cobbled lanes, curious folk, and the finest tavern in the realm: The Winking Wyvern Inn.',
  'You are the new brewer of SugarSpell, a little potion shop left to you by your grandmother, a witch whose sweet spells were whispered about across three kingdoms. The folks expect no less from her successor',
  'Just mind your step, dear successor. It would be a shame to disappoint them so soon.',
  'Villagers will come knocking with orders. Write recipes in your Recipe Book, drag ingredients from the shelf into the cauldron, and stir. Three ingredients make one potion.',
  'Serve each customer from your satchel before their patience runs dry, and earn gold to restock the Pantry. Now then, brewer... call your first customer!',
];

export default function IntroScroll({ speed, blipsOn, volume, onDone }) {
  const [page, setPage] = useState(0);
  const last = page === PAGES.length - 1;

  // fanfare when the scroll appears (waits for the first click if Chrome blocks it)
  useEffect(() => {
    const fanfare = new Audio(SFX.fanfare);
    fanfare.volume = volume;
    const stop = playWhenAllowed(fanfare);
    return () => { stop(); fanfare.pause(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dialogue = useMemo(
    () => ({ id: `intro-${page}`, speaker: 'The Scroll', text: PAGES[page], pitch: 300 }),
    [page]
  );

  return (
    <div className="intro-scroll">
      <Dialogue dialogue={dialogue} speed={speed} blipsOn={blipsOn} volume={volume} />
      <div className="intro-actions">
        <button onClick={onDone}>Skip</button>
        <button onClick={() => (last ? onDone() : setPage((p) => p + 1))}>{last ? 'Begin' : 'Next ▸'}</button>
      </div>
    </div>
  );
}