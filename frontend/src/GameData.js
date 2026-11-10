export const TAGS = {
  bloom:  { label: 'Bloom',  purpose: 'Healing' },
  blight: { label: 'Blight', purpose: 'Harming' },
  might:  { label: 'Might',  purpose: 'Enhancement' },
  wisp:   { label: 'Wisp',   purpose: 'Magic' },
};

export const formatPlay = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(sec % 60).padStart(2, '0')}s`;
};