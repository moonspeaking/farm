// Предложение установить игру как приложение (PWA): значок на рабочем столе, запуск без адресной строки, работа без сети.
// Chrome, Edge, Samsung Internet дают событие beforeinstallprompt; Safari на iPhone/iPad его не знает — показываем подсказку, как добавить вручную.

import { KEYS, store } from "./storage";

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** После отказа не напоминаем столько дней. */
const SNOOZE_DAYS = 14;

let deferred: InstallEvent | null = null;
let installed = false;

// событие приходит иногда раньше, чем игра загрузилась, — слушаем с самого старта модуля
let offered = false;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferred = e as InstallEvent;
  // Chrome присылает событие только после установки service worker (при первом заходе — когда докачается вся игра), это может быть и через минуту
  if (offered && !installed && !standalone() && !snoozed() && !document.getElementById("install")) show(false);
});
window.addEventListener("appinstalled", () => {
  installed = true;
  deferred = null;
  document.getElementById("install")?.remove();
});

const standalone = () =>
  matchMedia("(display-mode: standalone)").matches ||
  matchMedia("(display-mode: fullscreen)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function snoozed() {
  const t = Number(store.get(KEYS.installAsked));
  return t > 0 && Date.now() - t < SNOOZE_DAYS * 86400_000;
}

function snooze() {
  store.set(KEYS.installAsked, String(Date.now()));
}

/** Показывает плашку «Установить игру», если приложение ещё не установлено и это возможно. Вызывается, когда игра загрузилась. */
export function offerInstall() {
  offered = true;
  if (installed || standalone() || snoozed() || document.getElementById("install")) return;
  // у Chrome событие может прийти чуть позже загрузки — ждём его несколько секунд
  const started = Date.now();
  const tryShow = () => {
    if (installed || standalone() || document.getElementById("install")) return;
    if (deferred) return show(false);
    if (ios()) return show(true);
    if (Date.now() - started < 6000) setTimeout(tryShow, 500);
  };
  tryShow();
}

function show(manual: boolean) {
  const bar = document.createElement("div");
  bar.id = "install";
  const text = document.createElement("span");
  text.textContent = manual
    ? "Установите игру на экран «Домой»: нажмите «Поделиться» и выберите «На экран “Домой”». Так она откроется без браузера и будет работать без сети."
    : "Установить «Ферму Айрис» на рабочий стол? Игра откроется без браузера и будет работать без сети.";
  bar.append(text);
  const close = () => bar.remove();
  if (!manual) {
    const yes = document.createElement("button");
    yes.textContent = "Установить";
    yes.addEventListener("click", async () => {
      close();
      const e = deferred;
      deferred = null;
      if (!e) return;
      await e.prompt();
      if ((await e.userChoice).outcome === "dismissed") snooze();
    });
    bar.append(yes);
  }
  const no = document.createElement("button");
  no.textContent = manual ? "Понятно" : "Не сейчас";
  no.className = "secondary";
  no.addEventListener("click", () => {
    snooze();
    close();
  });
  bar.append(no);
  document.body.append(bar);
}
