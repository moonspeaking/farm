// Обновление игры: service worker скачивает новую версию в фоне и сам становится главным, но уже открытая страница
// остаётся на старом коде до перезагрузки — поэтому без этого модуля новая версия появлялась только со второго запуска.
// Новая версия ищется только при запуске игры; во время игры проверок и вопросов нет.

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

export function watchUpdates(opts: { idle: () => boolean; beforeReload: () => void }) {
  idle = opts.idle;
  beforeReload = opts.beforeReload;
  const sw = navigator.serviceWorker;
  if (!sw) return;
  // первая установка (контроллера не было) — не обновление
  const hadController = !!sw.controller;
  let done = false;
  // новая версия, найденная при запуске, включилась: пока игрок в главном меню — перезагружаемся сразу,
  // а если игра уже идёт — ничего не делаем, новая версия заработает при следующем запуске
  sw.addEventListener("controllerchange", () => {
    if (!hadController || done) return;
    done = true;
    if (idle()) reload();
  });
  void sw.getRegistration().then((r) => r?.update().catch(() => undefined));
}
