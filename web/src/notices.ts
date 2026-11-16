// Уведомления об особых умениях, брызги воды и погода на ферме.
import { Container, Graphics } from "pixi.js";
import type { Weather } from "./state";
import { COLOR, image, pop, W, H } from "./ui";

/**
 * Лист «особое умение улучшено» (game_screen/special_skill_up): выезжает сверху на (103; −5),
 * 278×132, текст в (26; 18) 225×65, полоска прогресса к следующему уровню в (98; 83).
 */
export function skillNotice(parent: Container, text: string, have: number, next: number, color: number) {
  const box = new Container();
  box.addChild(image("paper_sheet"));
  // лист 278 px: переносим по максимально широкой строке, затем сужаем, пока число строк то же — строки получаются ровными, без «висящего» слова
  const make = (wrap: number) => pop(text, "Verdana14", COLOR.black, { align: "center", wrap, lineOffset: -2 });
  let label = make(240);
  const rows = Math.round(label.textHeight / 23);
  for (let w = 235; w >= 120; w -= 5) {
    const t = make(w);
    if (Math.round(t.textHeight / 23) !== rows) break;
    label.destroy();
    label = t;
  }
  // по вертикали — по центру области над полосой (y 8..78); три строки не налезают на полосу
  label.anchor.set(0.5, 0.5);
  label.position.set(139, 43);
  box.addChild(label);
  const back = image("special_back");
  back.position.set(98, 83);
  box.addChild(back);
  const k = next > 0 ? Math.min(1, have / next) : 1;
  box.addChild(new Graphics().roundRect(98 + 6, 83 + 6, 68 * k, 11, 4).fill(color));
  box.position.set(103 + 60, -140);
  parent.addChild(box);
  let t = 0;
  const tick = () => {
    t += 1 / 60;
    // выезд за 0,5 с, пауза 3,5 с, уход за 0,5 с
    const k2 = t < 0.5 ? t / 0.5 : t < 4 ? 1 : Math.max(0, 1 - (t - 4) / 0.5);
    box.y = -140 + 135 * k2;
    if (t >= 4.5) return void box.destroy({ children: true });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Капли воды, разлетающиеся при поливе (частицы water-changes в оригинале — файл .psi). */
export function splash(parent: Container, x: number, y: number) {
  const drops = Array.from({ length: 9 }, () => ({
    g: new Graphics().circle(0, 0, 2 + Math.random() * 2).fill({ color: 0x6fb8ff, alpha: 0.9 }),
    vx: (Math.random() - 0.5) * 140,
    vy: -90 - Math.random() * 70,
  }));
  for (const d of drops) {
    d.g.position.set(x, y);
    parent.addChild(d.g);
  }
  let t = 0;
  const tick = () => {
    t += 1 / 60;
    for (const d of drops) {
      d.vy += 360 / 60;
      d.g.x += d.vx / 60;
      d.g.y += d.vy / 60;
      d.g.alpha = Math.max(0, 1 - t / 0.7);
    }
    if (t >= 0.7) return void drops.forEach((d) => d.g.destroy());
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Погода дня: дождь рисуется падающими штрихами. Оттенка на весь экран у оригинала нет — цвета фона остаются как в файле. */
export class WeatherFx extends Container {
  private weather: Weather = "normal";
  private readonly streaks: { x: number; y: number; v: number }[] = [];
  private readonly g = new Graphics();
  private readonly layer = new Graphics();

  constructor() {
    super();
    for (let i = 0; i < 90; i++) this.streaks.push({ x: Math.random() * W, y: Math.random() * H, v: 420 + Math.random() * 240 });
    this.addChild(this.layer, this.g);
    this.eventMode = "none";
  }

  set(w: Weather) {
    this.weather = w;
    this.layer.clear();
    this.g.clear();
  }

  update(dt: number) {
    if (this.weather !== "rain") return;
    this.g.clear();
    for (const s of this.streaks) {
      s.y += s.v * dt;
      s.x -= s.v * 0.18 * dt;
      if (s.y > H) [s.y, s.x] = [-10, Math.random() * (W + 120)];
      this.g.moveTo(s.x, s.y).lineTo(s.x - 3, s.y + 14).stroke({ color: 0xcfe4ff, width: 1.2, alpha: 0.6 });
    }
  }
}
