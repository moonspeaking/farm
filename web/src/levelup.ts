// Окно умений (level_up): две колонки — Айрис слева, Робин справа; очко умений вкладывается кнопкой «Поднять Уровень».
import { Container, Graphics, NineSliceSprite } from "pixi.js";
import { audio } from "./audio";
import type { PopLabel } from "./popfont";
import { fmt, Rules } from "./rules";
import { Game, SKILLS, SkillName } from "./state";
import { COLOR, H, image, pop, tex, textButton, W } from "./ui";

/** Положение полосок и значков умений в окне — из properties_ru.xml (level_up/progresses, icons). */
const SLOTS: Record<SkillName, { bar: [number, number]; icon: [number, number]; side: "girl" | "helper" }> = {
  trade: { bar: [43, 138], icon: [139, 143], side: "girl" },
  farm: { bar: [43, 172], icon: [138, 176], side: "girl" },
  attack: { bar: [43, 205], icon: [135, 210], side: "girl" },
  helper_pour: { bar: [180, 138], icon: [186, 140], side: "helper" },
  helper_product: { bar: [180, 172], icon: [186, 174], side: "helper" },
  helper_attack: { bar: [180, 205], icon: [186, 208], side: "helper" },
};

/** Полоска прогресса умения (level_up/progresses): положение внутри пилюли 120×24 и цвет заполнения; следующий уровень — оранжевым. */
const PROGRESS: Record<SkillName, { at: [number, number]; color: number }> = {
  trade: { at: [8, 7], color: 0x4888be },
  farm: { at: [8, 6], color: 0x66be02 },
  attack: { at: [8, 6], color: 0xd64187 },
  helper_pour: { at: [45, 7], color: 0x4461be },
  helper_product: { at: [45, 6], color: 0x4e9100 },
  helper_attack: { at: [45, 6], color: 0x9f3065 },
};
const NEXT_COLOR = 0xd6632a;
const MAX_LEVEL = 5;

const ICON: Record<SkillName, string> = {
  trade: "lu_trade", farm: "lu_farm", attack: "lu_attack",
  helper_pour: "lu_helper_pour", helper_product: "lu_helper_product", helper_attack: "lu_helper_attack",
};

export class LevelUp extends Container {
  private selected: SkillName | null = null;
  private hover: SkillName | null = null;
  private readonly box = new Container();
  private readonly desc: PopLabel;
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
    this.box.eventMode = "static"; // нажатия по самому окну не закрывают его (закрывает щелчок мимо)
    this.addChild(shade, this.box);
    this.box.position.set((W - 349) / 2 + 40, (H - 446) / 2);
    this.box.addChild(image("lu_back"));

    // портреты в круглых окошках (картинка 103 × 97 лежит в левом верхнем углу позиции XML — тогда круг совпадает с нарисованным в фоне):
    // girl (32; 30), helper (207; 29)
    const girl = image("lu_girl");
    girl.position.set(32, 30);
    const helper = image("lu_helper");
    helper.position.set(207, 29);
    // Робин ещё не пришёл — его портрет притемнён кругом, а не всей квадратной картинкой
    if (!helperEnabled) {
      const dim = new Graphics().circle(207 + 51.5, 29 + 48.5, 43).fill({ color: 0x000000, alpha: 0.5 });
      dim.eventMode = "none";
      this.box.addChild(girl, helper, dim, this.marks);
    } else this.box.addChild(girl, helper, this.marks);

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
      hit.on("pointerover", () => {
        this.hover = skill;
        this.render();
      });
      hit.on("pointerout", () => {
        if (this.hover === skill) this.hover = null;
        this.render();
      });
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
    this.box.addChild(this.desc, this.buttonHolder);
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
      // заполнение — пилюля progress (68×11) нужной длины: текущий уровень цветом умения, следующий (у выбранного) оранжевым
      const prog = PROGRESS[skill];
      const capsule = (frac: number, color: number) => {
        const w = Math.max(11, 68 * frac);
        const c = new NineSliceSprite({ texture: tex("lu_progress"), leftWidth: 5, rightWidth: 5, topHeight: 0, bottomHeight: 0 });
        c.width = w;
        c.tint = color;
        c.position.set(slot.bar[0] + prog.at[0], slot.bar[1] + prog.at[1]);
        const glass = image("lu_glass");
        glass.position.set(c.x + 3, c.y + 1);
        this.marks.addChild(c, glass);
      };
      const showNext = skill === this.selected && g.skillPoints > 0 && level < MAX_LEVEL;
      if (showNext) capsule((level + 1) / MAX_LEVEL, NEXT_COLOR);
      if (level > 0) capsule(level / MAX_LEVEL, prog.color);
      // рамка 120×24: выбранное умение — selected_color (красная), под курсором — overed_color (зелёная)
      if (skill === this.selected) this.marks.addChild(new Graphics().rect(slot.bar[0], slot.bar[1], 120, 24).stroke({ color: 0xff0000, width: 1 }));
      else if (skill === this.hover) this.marks.addChild(new Graphics().rect(slot.bar[0], slot.bar[1], 120, 24).stroke({ color: 0x00ff00, width: 1 }));
    }

    const t = this.rules.texts;
    const points = g.skillPoints;
    if (this.selected) {
      const s = this.selected;
      // в оригинале на свитке только описание умения (description 255 × 85)
      this.desc.text = fmt(t.skill_desc[s]);
    } else {
      this.desc.text = points > 0 ? fmt(t.tutorial.level_up) : `${t.stats.hero_title}: ${g.exp}`;
    }

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

