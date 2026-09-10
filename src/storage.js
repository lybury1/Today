// All persistence goes through here so the web build (localStorage) and the
// native build (Capacitor Preferences) can differ without touching app code.
const STORAGE_KEY = "today-app-v1";
const SYNC_KEY = "today-app-sync";

export const loadState = async () => {
  try { const s = localStorage.getItem(STORAGE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
};
export const saveState = async (st) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(st)); } catch (e) {}
};
export const loadSync = async () => {
  try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; }
};
export const saveSync = async (cfg) => {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify(cfg)); } catch (e) {}
};
export const clearSync = async () => {
  try { localStorage.removeItem(SYNC_KEY); } catch (e) {}
};
