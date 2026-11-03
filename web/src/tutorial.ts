// Подсказки обучения (tutorial из ru.xml): выплывающие пузыри, каждый показывается один раз за игру.
import { Container, Graphics } from "pixi.js";
import type { Rules } from "./rules";
import { fmt } from "./rules";
import type { Game } from "./state";
import { COLOR, H, image, pop, textButton, W } from "./ui";

/** На сенсорном экране (планшет, телефон) в подсказках нет мыши: «нажмите на нём левой кнопкой мыши» → «нажмите на нём». */
function forDevice(text: string) {
  if (!window.matchMedia?.("(pointer: coarse)").matches) return text;
  return text
    .replace("Щелкайте", "Нажимайте")
    .replace(/\s+левой кнопкой мышк?и/g, "")
    .replace(/левую кнопку мыши/g, "палец");
}

/**
 * Напоминание экрана (exe: таймер 10 с в конструкторе экрана — 0x479ff0 карта, город и магазин так же; обновление
 * 0x479170 / 0x492b40 / 0x48e960): пока не открыта подсказка, таймер убывает, на нуле показывается пузырь и отсчёт снова 10 с.
 */
export class Reminder {
  private left = 10;

  tick(dt: number, tut: Tutorial, ready: boolean, show: () => void) {
    if (!ready || tut.active) return;
    this.left -= dt;
    if (this.left > 0) return;
    this.left = 10;
    show();
  }
}

/** Пузыри экрана подготовки (ShopScreenFarm): держатся, пока игрок не сделает действие. */
const SHOP_BALLOONS = new Set(["first_vegetation", "sell_prod", "buy_water"]);

export class Tutorial extends Container {
  private life = 0;
  private after: (() => void) | null = null;
  /** Показанная сейчас подсказка и ждущие своей очереди. */
  private current: string | null = null;
  private queue: { id: string; x: number; y: number; after?: () => void }[] = [];
  /** Снимает слушатель нажатия вне подсказки (для подсказок без затемнения). */
  private offClick: (() => void) | null = null;

  /** Сейчас открыто окно с затемнением (exe: пока оно открыто, экран игры не обновляет мир — игра стоит, 0x476cd0). */
  private modal = false;

  get active() {
    return this.children.length > 0;
  }

  /** Подсказка ставит игру на паузу: окно с затемнением; простые пузыри идут вместе с игрой. */
  get blocking() {
    return this.active && this.modal;
  }

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
    // очередь оригинала (TutorialLayer 0x476a40): пузыри идут по одному, следующий — когда погас предыдущий;
    // одна и та же подсказка в очереди не дублируется (0x441d90)
    if (this.active) {
      if (this.current !== id && !this.queue.some((q) => q.id === id)) this.queue.push({ id, x, y, after });
      return true;
    }
    this.display(id, x, y, after);
    return true;
  }

  /** Подсказка стоит в очереди и ещё не показана. В оригинале флаг ставится при показе, а не при постановке в очередь (0x4409c0). */
  queued(id: string) {
    return this.queue.some((q) => q.id === id);
  }

  private display(id: string, x: number, y: number, after?: () => void) {
    const text = this.rules.texts.tutorial[id];
    this.current = id;
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
      // затемнение не перехватывает нажатия: нажатие на подсвеченную цель выполняет действие и убирает подсказку
      fade.eventMode = "none";
      box.addChild(fade);
      if (drawn) box.addChild(pic);
    }

    // пузырь оригинала: тёмно-зелёный (17; 102; 21, 230/255) с чёрной рамкой, белый текст Verdana14,
    // хвостик — картинка buy_veg_baloon (28 × 18) на одном из нижних углов, остриё на 11 px от края
    // ширина строки: у подсказки карты в оригинале весь текст в одну строку
    const label = pop(forDevice(fmt(text)), "Verdana14", COLOR.white, { wrap: id === "global_map_show_town_baloon" ? 380 : 300 });
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
    // окно с затемнением (0x495850) таймера не имеет — висит до «Закрыть»; так же пузыри магазина, пока не сделано действие.
    // Простой пузырь TutorialLayer (без затемнения) живёт 10 с (0x41200000 в 0x476a40)
    this.modal = !!step?.image;
    this.life = step?.image || SHOP_BALLOONS.has(id) ? Infinity : 10;
    // подсказка исчезает, как только игрок нажал или сделал действие (следующее нажатие)
    const onDown = () => this.hide();
    const timer = window.setTimeout(() => {
      window.addEventListener("pointerdown", onDown);
      this.offClick = () => window.removeEventListener("pointerdown", onDown);
    }, 0);
    this.offClick = () => window.clearTimeout(timer);
  }

  /** Убирает подсказку при смене экрана: цепочка «после закрытия» не продолжается. */
  dismiss() {
    this.after = null;
    this.queue = [];
    this.hide();
  }

  hide() {
    this.offClick?.();
    this.offClick = null;
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.life = 0;
    this.current = null;
    const next = this.after;
    this.after = null;
    next?.();
    if (!this.active) {
      const q = this.queue.shift();
      if (q) this.display(q.id, q.x, q.y, q.after);
    }
  }

  update(dt: number) {
    if (this.life > 0) {
      this.life -= dt;
      if (this.life <= 0) this.hide();
    }
  }
}
