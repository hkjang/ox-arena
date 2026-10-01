import { rpc } from './supabase';
import type { Player } from './types';

interface Saved { id: string; token: string }
const key = (room: string) => `ox:player:${room}`;

export function loadSaved(room: string): Saved | null {
  try { return JSON.parse(localStorage.getItem(key(room)) ?? 'null'); } catch { return null; }
}
export function save(room: string, s: Saved) {
  try { localStorage.setItem(key(room), JSON.stringify(s)); } catch { /* ignore */ }
}
export function clearSaved(room: string) {
  try { localStorage.removeItem(key(room)); } catch { /* ignore */ }
}

export async function join(room: string, nickname: string, gender: 'M' | 'F') {
  const r = await rpc<{ player: Player; token: string }>('join_room', { p_room: room, p_nickname: nickname, p_gender: gender });
  save(room, { id: r.player.id, token: r.token });
  return r;
}

export async function resume(room: string): Promise<Saved | null> {
  const s = loadSaved(room);
  if (!s) return null;
  const p = await rpc<Player | null>('resume_player', { p_player: s.id, p_token: s.token });
  if (!p) { clearSaved(room); return null; }
  return s;
}

const ADMIN_KEY = 'ox:admin';
export const getAdminToken = () => { try { return localStorage.getItem(ADMIN_KEY); } catch { return null; } };
export const setAdminToken = (t: string | null) => {
  try { t ? localStorage.setItem(ADMIN_KEY, t) : localStorage.removeItem(ADMIN_KEY); } catch { /* ignore */ }
};
