// Единственное место, где игра обращается к хранилищу браузера. Всё лежит в localStorage сайта: установленное PWA
// использует то же хранилище, что и вкладка. Очистка кэша и истории его не трогает, а «Файлы cookie и данные сайтов» стирает.
// Если хранилища нет (приватный режим, запрет) или оно переполнено, значения живут в памяти до перезагрузки страницы.

/** Все ключи игры. Менять имена нельзя: под ними лежат сохранения на устройствах игроков. */
export const KEYS = {
  profiles: "iris-farm-profiles",
  options: "iris-farm-options",
  scores: "iris-farm-scores",
  installAsked: "install-asked",
  /** Сохранения: к ключу добавляется «:<id игрока>» (saveKey). Старые форматы нужны для переноса. */
  saveV3: "iris-farm-save-v3",
  saveV2: "iris-farm-save-v2",
} as const;

const mem = new Map<string, string>();

export const store = {
  get(key: string): string | null {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) return v;
    } catch {
      // хранилище недоступно — берём из памяти
    }
    return mem.get(key) ?? null;
  },

  /** false — в браузер записать не удалось, значение осталось только в памяти. */
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      mem.delete(key);
      return true;
    } catch {
      mem.set(key, value);
      return false;
    }
  },

  remove(key: string) {
    mem.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      // нечего удалять
    }
  },

  /** Значение как JSON; нет записи или она испорчена — null. */
  getJson<T>(key: string): T | null {
    const raw = store.get(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  setJson(key: string, value: unknown): boolean {
    return store.set(key, JSON.stringify(value));
  },
};

/** Ключ сохранения игрока: base — версия формата (KEYS.saveV3). */
export function saveKey(base: string, id: string) {
  return `${base}:${id}`;
}

/** Просим браузер не вычищать данные сайта при нехватке места. Ручную очистку это не отменяет. */
export function requestPersistence() {
  void navigator.storage?.persist?.().catch(() => undefined);
}

/** Флаги на время сеанса (закрытые подсказки): после закрытия вкладки забываются. */
export const sessionFlag = {
  get(name: string): boolean {
    try {
      return sessionStorage.getItem(name) === "1";
    } catch {
      return false;
    }
  },
  set(name: string) {
    try {
      sessionStorage.setItem(name, "1");
    } catch {
      // без хранилища подсказка просто покажется снова
    }
  },
};
