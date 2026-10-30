// Главное меню (main_menu) и вступительный комикс (first_comics).
import { Container, Graphics } from "pixi.js";
import type { PopLabel } from "./popfont";
import { rgb } from "./popfont";
import type { Rules } from "./rules";
import { fmt } from "./rules";
import { dialog, H, image, pop, roundButton, textButton, W } from "./ui";

export interface MenuEvents {
  play(fresh: boolean): void;
  hasSave(): boolean;
  options(): void;
  highscores(): void;
  about(): void;
  /** Имя текущего игрока и переход к выбору игрока (main_change_user). */
  userName(): string | null;
  changeUser(): void;
}

/**
 * Кадры комикса в порядке рассказа; каждый — набор прямоугольников (x, y, ширина, высота): врезка с замком заходит на соседний кадр,
 * а нижняя кромка первого кадра ниже разделителя на 265 (она лежит у 300).
 */
const COMICS_PANELS: [number, number, number, number][][] = [
  [[0, 0, 303, 303]],
  [[304, 0, 98, 268], [376, 0, 132, 102]],
  [[402, 102, 398, 166], [508, 0, 292, 102]],
  [[0, 303, 303, 297]],
  [[304, 268, 190, 332]],
  [[494, 268, 306, 332]],
];
/** Пауза между кадрами и длительность появления кадра, с. */
const COMICS_GAP = 1.6;
const COMICS_FADE = 0.7;
/** После последнего кадра: пауза и проявление кнопки, с. */
const COMICS_BUTTON_WAIT = 0.8;
const COMICS_BUTTON_FADE = 0.6;

export class Menu extends Container {
  private readonly overlay = new Container();
  private greeting: PopLabel | null = null;

  constructor(private readonly rules: Rules, private readonly events: MenuEvents) {
    super();
    const t = rules.texts;
    const b = t.buttons_menu;
    this.addChild(image("menu_bg"));
    // пункты main_menu на деревянной табличке: шрифт rubius_30, цвет 255;255;100, при наведении 255;255;175
    // fit: подгонять шрифт под ширину таблички (нужно только «Результатам»; остальные пункты — шрифтом оригинала без уменьшения)
    const item = (text: string, x: number, y: number, w: number, onTap: () => void, fit = false) => {
      const l = textButton(text, onTap, "menu", fit ? w - 18 : 0);
      l.position.set(x + w / 2, y + 20);
      this.addChild(l);
    };
    item(b.game_adventure || "Кампания", 147, 186, 155, () => void this.adventure());
    item(b.options || "Опции", 180, 239, 96, () => this.events.options());
    // «Об игре» на третьей табличке, «Результаты» на последней (табличка одинаковой ширины, поле w — как у «Результатов» в XML)
    item("Об игре", 130, 295, 201, () => this.events.about()); // на 2 px ниже остальных: так надпись ровно по центру таблички
    // вместо «Выйти» (в браузере и PWA игра сама закрыться не может) — свиток «Об игре» выше, «Результаты» на последней табличке
    item(b.menu_highscores || "Результаты", 130, 349, 201, () => this.events.highscores(), true);
    this.refreshUser();
    this.addChild(this.overlay);
  }

  /** «Приветствую, %name%, если это не Вы, нажмите сюда» вверху меню (main_menu/logoff: y 0, цвет 250;150;0, при наведении 255;200;50). */
  refreshUser() {
    this.greeting?.destroy();
    this.greeting = null;
    const name = this.events.userName();
    if (!name) return;
    const normal = rgb(250, 150, 0);
    const active = rgb(255, 200, 50);
    const l = pop(fmt(this.rules.texts.users?.main_change_user ?? "Приветствую, %name%, если это не Вы, нажмите сюда", { name }), "rubius_24", normal, { align: "center" });
    l.position.set(W / 2, 4);
    l.eventMode = "static";
    l.cursor = "pointer";
    l.on("pointerover", () => l.setColor(active));
    l.on("pointerout", () => l.setColor(normal));
    l.on("pointertap", () => this.events.changeUser());
    this.greeting = l;
    this.addChildAt(l, this.children.indexOf(this.overlay) >= 0 ? this.children.indexOf(this.overlay) : this.children.length);
  }

  private async adventure() {
    const t = this.rules.texts;
    if (!this.events.hasSave()) return this.comics();
    const r = await dialog(this.overlay, {
      body: fmt(t.new_game.text),
      buttons: [
        { text: t.buttons_menu.new_game || "Новая Игра", value: "new" },
        { text: t.buttons_menu.continue_game || "Продолжить", value: "continue" }, // справа: основное действие, легко не спутать с новой игрой
      ],
    });
    if (r === "continue") return this.events.play(false);
    if (r !== "new") return;
    const ok = await dialog(this.overlay, {
      body: fmt(t.new_game.confirmation),
      buttons: [{ text: t.buttons.yes || "Да", value: "ok" }, { text: t.buttons.no || "Нет", value: "no" }],
    });
    if (ok === "ok") this.comics();
  }

  /** Комикс о письме слуги — перед началом новой игры. Кадры появляются по очереди; щелчок показывает следующий (или все оставшиеся сразу). */
  private comics() {
    const layer = new Container();
    layer.addChild(new Graphics().rect(0, 0, W, H).fill(0x000000));
    const panels = COMICS_PANELS.map((r, index) => {
      const c = new Container();
      const mask = new Graphics();
      for (const rect of r) mask.rect(...rect);
      mask.fill(0xffffff);
      // у последнего кадра — копия без нарисованной «лужи» кнопки (tools/make_comics_clean.py), пока кнопка не появилась
      c.addChild(image(index === COMICS_PANELS.length - 1 ? "comics_clean" : "comics"));
      c.addChild(mask);
      c.mask = mask;
      c.alpha = 0;
      layer.addChild(c);
      return c;
    });
    const ok = roundButton(this.rules.texts.buttons_menu.continue_game || "Продолжить", () => {
      layer.destroy({ children: true });
      this.events.play(true);
    });
    // first_comics/ok: 612; 517 — кнопка уходит за нижний край
    ok.position.set(612 + 103, 517 + 99);
    // подложка перевёрнута (ободок снизу), подпись остаётся прямой и лежит в видимой части экрана (y ≈ 570);
    // кнопка не «выскакивает», а плавно проявляется сразу в нормальном размере
    ok.children[0].rotation = Math.PI;
    ok.children[1].y = -36;
    ok.children[1].scale.set(1.15); // подпись в оригинале примерно на 15% крупнее и ниже, у нижнего края кнопки
    ok.alpha = 0;
    ok.eventMode = "none"; // кнопка нажимается только после появления подписи
    layer.addChild(ok);
    this.overlay.addChild(layer);

    // показ по очереди: i — сколько кадров уже начали появляться, t — время с начала появления последнего
    let shown = 0;
    let t = COMICS_GAP;
    let last = performance.now();
    const next = () => {
      if (shown >= panels.length) return;
      shown += 1;
      t = 0;
    };
    layer.eventMode = "static";
    layer.on("pointertap", () => {
      // щелчок мимо кнопки: если кадр ещё появляется — сразу весь, иначе следующий
      if (shown > 0 && t < COMICS_FADE) {
        panels[shown - 1].alpha = 1;
        t = COMICS_FADE;
      }
      if (shown >= panels.length) {
        t = Math.max(t, COMICS_FADE + COMICS_BUTTON_WAIT + COMICS_BUTTON_FADE); // кнопку сразу
        return;
      }
      next();
    });
    const tick = () => {
      if (layer.destroyed) return;
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      t += dt;
      if (shown < panels.length && t >= COMICS_GAP) next();
      for (let i = 0; i < shown; i++) panels[i].alpha = i < shown - 1 ? 1 : Math.min(1, t / COMICS_FADE);
      // комикс закончился (последний кадр проявился) — после короткой паузы плавно появляется кнопка, сразу в нормальном размере
      if (shown === panels.length) {
        const k = (t - COMICS_FADE - COMICS_BUTTON_WAIT) / COMICS_BUTTON_FADE;
        ok.alpha = Math.max(0, Math.min(1, k));
        if (k >= 1) ok.eventMode = "static";
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
