// Город первой локации (town_screen): персонажи с заданиями, продавцы, возврат на ферму.
import { Container, Graphics } from "pixi.js";
import { Hud } from "./hud";
import type { QuestEngine } from "./quests";
import type { Rules } from "./rules";
import type { Game } from "./state";
import { Talk } from "./talk";
import type { Tutorial } from "./tutorial";
import { COLOR, image, pop, roundButton, toast } from "./ui";

export interface TownEvents {
  toFarm(): void;
  toMap(): void;
  saved(): void;
  /** Кнопка «Меню» левой панели. */
  menu(): void;
}

export class Town extends Container {
  /** Картинка и подпись каждого персонажа — прячутся, пока у него нет заданий. */
  private readonly people: Record<string, Container[]> = {};
  private readonly overlay = new Container();
  private busy = false;
  private readonly hud: Hud;
  private readonly nameTip = new Container();

  constructor(
    private readonly rules: Rules,
    game: Game,
    private readonly quests: QuestEngine,
    private readonly events: TownEvents,
    private readonly tut: Tutorial,
  ) {
    super();
    const t = rules.texts;
    this.addChild(image(rules.town_bg_image));

    // персонажи — quest_holders первой локации; ниже на экране — ближе
    const holders = Object.entries(rules.holders).sort((a, b) => a[1].position[1] - b[1].position[1]);
    for (const [name, h] of holders) {
      const s = image(`holder_${name}`);
      s.position.set(h.position[0], h.position[1]);
      // персонажи стоят у нижнего края экрана: подрезанные снизу позиции поднимаем, чтобы были видны целиком
      s.y = Math.min(s.y, 600 - s.height - 4);
      s.eventMode = "static";
      s.cursor = "talk";
      s.on("pointertap", () => void this.talk(name));
      // имя персонажа — плашка у курсора при наведении (курсор «губы» задан cursor = "talk")
      s.on("pointerover", (e) => this.showName(name, e.global.x, e.global.y));
      s.on("pointermove", (e) => this.showName(name, e.global.x, e.global.y));
      s.on("pointerout", () => this.hideName());
      this.people[name] = [s];
      this.addChild(s);
    }

    // круглые кнопки town_screen, как на ферме: to_global_map (193; -110) и shop_screen_farm (527; -110)
    const map = roundButton(t.buttons.town_to_global_map ?? "На Карту", () => this.events.toMap());
    map.position.set(193 + 103, -110 + 99);
    const farm = roundButton(t.buttons.shop_screen_farm ?? "На Ферму", () => this.events.toFarm());
    farm.position.set(527 + 103, -110 + 99);
    this.addChild(map, farm);
    // левая панель Айрис — та же, что на ферме
    this.hud = new Hud(rules, game, { openLevelUp: () => undefined, menu: () => this.events.menu() });
    this.addChild(this.hud, this.overlay, this.nameTip);
    game.onChange(() => this.hud.update());
    this.hud.update();
    this.nameTip.eventMode = "none";
    this.nameTip.visible = false;
    this.refresh();
  }

  update(dt: number) {
    this.hud.tick(dt);
  }

  /** Плашка с именем у курсора: тёмно-зелёная, белый жирный текст (на скриншоте оригинала). */
  private showName(holder: string, gx: number, gy: number) {
    const name = this.rules.texts.characters[holder] ?? "";
    if (!name || !this.people[holder][0].visible) return;
    if (this.nameTip.name !== holder) {
      this.nameTip.removeChildren().forEach((c) => c.destroy());
      const text = pop(name, "Verdana14", COLOR.white, { align: "center" });
      text.anchor.set(0.5, 0.5);
      const w = text.textWidth + 24;
      const h = text.textHeight + 12;
      const box = new Graphics().rect(-w / 2, -h, w, h).fill(0x006400).stroke({ color: 0x000000, width: 1 });
      text.position.set(0, -h / 2);
      this.nameTip.addChild(box, text);
      this.nameTip.name = holder;
    }
    const p = this.toLocal({ x: gx, y: gy });
    // над курсором-губами (его картинка поднимается на 20 px над точкой), в пределах экрана
    const half = this.nameTip.width / 2;
    this.nameTip.position.set(Math.max(half + 4, Math.min(800 - half - 4, p.x)), Math.max(this.nameTip.height + 4, p.y - 22));
    this.nameTip.visible = true;
  }

  private hideName() {
    this.nameTip.visible = false;
    this.nameTip.name = "";
  }

  /** Город показали игроку: слуга с заданием — подсказки town_talker_large, затем town_talker (первый раз). */
  entered() {
    // подсказки про персонажей — часть обучения первой локации, в остальных городах их нет
    if (this.rules.location !== 1 || !this.quests.available("old_servant").length) return;
    const first = this.tut.show("town_talker_large", 0, 0, false, () => this.tut.show("town_talker", 0, 0));
    if (!first) this.tut.show("town_talker", 0, 0);
  }

  /**
   * Персонаж стоит в городе, когда у него есть задание (сыщик «приезжает» на следующий день и т. д.);
   * слуга Айрис живёт здесь и виден всегда.
   */
  refresh() {
    for (const name of Object.keys(this.people)) {
      const has = this.quests.available(name).length > 0;
      for (const c of this.people[name]) c.visible = has || name === "old_servant";
    }
  }

  private async talk(holder: string) {
    if (this.busy) return;
    const list = this.quests.available(holder);
    if (!list.length) {
      const name = this.rules.texts.characters[holder] ?? "";
      return toast(this.overlay, `${name}: заданий пока нет`);
    }
    this.busy = true;
    const { quest, data } = list[0];
    const talk = new Talk(this.rules.texts.buttons.ok || "OK");
    this.overlay.addChild(talk);
    await talk.play(
      data.dialog,
      (a) => this.quests.answerActive(a, quest),
      (a) => this.quests.run(a.actions, quest),
    );
    this.quests.run(data.actions, quest);
    talk.destroy({ children: true });
    this.busy = false;
    this.refresh();
    this.events.saved();
    // после первого разговора — на ферму (town_show_farm_baloon)
    this.tut.show("town_show_farm_baloon", 630, 60);
  }
}
