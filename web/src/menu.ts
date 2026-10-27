// Главное меню (main_menu) и вступительный комикс (first_comics).
import { Container } from "pixi.js";
import type { Rules } from "./rules";
import { fmt } from "./rules";
import { dialog, image, roundButton, textButton, toast } from "./ui";

export interface MenuEvents {
  play(fresh: boolean): void;
  hasSave(): boolean;
  options(): void;
  highscores(): void;
}

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

  /** Комикс о письме слуги — перед началом новой игры. */
  private comics() {
    const layer = new Container();
    layer.addChild(image("comics"));
    const ok = roundButton(this.rules.texts.buttons_menu.continue_game || "Продолжить", () => {
      layer.destroy({ children: true });
      this.events.play(true);
    });
    // first_comics/ok: 612; 517 — кнопка уходит за нижний край
    ok.position.set(612 + 103, 517 + 99);
    // подложка перевёрнута (ободок снизу), подпись остаётся прямой и лежит в видимой части экрана (y ≈ 570)
    ok.children[0].rotation = Math.PI;
    ok.children[1].y = -30;
    ok.children[1].scale.set(1.15); // подпись в оригинале примерно на 15% крупнее и ниже, у нижнего края кнопки
    layer.addChild(ok);
    this.overlay.addChild(layer);
  }
}
