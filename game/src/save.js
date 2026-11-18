// save.js — Rico's life, kept in localStorage: cash, story progress, the
// garage, armour and ammo, and where he woke up. Versioned so a future build
// never chokes on an old life.
const KEY = 'azahar-heat-save-v1';

export const defaultSave = () => ({
  cash: 120,
  missionIndex: 0,        // next story mission to offer
  completed: [],          // mission ids done
  garage: [],             // owned car type ids
  armour: 0,
  ammo: 24,
  hasPistol: false,
  position: { x: -452, z: 96, heading: 2.2 },
  playSeconds: 0,
});

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.cash !== 'number') return null;
    return { ...defaultSave(), ...data };
  } catch {
    return null;
  }
}

export function storeSave(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* private mode: the street forgets */ }
}

export function wipeSave() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to wipe */ }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}
