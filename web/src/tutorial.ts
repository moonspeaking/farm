// Подсказки обучения (tutorial из ru.xml): выплывающие пузыри, каждый показывается один раз за игру.
import { Container, Graphics } from "pixi.js";
import type { Rules } from "./rules";
import { fmt } from "./rules";
import type { Game } from "./state";
import { COLOR, H, image, pop, textButton, W } from "./ui";

export class Tutorial extends Container {
  private life = 0;
  private after: (() => void) | null = null;

  constructor(private readonly rules: Rules, private readonly game: Game, private readonly enabled: () => boolean) {
    super();
  }

  /**
   * Показывает подсказку id. Шаг из XML (tutorial_steps): с картинкой — затемнение fader_alpha с «окном» под ней,
   * пузырь у baloon_pos. Если baloon_pos.x = 0, шаг относительный: окно и пузырь привязаны к точке (x, y) вызова.
   */
  show(id: string, x: number, y: number, force = false, after?: () => void) {
    const text = this.rules.texts.tutorial[id];
    if (!text || !this.enabled()) return false;
    if (!force && this.game.tutorial.includes(id)) return false;
    if (!force) {
      this.game.tutorial.push(id);
    }
    this.hide();
    this.after = after ?? null;
    const step = this.rules.tutorial_steps[id];
    const relative = !step || step.pos[0] === 0;
    const box = new Container();

    // затемнение; светлая картинка под ним: у портретов говорящих (talker_*) она рисуется, у остальных вырезается из плёнки
    if (step?.image) {
      const pic = image(step.image);
      if (relative) pic.position.set(x - pic.width / 2, y - pic.height / 2);
      else pic.position.set(...step.image_pos);
      const drawn = step.image.startsWith("talker_");
      if (!drawn) pic.blendMode = "erase";
      const fade = new Container();
      fade.addChild(new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: step.alpha }));
      if (!drawn) fade.addChild(pic);
      fade.cacheAsTexture(true);
      fade.eventMode = "static";
      fade.on("pointertap", (e) => {
        e.stopPropagation();
        this.hide();
      });
      box.addChild(fade);
      if (drawn) box.addChild(pic);
    }

    // пузырь оригинала: тёмно-зелёный (17; 102; 21, 230/255) с чёрной рамкой, белый текст Verdana14,
    // хвостик — картинка buy_veg_baloon (28 × 18) на одном из нижних углов, остриё на 11 px от края
    // ширина строки: у подсказки карты в оригинале весь текст в одну строку
    const label = pop(fmt(text), "Verdana14", COLOR.white, { wrap: id === "global_map_show_town_baloon" ? 380 : 300 });
    const withClose = id !== "town_talker_large";
    const close = textButton(this.rules.texts.buttons.tutorial_baloon_close ?? "Закрыть", () => this.hide(), "small");
    const w = Math.max(label.textWidth, 60) + 14;
    const h = label.textHeight + 10 + (withClose ? 36 : 0);
    // точка, на которую указывает хвостик
    const tip: [number, number] = relative ? [x + (step?.pos[0] ?? 0), y + (step?.pos[1] ?? 0)] : [step.pos[0], step.pos[1]];
    const pointer = step ? step.pointer : true;
    const rightTail = tip[0] >= W / 2;
    const above = !pointer || tip[1] - 17 - h >= 4;
    let bx = pointer ? (rightTail ? tip[0] + 11 - w : tip[0] - 11) : tip[0];
    bx = Math.max(4, Math.min(W - w - 4, bx));
    const by = pointer ? (above ? tip[1] - 17 - h : tip[1] + 17) : Math.max(4, Math.min(H - h - 4, tip[1]));
    const balloon = new Graphics();
    balloon.roundRect(bx, by, w, h, 3).fill({ color: 0x116615, alpha: 230 / 255 }).stroke({ color: 0x000000, width: 1 });
    const bubble = new Container();
    bubble.addChild(balloon);
    if (pointer) {
      const tail = image("veg_baloon");
      tail.scale.set(rightTail ? 1 : -1, above ? 1 : -1);
      // правый край картинки совпадает с правым краем пузыря (остриё на 11 px левее), у зеркальной — левый с левым
      tail.position.set(rightTail ? bx + w - 27 : bx + 27, above ? by + h - 3 : by + 3);
      bubble.addChild(tail);
    }
    label.position.set(bx + 7, by + 5);
    bubble.addChild(label);
    if (withClose) {
      close.position.set(bx + w / 2, by + h - 20);
      bubble.addChild(close);
    }
    bubble.eventMode = "static";
    box.addChild(bubble);
    this.addChild(box);
    this.life = 12;
    return true;
  }

  /** Убирает подсказку при смене экрана: цепочка «после закрытия» не продолжается. */
  dismiss() {
    this.after = null;
    this.hide();
  }

  hide() {
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.life = 0;
    const next = this.after;
    this.after = null;
    next?.();
  }

  update(dt: number) {
    if (this.life > 0) {
      this.life -= dt;
      if (this.life <= 0) this.hide();
    }
  }
}
