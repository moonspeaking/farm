// Игроки (учётные записи), как в оригинале (profiles/users.id, last_logged_user.dat, profiles/N/adventure.game):
// у каждого своё сохранение и свои флаги подсказок (они лежат в сохранении), рекорды и опции общие.

export interface Profile {
  id: string;
  name: string;
}

import { KEYS, saveKey, store } from "./storage";

interface Store {
  users: Profile[];
  current: string | null;
}

/** Сохранения до появления игроков — при создании первого игрока переходят к нему. */
const LEGACY = [KEYS.saveV3, KEYS.saveV2];
export const NAME_MAX = 20;

function read(): Store {
  const s = store.getJson<Store>(KEYS.profiles);
  return s && Array.isArray(s.users) ? s : { users: [], current: null };
}

function write(s: Store) {
  store.setJson(KEYS.profiles, s);
}

export function profiles(): Profile[] {
  return read().users;
}

export function currentProfile(): Profile | null {
  const s = read();
  return s.users.find((u) => u.id === s.current) ?? null;
}

export function selectProfile(id: string) {
  const s = read();
  if (s.users.some((u) => u.id === id)) write({ ...s, current: id });
}

/** Новый игрок становится текущим. Имя обрезается по краям; пустое или занятое — null. */
export function createProfile(raw: string): Profile | null {
  const name = raw.trim().slice(0, NAME_MAX);
  const s = read();
  if (!name || s.users.some((u) => u.name.toLowerCase() === name.toLowerCase())) return null;
  const id = String(s.users.reduce((m, u) => Math.max(m, Number(u.id) + 1), 0));
  const p = { id, name };
  // самый первый игрок забирает сохранение, сделанное до появления игроков
  if (!s.users.length) {
    for (const base of LEGACY) {
      const v = store.get(base);
      if (v === null) continue;
      store.set(saveKey(base, id), v);
      store.remove(base);
    }
  }
  write({ users: [...s.users, p], current: id });
  return p;
}

/** Удаляет игрока вместе с его сохранением; текущим становится первый оставшийся. */
export function deleteProfile(id: string) {
  const s = read();
  for (const base of LEGACY) store.remove(saveKey(base, id));
  const users = s.users.filter((u) => u.id !== id);
  write({ users, current: s.current === id ? (users[0]?.id ?? null) : s.current });
}
