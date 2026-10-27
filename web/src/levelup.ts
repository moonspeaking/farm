// Окно умений (level_up): две колонки — Айрис слева, Робин справа; очко умений вкладывается кнопкой «Поднять Уровень».
import { Container, Graphics } from "pixi.js";
import { audio } from "./audio";
import type { PopLabel } from "./popfont";
import { rgb } from "./popfont";
import { fmt, Rules } from "./rules";
import { Game, SKILLS, SkillName } from "./state";
import { COLOR, H, image, pop, textButton, W } from "./ui";

/** Положение полосок и значков умений в окне — из properties_ru.xml (level_up/progresses, icons). */
const SLOTS: Record<SkillName, { bar: [number, number]; icon: [number, number]; side: "girl" | "helper" }> = {
  trade: { bar: [43, 138], icon: [139, 143], side: "girl" },
  farm: { bar: [43, 172], icon: [138, 176], side: "girl" },
  attack: { bar: [43, 205], icon: [135, 210], side: "girl" },
  helper_pour: { bar: [180, 138], icon: [186, 140], side: "helper" },
  helper_product: { bar: [180, 172], icon: [186, 174], side: "helper" },
  helper_attack: { bar: [180, 205], icon: [186, 208], side: "helper" },
};

const ICON: Record<SkillName, string> = {
  trade: "lu_trade", farm: "lu_farm", attack: "lu_attack",
  helper_pour: "lu_helper_pour", helper_product: "lu_helper_product", helper_attack: "lu_helper_attack",
};

/** Подписи прибавок умений (в оригинале этой строки нет — показывается только описание умения). */
const GAIN: Record<string, string> = {
  sell_goods: "продажа", buy_goods: "покупка", attack: "атака", new_product: "плодоношение", vegetation_life: "жизнь растений",
  hungry: "время до жажды", grow_up: "рост", helper_attack: "атака Робина", helper_attack_speed: "скорость атаки",
  helper_product: "сбор", helper_product_speed: "скорость сбора", helper_pour: "полив", helper_pour_speed: "скорость полива",
};

export class LevelUp extends Container {
  private selected: SkillName | null = null;
  private readonly box = new Container();
  private readonly desc: PopLabel;
  private readonly note: PopLabel;
  private readonly marks = new Container();
  private readonly buttonHolder = new Container();

  constructor(
    private readonly rules: Rules,
    private readonly game: Game,
    helperEnabled: boolean,
    private readonly onClose: () => void,
  ) {
    super();
    const shade = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.45 });
    shade.eventMode = "static";
    this.addChild(shade, this.box);
    this.box.position.set((W - 349) / 2 + 40, (H - 446) / 2);
    this.box.addChild(image("lu_back"));

    // портреты в круглых окошках: girl (32; 30), helper (207; 29), 120×120
    const girl = image("lu_girl");
    girl.position.set(32 + (120 - 103) / 2, 30 + (120 - 97) / 2);
    const helper = image("lu_helper");
    helper.position.set(207 + (120 - 103) / 2, 29 + (120 - 97) / 2);
    if (!helperEnabled) helper.tint = 0x808080;
    this.box.addChild(girl, helper, this.marks);

    for (const skill of SKILLS) {
      const slot = SLOTS[skill];
      const off = slot.side === "helper" && !helperEnabled;
      const icon = image(off ? `${ICON[skill]}_off` : ICON[skill]);
      icon.position.set(...slot.icon);
      this.box.addChild(icon);
      // область нажатия — вся полоска умения
      const hit = new Graphics().rect(slot.bar[0], slot.bar[1], 120, 24).fill({ color: 0xffffff, alpha: 0.001 });
      hit.eventMode = off ? "none" : "static";
      hit.cursor = "pointer";
      hit.on("pointertap", (e) => {
        e.stopPropagation();
        this.selected = skill;
        this.render();
      });
      this.box.addChild(hit);
    }

    // описание на бумажном свитке: description (44; 237) 255×85
    this.desc = pop("", "Verdana14", COLOR.black, { wrap: 250, lineOffset: -3 });
    this.desc.position.set(44, 240);
    this.note = pop("", "BritannicBold14", rgb(110, 60, 20), { align: "center" });
    this.note.position.set(349 / 2, 318);
    this.box.addChild(this.desc, this.note, this.buttonHolder);
    shade.on("pointertap", () => this.close());
    this.render();
  }

  private close() {
    this.destroy({ children: true });
    this.onClose();
  }

  private render() {
    const g = this.game;
    this.marks.removeChildren().forEach((c) => c.destroy());
    for (const skill of SKILLS) {
      const slot = SLOTS[skill];
      const level = g.skills[skill];
      // пять делений в пилюле 120×24: заполненные — золотом, выбранное умение — с подсветкой
      for (let i = 0; i < 5; i++) {
        const seg = new Graphics()
          .roundRect(slot.bar[0] + 8 + i * 21, slot.bar[1] + 6, 18, 12, 4)
          .fill(i < level ? 0xf2c14e : 0x2c3a50);
        if (i < level) seg.stroke({ color: 0xfff0a0, width: 1 });
        this.marks.addChild(seg);
      }
      if (skill === this.selected) {
        this.marks.addChild(new Graphics().roundRect(slot.bar[0] - 2, slot.bar[1] - 1, 124, 26, 9).stroke({ color: 0xffee66, width: 3 }));
      }
    }

    const t = this.rules.texts;
    const points = g.skillPoints;
    if (this.selected) {
      const s = this.selected;
      const lvl = g.skills[s];
      const next = this.rules.skills[s]?.[lvl];
      const gain = next ? `Следующий уровень: ${Object.entries(next).map(([k, v]) => `${GAIN[k] ?? k} +${Math.round(v * 100)}%`).join(", ")}` : "";
      this.desc.text = `${t.skill_characteristics[s] ?? ""}\n${fmt(t.skill_desc[s])}${lvl >= 5 ? "" : `\n${gain}`}`;
    } else {
      this.desc.text = points > 0 ? fmt(t.tutorial.level_up) : `${t.stats.hero_title}: ${g.exp}`;
    }
    this.note.text = `${points > 0 ? `+${points}` : ""} ${t.stats.hero_title} ${g.level}`.trim();

    this.buttonHolder.removeChildren().forEach((c) => c.destroy({ children: true }));
    const can = !!this.selected && points > 0 && g.skills[this.selected] < 5;
    if (can) {
      const b = textButton(t.buttons.level_up ?? "Поднять Уровень", () => this.raise(), "small");
      b.position.set(84 + 94, 368 + 16);
      this.buttonHolder.addChild(b);
    } else {
      const ok = textButton(t.buttons.ok ?? "OK", () => this.close(), "small");
      ok.position.set(157 + 16, 372 + 16);
      this.buttonHolder.addChild(ok);
    }
  }

  private raise() {
    const s = this.selected!;
    this.game.skills[s] += 1;
    audio.play("level_up");
    this.game.changed();
    this.render();
  }
}

