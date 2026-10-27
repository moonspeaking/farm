// Карта мира (global_map): города и фермы четырёх локаций; открытые квестами светятся при наведении.
import { Container, Graphics, Rectangle } from "pixi.js";
import type { Rules } from "./rules";
import type { Game } from "./state";
import type { Tutorial } from "./tutorial";
import { COLOR, H, image, pop, roundButton, W } from "./ui";

export interface MapEvents {
  openTown(n: number): void;
  openFarm(n: number): void;
  close(): void;
}

export class WorldMap extends Container {
  private readonly places: { key: string; spot: Container; hover: Container }[] = [];
  private readonly tip = pop("", "Verdana14", COLOR.white, { align: "center" });
  private readonly tipBack = new Graphics();

  constructor(private readonly rules: Rules, private readonly game: Game, private readonly events: MapEvents, private readonly tut: Tutorial) {
    super();
    const t = rules.texts;
    this.addChild(image("global_map_back"));
    for (const [key, p] of Object.entries(rules.global_map)) {
      const [kind, num] = key.split("_");
      const n = Number(num);
      const spot = new Container();
      spot.position.set(...p.position);
      spot.hitArea = new Rectangle(0, 0, p.dimensions[0], p.dimensions[1]);
      // active_image показывается при наведении (normal_image в XML пуст)
      const hover = image(`map_${kind}_${n}`);
      hover.visible = false;
      spot.addChild(hover);
      spot.eventMode = "static";
      spot.cursor = "talk";
      spot.on("pointerover", () => {
        if (!this.open(key)) return;
        hover.visible = true;
        this.showTip(this.placeName(kind, n), p.position[0] + p.dimensions[0] / 2, p.position[1]);
      });
      spot.on("pointerout", () => {
        hover.visible = false;
        this.hideTip();
      });
      spot.on("pointertap", () => {
        if (!this.open(key)) return;
        if (kind === "town") this.events.openTown(n);
        else this.events.openFarm(n);
      });
      this.places.push({ key, spot, hover });
      this.addChild(spot);
    }
    this.addChild(this.tipBack, this.tip);
    const back = roundButton(t.buttons.back ?? "Назад", () => this.events.close());
    back.position.set(W - 110, H + 10);
    this.addChild(back);
    this.refresh();
  }

  private open(key: string) {
    const [kind, num] = key.split("_");
    const reg = kind === "town" ? this.game.world.towns : this.game.world.farms;
    return !!reg[`location_${num}`];
  }

  /** Названия городов — global_map в ru.xml; у ферм своих названий нет, подпись — по городу рядом. */
  private placeName(kind: string, n: number) {
    const town = this.rules.texts.global_map[`town_${n}`] ?? `Город ${n}`;
    return kind === "town" ? town : `Ферма (${town})`;
  }

  private showTip(text: string, x: number, y: number) {
    this.tip.text = text;
    const w = this.tip.textWidth + 16;
    const h = this.tip.textHeight + 8;
    const bx = Math.max(4, Math.min(W - w - 4, x - w / 2));
    const by = Math.max(4, y - h - 6);
    this.tipBack.clear().roundRect(bx, by, w, h, 6).fill({ color: 0x000000, alpha: 0.7 });
    this.tip.position.set(bx + w / 2, by + 4);
    this.tip.visible = this.tipBack.visible = true;
  }

  private hideTip() {
    this.tip.visible = this.tipBack.visible = false;
  }

  /** Карту открыли: первый раз — подсказка про первый город. */
  opened() {
    this.refresh();
    this.tut.show("first_town", 0, 0);
  }

  /** Закрытые места не реагируют на наведение. */
  refresh() {
    for (const p of this.places) {
      p.spot.cursor = this.open(p.key) ? "talk" : "default";
      p.hover.visible = false;
    }
    this.hideTip();
  }
}
