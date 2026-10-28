// Экраны оболочки: меню игры (game_menu), опции (options), рекорды (highscores), пауза.
import { Container, Graphics, Rectangle } from "pixi.js";
import { audio } from "./audio";
import { rgb } from "./popfont";
import type { Rules } from "./rules";
import { COLOR, dialog, H, image, pop, roundButton, textButton, W } from "./ui";

function shade(onTap?: () => void) {
  const s = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.45 });
  s.eventMode = "static";
  if (onTap) s.on("pointertap", onTap);
  return s;
}

/** Меню игры: «Вернуться», «Опции», «Выйти» на картинке game_menu (225×304). */
export function gameMenu(parent: Container, rules: Rules, actions: { options(): void; exit(): void; closed(): void }) {
  const layer = new Container();
  const t = rules.texts.game_menu;
  let alive = true;
  const dispose = () => {
    if (!alive) return;
    alive = false;
    layer.destroy({ children: true });
  };
  /** «Вернуться», щелчок мимо меню или Esc: меню закрыто, игра продолжается. */
  const close = () => {
    if (!alive) return;
    dispose();
    actions.closed();
  };
  layer.addChild(shade(close));
  const box = new Container();
  box.position.set((W - 225) / 2 + 40, (H - 304) / 2);
  box.addChild(image("game_menu_bg"));
  // позиции кнопок из game_menu: back (38; 34), options (69; 105), exit (62; 206); ширины 148 / 83 / 93, высота 34
  const item = (text: string, x: number, y: number, w: number, fn: () => void) => {
    const b = textButton(text, fn);
    b.position.set(x + w / 2, y + 17);
    box.addChild(b);
  };
  item(t.game_menu_back ?? "Вернуться", 38, 34, 148, close);
  item(t.game_menu_options ?? "Опции", 69, 105, 83, () => {
    dispose();
    actions.options();
  });
  item(t.game_menu_exit ?? "Выйти", 62, 206, 93, () => {
    dispose();
    actions.exit();
  });
  layer.addChild(box);
  parent.addChild(layer);
  return close;
}

/** Окно опций 346×450: громкость музыки и звуков, полный экран, особые курсоры, предупреждения. */
export function optionsScreen(parent: Container, rules: Rules, onClose: () => void) {
  const layer = new Container();
  const t = rules.texts.options;
  const original = { ...audio.options };
  const cur = { ...audio.options };
  const done = (keep: boolean) => {
    if (!keep) audio.setOptions(original);
    layer.destroy({ children: true });
    onClose();
  };
  layer.addChild(shade());
  const box = new Container();
  box.position.set((W - 346) / 2, (H - 450) / 2);
  box.addChild(image("options_bg"));
  const title = pop(t.title ?? "Опции", "TC4_16_en", COLOR.white, { align: "center", scale: 1.15 });
  title.position.set(173, 37);
  box.addChild(title);

  const label = (text: string, x: number, y: number, align: "left" | "center" = "center", wrap?: number) => {
    const l = pop(text, "BritannicBold14", rgb(40, 28, 12), { align, wrap, lineOffset: -4, scale: 0.8 });
    l.position.set(x, y);
    box.addChild(l);
    return l;
  };
  // ползунок: дорожка 60…286 по x; thumb 24×24
  const slider = (y: number, value: number, set: (v: number) => void) => {
    const x0 = 92;
    const x1 = 232;
    const track = new Graphics().roundRect(x0, y + 8, x1 - x0 + 24, 8, 4).fill(0x4a3a1c).stroke({ color: 0xe6c178, width: 2 });
    const thumb = image("options_thumb");
    thumb.position.set(x0 + (x1 - x0) * value, y + 0);
    thumb.eventMode = "static";
    thumb.cursor = "pointer";
    let drag = false;
    const move = (gx: number) => {
      const p = box.toLocal({ x: gx, y: 0 });
      const v = Math.max(0, Math.min(1, (p.x - 12 - x0) / (x1 - x0)));
      thumb.x = x0 + (x1 - x0) * v;
      set(v);
    };
    thumb.on("pointerdown", () => (drag = true));
    layer.eventMode = "static";
    layer.hitArea = new Rectangle(0, 0, W, H);
    layer.on("globalpointermove", (e) => drag && move(e.global.x));
    layer.on("pointerup", () => (drag = false));
    layer.on("pointerupoutside", () => (drag = false));
    track.eventMode = "static";
    track.on("pointerdown", (e) => move(e.global.x));
    box.addChild(track, thumb);
  };
  label(t.music ?? "Музыка", 173, 84);
  slider(106, cur.music, (v) => {
    cur.music = v;
    audio.setOptions({ ...cur });
  });
  label(t.sound ?? "Звуки", 173, 134);
  slider(156, cur.sound, (v) => {
    cur.sound = v;
    audio.setOptions({ ...cur });
    audio.play("flower_get");
  });

  // флажки: x = 221, y — из XML (check_fullscreen 178, check_custom_cursor 248, check_game_warnings 283)
  const check = (text: string, top: number, get: () => boolean, set: (v: boolean) => void) => {
    const l = label(text, 112, top, "left", 140);
    const cy = top + l.textHeight / 2 - 12; // флажок по центру своей надписи
    const on = image("options_check");
    const off = image("options_check_off");
    for (const s of [on, off]) s.position.set(80, cy);
    box.addChild(off, on);
    const sync = () => {
      on.visible = get();
      off.visible = !get();
    };
    off.eventMode = on.eventMode = "static";
    off.cursor = on.cursor = "pointer";
    for (const s of [on, off]) s.on("pointertap", () => (set(!get()), sync()));
    sync();
    return sync;
  };
  const fullscreenCheck = check(t.fullscreen ?? "На весь экран", 190, () => !!document.fullscreenElement, (v) => {
    if (v) void document.documentElement.requestFullscreen?.().catch(() => undefined);
    else void document.exitFullscreen?.().catch(() => undefined);
  });
  // полный экран включается не мгновенно (и клавишей F тоже) — флажок обновляется, когда режим действительно сменился
  document.addEventListener("fullscreenchange", fullscreenCheck);
  layer.once("destroyed", () => document.removeEventListener("fullscreenchange", fullscreenCheck));
  check(t.custom_cursor ?? "Специальные Курсоры", 212, () => cur.cursors, (v) => {
    cur.cursors = v;
    audio.setOptions({ ...cur });
  });
  check(t.game_warnings ?? "Предупреждения в игре", 248, () => cur.warnings, (v) => {
    cur.warnings = v;
    audio.setOptions({ ...cur });
  });

  check("Блестки", 308, () => cur.sparkles, (v) => {
    cur.sparkles = v;
    audio.setOptions({ ...cur });
  });
  check("Итоги дня", 286, () => cur.dayStats, (v) => {
    cur.dayStats = v;
    audio.setOptions({ ...cur });
  });

  const ok = textButton(rules.texts.buttons.ok ?? "OK", () => done(true));
  ok.position.set(115, 375);
  const cancel = textButton(rules.texts.buttons.cancel ?? "Отмена", () => done(false));
  cancel.position.set(235, 375);
  box.addChild(ok, cancel);
  layer.addChild(box);
  parent.addChild(layer);
}

// ---------------------------------------------------------------- рекорды

export interface Score {
  name: string;
  days: number;
  money: number;
  /** Текущая игра — помечается значком «В Игре». */
  current?: boolean;
}

const SCORES_KEY = "iris-farm-scores";

export function loadScores(rules: Rules): Score[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SCORES_KEY) ?? "null") as Score[] | null;
    if (raw) return raw;
  } catch {
    // без хранилища показываем стандартную таблицу
  }
  return rules.default_scores.map((s) => ({ ...s }));
}

/** Записывает результат игры в таблицу (одна запись на игру); возвращает таблицу. */
export function recordScore(rules: Rules, name: string, days: number, money: number, finished: boolean): Score[] {
  const table = loadScores(rules).filter((s) => !s.current);
  table.push({ name, days, money, current: !finished });
  table.sort((a, b) => b.money - a.money || b.days - a.days);
  const top = table.slice(0, 10);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(top));
  } catch {
    // нечего сохранять
  }
  return top;
}

export function highscoresScreen(parent: Container, rules: Rules, onClose: () => void) {
  const layer = new Container();
  const t = rules.texts.headers;
  layer.addChild(image("highscores_bg"));
  const caption = pop(t.highscore_header ?? "Рекорды", "TC4_16_en", COLOR.white, { align: "center", scale: 1.1 });
  caption.position.set(406, 154); // по центру рамки (свиток 200…613)
  layer.addChild(caption);
  const head = (text: string, x: number, align: "left" | "center" = "left") => {
    const l = pop(text, "TC4_16_en", rgb(90, 55, 20), { align, scale: 0.8 });
    l.position.set(x, 194);
    layer.addChild(l);
  };
  head(t.highscore_player_header ?? "Игрок", 260);
  // колонки между вертикальными линиями свитка: дни 465…510, деньги 510…584 — значения по центру колонки
  head(t.highscore_day_header ?? "Дни", 487.5, "center");
  head(t.highscore_money_header ?? "Деньги", 547, "center");
  loadScores(rules).slice(0, 10).forEach((s, i) => {
    const y = 225 + i * 16.1;
    const color = s.current ? rgb(160, 40, 20) : rgb(60, 36, 12);
    const place = (text: string, x: number, align: "left" | "center" = "left") => {
      const l = pop(text, "BritannicBold14", color, { align, scale: 0.8 });
      l.position.set(x, y);
      layer.addChild(l);
    };
    place(s.name, 260);
    place(String(s.days), 487.5, "center");
    place(String(s.money), 547, "center");
    if (s.current) {
      const m = image("in_game");
      m.scale.set(0.6);
      m.position.set(232, y - 2);
      layer.addChild(m);
    }
  });
  const ok = textButton(rules.texts.buttons.ok ?? "OK", () => {
    layer.destroy({ children: true });
    onClose();
  });
  ok.position.set(388 + 18, 435 + 17);
  layer.addChild(ok);
  parent.addChild(layer);
}

// ---------------------------------------------------------------- пауза

export function pauseOverlay(parent: Container, rules: Rules) {
  const layer = new Container();
  layer.addChild(shade());
  const back = image("pause_bg");
  back.position.set((W - 426) / 2, (H - 125) / 2);
  layer.addChild(back);
  const text = pop((rules.texts.pause.text ?? "Пауза").replace(/\\n/g, "\n"), "TC4_16_en", COLOR.white, { align: "center", scale: 1.1, lineOffset: 4 });
  text.position.set(W / 2, H / 2 - 28);
  layer.addChild(text);
  parent.addChild(layer);
  return layer;
}

/**
 * continue_day_screen (Esc): день стоит, поле затемнено, по центру круглая кнопка «Закончить День» (позиция 347; 197, 206 × 198);
 * щелчок мимо неё возвращает в игру.
 */
export function continueDayOverlay(parent: Container, rules: Rules, actions: { resume(): void; endDay(): void }) {
  const layer = new Container();
  layer.addChild(shade(actions.resume));
  const end = roundButton(rules.texts.buttons.cancel_day ?? "Закончить День", actions.endDay, 4);
  end.position.set(347 + 103, 197 + 99);
  layer.addChild(end);
  parent.addChild(layer);
  return layer;
}

// ---------------------------------------------------------------- об игре

/** Страницы свитка «Об игре»: как играть, что откуда открывается, управление, авторство. Без кавычек-ёлочек и тире — их нет в растровых шрифтах. */
const ABOUT_PAGES: { title: string; body: string }[] = [
  {
    title: "Как играть",
    body:
      "Выращивайте цветы, продавайте их и развивайте ферму. Перед днем купите растение на грядке и воду, потом нажмите Начать День. " +
      "День на ферме короткий: пока он идет, растения хотят пить, а на них созревают цветы.\n" +
      "Когда около растения появляются капли, его надо полить, иначе оно засохнет. Чем быстрее вы полили или собрали цветок, тем больше опыта. " +
      "Собранные цветы продавайте в цветочном магазине по одному или букетами.",
  },
  {
    title: "Вредители и помощники",
    body:
      "Вредители ползут к растениям и едят их. Нажимайте на вредителя, пока он не исчезнет. " +
      "С опытом открываются умения: торговля, садоводство и борьба с вредителями. Дракончик Робин поливает растения, собирает цветы и бьет вредителей, его умения тоже растут.\n" +
      "Новое открывается по дням: бочка с 5 дня, ящик с 6, другие растения с 7, грядки с 10, колодец с 12.",
  },
  {
    title: "Управление",
    body:
      "Мышь или касание: основное действие. Esc: меню. Пробел: пауза. F: полный экран.\n" +
      "В Опциях можно выключить блестки у счетчиков, включить итоги дня, настроить звук и курсоры. " +
      "Игра сохраняется сама. Прогресс хранится в браузере на этом устройстве, поэтому не очищайте данные сайта.",
  },
  {
    title: "Об игре",
    body:
      "Ферма Айрис (Magic Farm) в браузере и на телефоне. Это неофициальный личный порт: правила, цифры и картинки взяты из оригинальной игры, " +
      "права на нее принадлежат ее авторам.\n" +
      "Автор порта: moonspeaking\ngithub.com/moonspeaking/farm",
  },
];

/** Свиток «Об игре» в стиле игры: листается кнопками «Назад» и «Далее»; щелчок мимо закрывает. */
export async function aboutScreen(parent: Container, rules: Rules) {
  let page = 0;
  for (;;) {
    const last = page === ABOUT_PAGES.length - 1;
    const buttons = [
      ...(page > 0 ? [{ text: rules.texts.buttons.back ?? "Назад", value: "prev" }] : []),
      { text: last ? (rules.texts.buttons.tutorial_baloon_close ?? "Закрыть") : "Далее", value: last ? "cancel" : "next" },
    ];
    const r = await dialog(parent, { title: `${ABOUT_PAGES[page].title} (${page + 1}/${ABOUT_PAGES.length})`, body: ABOUT_PAGES[page].body, buttons, width: 640 });
    if (r === "next") page += 1;
    else if (r === "prev") page -= 1;
    else return;
  }
}
