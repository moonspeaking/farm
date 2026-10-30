// Игроки (учётные записи), как в оригинале (profiles/users.id, last_logged_user.dat, profiles/N/adventure.game):
// у каждого своё сохранение и свои флаги подсказок (они лежат в сохранении), рекорды и опции общие.

export interface Profile {
  id: string;
  name: string;
}

interface Store {
  users: Profile[];
  current: string | null;
}

const KEY = "iris-farm-profiles";
/** Сохранения до появления игроков — при создании первого игрока переходят к нему. */
const LEGACY = ["iris-farm-save-v3", "iris-farm-save-v2"];
export const NAME_MAX = 20;

function read(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Store | null;
    if (s && Array.isArray(s.users)) return s;
  } catch {
    // нет хранилища или испорченная запись — игроков нет
  }
  return { users: [], current: null };
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // без хранилища (приватный режим) игроки живут до перезагрузки
  }
}

/** Ключ сохранения игрока: base — версия формата («iris-farm-save-v3»). */
export function saveKey(base: string, id: string) {
  return `${base}:${id}`;
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
    try {
      for (const base of LEGACY) {
        const v = localStorage.getItem(base);
        if (v === null) continue;
        localStorage.setItem(saveKey(base, id), v);
        localStorage.removeItem(base);
      }
    } catch {
      // нечего переносить
    }
  }
  write({ users: [...s.users, p], current: id });
  return p;
}

/** Удаляет игрока вместе с его сохранением; текущим становится первый оставшийся. */
export function deleteProfile(id: string) {
  const s = read();
  try {
    for (const base of LEGACY) localStorage.removeItem(saveKey(base, id));
  } catch {
    // нечего удалять
  }
  const users = s.users.filter((u) => u.id !== id);
  write({ users, current: s.current === id ? (users[0]?.id ?? null) : s.current });
}
