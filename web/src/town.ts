// Город первой локации (town_screen): персонажи с заданиями, продавцы, возврат на ферму.
import { Container, Sprite } from "pixi.js";
import type { QuestEngine } from "./quests";
import type { Rules } from "./rules";
import { Talk } from "./talk";
import type { Tutorial } from "./tutorial";
import { COLOR, image, pop, roundButton, toast } from "./ui";

export interface TownEvents {
  toFarm(): void;
  toMap(): void;
  saved(): void;
}

export class Town extends Container {
  private readonly markers: Record<string, Sprite> = {};
  /** Картинка и подпись каждого персонажа — прячутся, пока у него нет заданий. */
  private readonly people: Record<string, Container[]> = {};
  private readonly overlay = new Container();
  private busy = false;

  constructor(
    private readonly rules: Rules,
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
      const mark = image("quest_info");
      mark.anchor.set(0.5, 1);
      mark.scale.set(1.3);
      mark.position.set(s.x + s.width / 2, s.y + 64);
      this.markers[name] = mark;
      const label = pop(t.characters[name] ?? "", "comic_stroke_white_14", COLOR.white, { align: "center", scale: 0.6 });
      label.anchor.set(0.5, 0);
      label.position.set(s.x + s.width / 2, s.y + s.height - 22);
      // имя персонажа показывается только при наведении
      label.visible = false;
      label.eventMode = "none";
      s.on("pointerover", () => (label.visible = s.visible));
      s.on("pointerout", () => (label.visible = false));
      this.people[name] = [s];
      this.addChild(s, label, mark);
    }

    // круглые кнопки town_screen, как на ферме: to_global_map (193; -110) и shop_screen_farm (527; -110)
    const map = roundButton(t.buttons.town_to_global_map ?? "На Карту", () => this.events.toMap());
    map.position.set(193 + 103, -110 + 99);
    const farm = roundButton(t.buttons.shop_screen_farm ?? "На Ферму", () => this.events.toFarm());
    farm.position.set(527 + 103, -110 + 99);
    this.addChild(map, farm);
    this.addChild(this.overlay);
    this.refresh();
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
    for (const [name, mark] of Object.entries(this.markers)) {
      const has = this.quests.available(name).length > 0;
      mark.visible = has;
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
    const talk = new Talk(this.rules.texts.characters, this.rules.texts.buttons.ok || "OK");
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
