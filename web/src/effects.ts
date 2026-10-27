// Прогрессы над объектами (properties_ru.xml → progresses): ряд капель жажды, цветочков жизни растения, сердечек вредителей.
import { Container, Sprite } from "pixi.js";
import { image } from "./ui";

/** Ряд одинаковых значков, выровненный по центру; set(n) показывает n штук из max. */
export class IconRow extends Container {
  private readonly icons: Sprite[] = [];

  private readonly base: number;

  constructor(name: string, readonly max: number, private readonly step = 0, scale = 1) {
    super();
    this.base = scale;
    for (let i = 0; i < max; i++) {
      const s = image(name);
      s.anchor.set(0.5, 1);
      s.scale.set(scale);
      this.icons.push(s);
      this.addChild(s);
    }
    this.set(0);
  }

  /**
   * Ряд, показывающий остаток value (exe, 0x425860): одна иконка — unit, последняя рисуется уменьшенной на долю остатка;
   * иконки идут вплотную друг к другу.
   */
  setValue(value: number, unit: number) {
    const n = Math.max(0, Math.min(this.max, Math.ceil(value / unit - 1e-6)));
    const w = this.step || this.icons[0].texture.width * this.icons[0].scale.x;
    this.icons.forEach((s, i) => {
      s.visible = i < n;
      const k = i === n - 1 ? Math.min(1, value - i * unit > 0 ? (value - i * unit) / unit : 1) : 1;
      s.scale.set(this.base * k);
      s.x = (i - (n - 1) / 2) * w;
      // уменьшенная иконка остаётся по центру своей клетки
      s.y = -(s.texture.height * this.base * (1 - k)) / 2;
    });
    this.visible = n > 0;
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
