// Прогрессы над объектами (properties_ru.xml → progresses): ряд капель жажды, цветочков жизни растения, сердечек вредителей.
import { Container, Sprite } from "pixi.js";
import { image } from "./ui";

/** Ряд одинаковых значков, выровненный по центру; set(n) показывает n штук из max. */
export class IconRow extends Container {
  private readonly icons: Sprite[] = [];

  constructor(name: string, readonly max: number, private readonly step = 0, scale = 1) {
    super();
    for (let i = 0; i < max; i++) {
      const s = image(name);
      s.anchor.set(0.5, 1);
      s.scale.set(scale);
      this.icons.push(s);
      this.addChild(s);
    }
    this.set(0);
  }

  set(count: number) {
    const n = Math.max(0, Math.min(this.max, Math.round(count)));
    const w = this.step || this.icons[0].width * 0.82;
    this.icons.forEach((s, i) => {
      s.visible = i < n;
      s.x = (i - (n - 1) / 2) * w;
    });
    this.visible = n > 0;
  }
}
