// Левая панель Айрис (stat_control + game_screen/item_stat): опыт, склад, вода, деньги, день, «Меню».
import { Container, Graphics } from "pixi.js";
import type { FontName, PopLabel } from "./popfont";
import { rgb } from "./popfont";
import type { Rules } from "./rules";
import type { Game } from "./state";
import { ParticleLayer } from "./particles";
import { COLOR, image, pop } from "./ui";

export interface HudEvents {
  /** Нажали на полоску опыта (view_button) — открыть окно умений. */
  openLevelUp(): void;
  menu(): void;
}

export class Hud extends Container {
  private readonly values: Record<"storage" | "water" | "money" | "day" | "level", PopLabel>;
  private readonly bar = new Graphics();
  private readonly glow = new Graphics();
  private blink = 0;
  private readonly particles = new ParticleLayer();
  /** Пока true, звёздочки у счётчиков не вылетают (при продаже цветов в цветочном магазине). */
  quiet = false;
  private shown: Record<"storage" | "water" | "money", number> | null = null;

  constructor(rules: Rules, private readonly game: Game, events: HudEvents) {
    super();
    const st = rules.texts.stats;
    this.addChild(image("stat_panel"));

    // заголовки шрифтом TC4_16_en, чёрные; XML: hero_title (13;5), storage_title (12;142), water_title (13;243)…
    const title = (text: string, x: number, y: number, w: number) => {
      const l = pop(text, "TC4_16_en", COLOR.black, { align: "center" });
      l.position.set(x + w / 2, y);
      this.addChild(l);
    };
    title(st.hero_title, 13, 5, 80);
    title(st.storage_title, 12, 142, 80);
    title(st.water_title, 13, 243, 80);
    title(st.money_title, 12, 343, 80);
    title(st.day_title, 12, 446, 80);

    // значения BritannicBold14 цветами из XML: склад и день 60;60;60, вода 60;60;160, деньги 255;255;55
    const value = (x: number, y: number, color: number, align: "left" | "center" = "left", vcenter = false, scale = 1, font: FontName = "BritannicBold14") => {
      const l = pop("", font, color, { align, scale });
      if (vcenter) l.anchor.set(align === "center" ? 0.5 : 0, 0.5);
      l.position.set(x, y);
      this.addChild(l);
      return l;
    };
    this.values = {
      storage: value(52, 214, rgb(60, 60, 60), "center"),
      water: value(52, 316, rgb(60, 60, 160), "center"),
      money: value(52, 416, rgb(255, 255, 55), "center"),
      day: value(57, 500, rgb(60, 60, 60), "center", true, 1), // day_count (15; 486) 30×30: цифра на странице календаря, размер как у цифр склада
      level: value(19, 126, COLOR.white, "center", true, 0.85, "float_points"), // уровень — золотые цифры float_points слева от полоски опыта
    };

    // полоска опыта 61×11 в (32; 123); при свободных очках умений мигает
    this.addChild(this.glow, this.bar, this.particles);
    const hit = new Graphics().rect(9, 117, 90, 25).fill({ color: 0xffffff, alpha: 0.001 });
    hit.eventMode = "static";
    hit.cursor = "pointer";
    hit.on("pointertap", (e) => {
      e.stopPropagation();
      events.openLevelUp();
    });
    this.addChild(hit);

    const menu = pop(rules.texts.buttons.game_menu ?? "Меню", "TC4_16_en", COLOR.white, { align: "center" });
    menu.anchor.set(0.5, 0.5);
    menu.position.set(25 + 28, 544 + 12);
    menu.eventMode = "static";
    menu.cursor = "pointer";
    menu.on("pointertap", (e) => {
      e.stopPropagation();
      events.menu();
    });
    this.addChild(menu);
    this.update();
  }

  update() {
    const g = this.game;
    // звёздочки (water-changes, money-changes, products-changes) вылетают из счётчика, когда значение меняется
    const now = { storage: g.storageCount(), water: g.water, money: g.gold };
    if (this.shown && !this.quiet) {
      if (now.storage !== this.shown.storage) this.particles.start("products-changes", 52, 222);
      if (now.water !== this.shown.water) this.particles.start("water-changes", 52, 324);
      if (now.money !== this.shown.money) this.particles.start("money-changes", 52, 424);
    }
    this.shown = now;
    this.values.storage.text = `${g.storageCount()} / ${g.storageMax}`;
    this.values.water.text = `${g.water} / ${g.waterMax}`;
    this.values.money.text = String(g.gold);
    this.values.day.text = String(g.day);
    this.values.level.text = String(g.level);
    const [cur, need] = g.levelProgress;
    // дорожка полоски — белая с чёрной рамкой (experience: 32; 123, 61 × 11), поверх неё зелёная заливка
    this.bar.clear().rect(32, 123, 61, 11).fill(0xffffff).stroke({ color: 0x000000, width: 1 });
    const w = 61 * Math.min(1, cur / need);
    if (w > 0) {
      this.bar.rect(32, 123, w, 11).fill(0x58c63c);
      this.bar.rect(33, 124, Math.max(0, w - 2), 4).fill({ color: 0xb6f58a, alpha: 0.7 });
    }
  }

  /** Мигание рамки, пока есть неиспользованные очки умений. */
  tick(dt: number) {
    this.blink += dt;
    this.particles.update(dt);
    this.glow.clear();
    if (this.game.skillPoints > 0) {
      const a = 0.35 + 0.35 * Math.sin(this.blink * 6);
      this.glow.roundRect(29, 120, 67, 17, 7).stroke({ color: 0xffee66, width: 3, alpha: a });
    }
  }
}
