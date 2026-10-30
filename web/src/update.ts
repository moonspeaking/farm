// Обновление игры: service worker скачивает новую версию в фоне и сам становится главным, но уже открытая страница
// остаётся на старом коде до перезагрузки — поэтому без этого модуля новая версия появлялась только со второго запуска.

let ready = false;
/** Перед перезагрузкой сохраняем игру. */
let beforeReload: () => void = () => undefined;
/** Можно ли перезагрузить страницу без спроса (игры ещё нет — мы в главном меню). */
let idle: () => boolean = () => true;

function reload() {
  try {
    beforeReload();
  } finally {
    location.reload();
  }
}

function banner() {
  if (document.getElementById("update")) return;
  const bar = document.createElement("div");
  bar.id = "update";
  const text = document.createElement("span");
  text.textContent = "Вышла новая версия игры. Обновить сейчас? Игра сохранится.";
  const yes = document.createElement("button");
  yes.textContent = "Обновить";
  yes.addEventListener("click", reload);
  const no = document.createElement("button");
  no.textContent = "Позже";
  no.className = "secondary";
  no.addEventListener("click", () => bar.remove());
  bar.append(text, yes, no);
  document.body.append(bar);
}

/** Новая версия уже активна: в меню перезагружаем сразу, во время игры спрашиваем. */
function updated() {
  ready = true;
  if (idle()) reload();
  else banner();
}

export function watchUpdates(opts: { idle: () => boolean; beforeReload: () => void }) {
  idle = opts.idle;
  beforeReload = opts.beforeReload;
  const sw = navigator.serviceWorker;
  if (!sw) return;
  // первая установка (контроллера не было) — не обновление
  const hadController = !!sw.controller;
  sw.addEventListener("controllerchange", () => {
    if (hadController && !ready) updated();
  });
  // открытое приложение (PWA) месяцами может не перезапускаться — при возврате в него ищем новую версию
  const check = () => void sw.getRegistration().then((r) => r?.update().catch(() => undefined));
  document.addEventListener("visibilitychange", () => !document.hidden && check());
  setInterval(check, 30 * 60_000);
}
