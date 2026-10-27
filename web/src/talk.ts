// Окно разговора (quest_dialog из properties_ru.xml): портрет говорящего, текст, «назад/дальше», ответы.
import { Container, Graphics, Sprite } from "pixi.js";
import type { PopLabel } from "./popfont";
import type { Answer, DialogNode } from "./quests";
import { fmt } from "./rules";
import { COLOR, H, image, pop, tex, textButton, W } from "./ui";
import { rgb } from "./popfont";

export class Talk extends Container {
  private readonly portrait: Sprite;
  private readonly talkerName: PopLabel;
  private text: PopLabel;
  private readonly controls = new Container();

  constructor(private readonly names: Record<string, string>, private readonly okText = "OK") {
    super();
    const shade = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.35 });
    shade.eventMode = "static";
    const roll = image("dialog");
    roll.position.set((W - roll.width) / 2, 133);
    this.portrait = new Sprite();
    // talker: -1; 283 — портрет стоит у левого края поверх свитка
    this.portrait.anchor.set(0, 1);
    this.portrait.position.set(-1, H);
    this.talkerName = pop("", "BritannicBold14", rgb(110, 60, 20), { scale: 1.1 });
    this.talkerName.position.set(230, 166);
    // text: 97; 195, 600×170, Verdana14 чёрным (сдвинуто вправо, чтобы не заходить под портрет)
    this.text = pop("", "Verdana14", COLOR.black, { wrap: 470 });
    this.text.position.set(230, 194);
    this.addChild(shade, roll, this.portrait, this.talkerName, this.text, this.controls);
  }

  private show(talker: string, text: string) {
    this.portrait.texture = tex(`talker_${talker}`);
    this.portrait.scale.set(0.95);
    this.talkerName.text = this.names[talker] ?? "";
    this.text.text = fmt(text);
  }

  private clearControls() {
    this.controls.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private arrow(kind: "next" | "prev", x: number, onTap: () => void) {
    const s = image(`dialog_${kind}`);
    s.position.set(x, 370);
    s.eventMode = "static";
    s.cursor = "pointer";
    s.on("pointerover", () => (s.texture = tex(`dialog_${kind}_selected`)));
    s.on("pointerout", () => (s.texture = tex(`dialog_${kind}`)));
    s.on("pointertap", onTap);
    this.controls.addChild(s);
  }

  /** Реплики подряд листаются стрелками; возвращает управление на последней. */
  private phrases(list: DialogNode[]): Promise<void> {
    return new Promise((resolve) => {
      let i = 0;
      const render = () => {
        this.clearControls();
        this.show(list[i].talker, list[i].text);
        if (i > 0) this.arrow("prev", 310, () => (i--, render()));
        if (i < list.length - 1) this.arrow("next", 462, () => (i++, render()));
        else {
          // ok: 377; 371 — текстовая кнопка стиля normal на последней реплике
          const ok = textButton(this.okText, resolve);
          ok.position.set(377 + 18, 371 + 17);
          this.controls.addChild(ok);
        }
      };
      render();
    });
  }

  private question(node: DialogNode, active: (a: Answer) => boolean): Promise<Answer> {
    return new Promise((resolve) => {
      this.clearControls();
      this.show(node.talker, node.text);
      let y = 194 + this.text.textHeight + 14;
      for (const a of node.answers ?? []) {
        if (!active(a)) continue;
        const t = pop(`• ${fmt(a.text)}`, "Verdana14", rgb(40, 70, 150), { wrap: 450 });
        t.position.set(244, y);
        t.eventMode = "static";
        t.cursor = "pointer";
        t.on("pointerover", () => t.setColor(rgb(160, 50, 20)));
        t.on("pointerout", () => t.setColor(rgb(40, 70, 150)));
        t.on("pointertap", () => resolve(a));
        this.controls.addChild(t);
        y += t.textHeight + 6;
      }
    });
  }

  /**
   * Проигрывает диалог. onAnswer вызывается для выбранного ответа после его реплик
   * (там выполняются действия ответа).
   */
  async play(nodes: DialogNode[], active: (a: Answer) => boolean, onAnswer: (a: Answer) => void): Promise<void> {
    let run: DialogNode[] = [];
    for (const n of nodes) {
      if (n.kind === "phrase") {
        run.push(n);
        continue;
      }
      if (run.length) await this.phrases(run);
      run = [];
      const a = await this.question(n, active);
      await this.play(a.dialog, active, onAnswer);
      onAnswer(a);
    }
    if (run.length) await this.phrases(run);
  }
}
