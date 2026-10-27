// Главное меню (main_menu) и вступительный комикс (first_comics).
import { Container, Graphics } from "pixi.js";
import type { Rules } from "./rules";
import { fmt } from "./rules";
import { dialog, H, image, roundButton, textButton, toast, W } from "./ui";

export interface MenuEvents {
  play(fresh: boolean): void;
  hasSave(): boolean;
  options(): void;
  highscores(): void;
}

/** Кадры комикса по белым разделителям картинки (x: 303, 401, 495; y: 265), в порядке рассказа: x, y, ширина, высота. */
const COMICS_PANELS: [number, number, number, number][] = [
  [0, 0, 303, 265],
  [303, 0, 98, 265],
  [401, 0, 399, 265],
  [0, 265, 303, 335],
  [303, 265, 192, 335],
  [495, 265, 305, 335],
];
/** Пауза между кадрами и длительность появления кадра, с. */
const COMICS_GAP = 1.6;
const COMICS_FADE = 0.7;

export class Menu extends Container {
  private readonly overlay = new Container();

  constructor(private readonly rules: Rules, private readonly events: MenuEvents) {
    super();
    const t = rules.texts;
    const b = t.buttons_menu;
    this.addChild(image("menu_bg"));
    // пункты main_menu на деревянной табличке: шрифт rubius_30, цвет 255;255;100, при наведении 255;255;175
    const item = (text: string, x: number, y: number, w: number, onTap: () => void) => {
      const l = textButton(text, onTap, "menu");
      l.position.set(x + w / 2, y + 20);
      this.addChild(l);
    };
    item(b.game_adventure || "Кампания", 147, 186, 155, () => void this.adventure());
    item(b.options || "Опции", 180, 239, 96, () => this.events.options());
    item(b.menu_highscores || "Результаты", 130, 293, 201, () => this.events.highscores());
    item(b.menu_exit || "Выйти", 174, 349, 109, () => toast(this.overlay, "Закройте вкладку или приложение"));
    this.addChild(this.overlay);
  }

  private async adventure() {
    const t = this.rules.texts;
    if (!this.events.hasSave()) return this.comics();
    const r = await dialog(this.overlay, {
      body: fmt(t.new_game.text),
      buttons: [
        { text: t.buttons_menu.continue_game || "Продолжить", value: "continue" },
        { text: t.buttons_menu.new_game || "Новая Игра", value: "new" },
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
    const panels = COMICS_PANELS.map((r) => {
      const c = new Container();
      const mask = new Graphics().rect(...r).fill(0xffffff);
      c.addChild(image("comics"), mask);
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
    // подложка перевёрнута (ободок снизу), подпись остаётся прямой и лежит в видимой части экрана (y ≈ 570)
    ok.children[0].rotation = Math.PI;
    ok.children[1].y = -36;
    ok.children[1].scale.set(1.15); // подпись в оригинале примерно на 15% крупнее и ниже, у нижнего края кнопки
    ok.visible = false;
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
      if (shown >= panels.length) return;
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
      if (shown === panels.length && t >= COMICS_FADE) ok.visible = true;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
