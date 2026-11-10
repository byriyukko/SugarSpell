import { useEffect, useRef, useState } from 'react';
import { blip } from './Sound';

/** Tthey talk per letter, like eh eh eh eh */
export default function Dialogue({ dialogue, speed, blipsOn, volume }) {
  const [progress, setProgress] = useState({ id: null, count: 0 });
  const opts = useRef({ blipsOn, volume });

  useEffect(() => {
    opts.current = { blipsOn, volume };
  }, [blipsOn, volume]);

  useEffect(() => {
    if (!dialogue) return;
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setProgress({ id: dialogue.id, count: i });
      if (opts.current.blipsOn && /\S/.test(dialogue.text[i - 1] || '')) {
        blip(opts.current.volume, dialogue.pitch);
      }
      if (i >= dialogue.text.length) clearInterval(timer);
    }, speed);
    return () => clearInterval(timer);
  }, [dialogue, speed]);

  
  const shown = dialogue && progress.id === dialogue.id ? progress.count : 0;

  return (
    <div className="dialogue-box">
      {dialogue ? (
        <>
          <div className="dialogue-name">{dialogue.speaker}</div>
          <div className="dialogue-text">{dialogue.text.slice(0, shown)}</div>
        </>
      ) : (
        <div className="dialogue-text dim">Call a customer to begin…</div>
      )}
    </div>
  );
}