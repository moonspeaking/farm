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

    // затемнение с «окном»: светлая картинка вырезается из чёрной плёнки
    if (step?.image) {
      const hole = image(step.image);
      if (relative) hole.position.set(x - hole.width / 2, y - hole.height / 2);
      else hole.position.set(...step.image_pos);
      hole.blendMode = "erase";
      const fade = new Container();
      fade.addChild(new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: step.alpha }), hole);
      fade.cacheAsTexture(true);
      fade.eventMode = "static";
      fade.on("pointertap", (e) => {
        e.stopPropagation();
        this.hide();
      });
      box.addChild(fade);
    }

    const label = pop(fmt(text), "Verdana14", COLOR.black, { wrap: 260, lineOffset: -3 });
    const close = textButton(this.rules.texts.buttons.tutorial_baloon_close ?? "Закрыть", () => this.hide(), "shop");
    const w = Math.max(label.textWidth, 110) + 24;
    const h = label.textHeight + 18 + 34;
    // точка, на которую указывает хвостик
    const tip: [number, number] = relative ? [x + (step?.pos[0] ?? 0), y + (step?.pos[1] ?? 0)] : [step.pos[0], step.pos[1]];
    const pointer = step ? step.pointer : true;
    const above = pointer ? tip[1] - h - 26 > 0 : false;
    const bx = Math.max(110, Math.min(W - w - 10, pointer ? tip[0] - w / 2 : tip[0]));
    const by = pointer ? (above ? tip[1] - h - 22 : tip[1] + 22) : Math.max(10, Math.min(H - h - 10, tip[1]));
    const balloon = new Graphics();
    // светло-зелёный пузырь с тёмно-зелёной обводкой и хвостиком к цели, как tooltip/baloon.png
    balloon.roundRect(bx, by, w, h, 12).fill({ color: 0xe9ffc4 }).stroke({ color: 0x2f9a1c, width: 3 });
    if (pointer) {
      const tx = Math.max(bx + 16, Math.min(bx + w - 16, tip[0]));
      if (above) balloon.poly([tx - 9, by + h - 1, tx + 9, by + h - 1, tip[0], tip[1] - 2]).fill({ color: 0xe9ffc4 }).stroke({ color: 0x2f9a1c, width: 3 });
      else balloon.poly([tx - 9, by + 1, tx + 9, by + 1, tip[0], tip[1] + 2]).fill({ color: 0xe9ffc4 }).stroke({ color: 0x2f9a1c, width: 3 });
    }
    label.position.set(bx + 12, by + 9);
    close.position.set(bx + w / 2, by + h - 18);
    const bubble = new Container();
    bubble.addChild(balloon, label, close);
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
