// All persistence goes through here. On the web it's localStorage; inside the
// Capacitor iOS shell it's native Preferences, which iOS never evicts.
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export const isNative = Capacitor.isNativePlatform();
const STORAGE_KEY = "today-app-v1";
const SYNC_KEY = "today-app-sync";

const get = async (key) => {
  if (isNative) { const { value } = await Preferences.get({ key }); return value; }
  return localStorage.getItem(key);
};
const set = async (key, value) => {
  if (isNative) await Preferences.set({ key, value });
  else localStorage.setItem(key, value);
};
const del = async (key) => {
  if (isNative) await Preferences.remove({ key });
  else localStorage.removeItem(key);
};

export const loadState = async () => {
  try { const s = await get(STORAGE_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; }
};
export const saveState = async (st) => {
  try { await set(STORAGE_KEY, JSON.stringify(st)); } catch (e) {}
};
export const loadSync = async () => {
  try { return JSON.parse(await get(SYNC_KEY)) || {}; } catch (e) { return {}; }
};
export const saveSync = async (cfg) => {
  try { await set(SYNC_KEY, JSON.stringify(cfg)); } catch (e) {}
};
export const clearSync = async () => {
  try { await del(SYNC_KEY); } catch (e) {}
};

const COACH_KEY = "today-app-coach";
export const loadCoachKey = async () => { try { return (await get(COACH_KEY)) || ""; } catch (e) { return ""; } };
export const saveCoachKey = async (k) => { try { await set(COACH_KEY, k); } catch (e) {} };
export const clearCoachKey = async () => { try { await del(COACH_KEY); } catch (e) {} };
