// Интерфейс на графике и шрифтах «Фермы Айрис» (картинки — public/img, шрифты — public/fonts).
import { Assets, Container, Graphics, NineSliceSprite, Sprite, Texture } from "pixi.js";
import { FontName, PopLabel, PopOptions, rgb } from "./popfont";

export const W = 800;
export const H = 600;

let loaded: string[] = [];

export async function loadImages(names: string[], onProgress?: (fraction: number) => void) {
  await Assets.load(names.map((n) => ({ alias: `img:${n}`, src: `img/${n}.webp` })), onProgress);
  loaded = names;
}

/**
 * Оригинал рисует картинки 1:1 с точечной выборкой (линейный фильтр включается только у масштабированных, 0x4e51d0),
 * поэтому остаётся резким; при крупном масштабе экрана берём точечную выборку и мы.
 */
export function setSharp(on: boolean) {
  for (const n of loaded) tex(n).source.scaleMode = on ? "nearest" : "linear";
}

export const tex = (name: string) => Texture.from(`img:${name}`);

export function image(name: string) {
  return new Sprite(tex(name));
}

/** Цвета из button_styles и shop_control properties_ru.xml. */
export const COLOR = {
  normal: rgb(250, 190, 100),
  normalActive: rgb(255, 220, 150),
  small: rgb(170, 170, 255),
  smallActive: rgb(255, 255, 255),
  menu: rgb(255, 255, 100),
  menuActive: rgb(255, 255, 175),
  shop: rgb(176, 140, 64),
  shopActive: rgb(126, 100, 24),
  price: rgb(220, 236, 110),
  disabled: rgb(190, 190, 190),
  black: 0x000000,
  white: 0xffffff,
};

/** Надпись шрифтом оригинала. */
export function pop(text: string, font: FontName, color = COLOR.white, opts: PopOptions = {}) {
  return new PopLabel(font, text, { color, ...opts });
}

function press(c: Container, scale: number, onTap: () => void) {
  c.eventMode = "static";
  c.cursor = "pointer";
  c.on("pointerdown", () => c.scale.set(scale));
  c.on("pointerup", () => c.scale.set(1));
  c.on("pointerupoutside", () => c.scale.set(1));
  c.on("pointertap", (e) => {
    e.stopPropagation();
    c.scale.set(1);
    onTap();
  });
}

export interface ShopButton extends Container {
  setEnabled(on: boolean): void;
}

/**
 * Кнопка магазина оригинала (shop_button_small / medium, 100×60). Малая — две дощечки: цена сверху
 * (palatino, 220;236;110) и действие снизу (shop-стиль, 176;140;64). Средняя — одна дощечка с двумя строками.
 */
export function shopButton(kind: "small" | "medium", top: string, bottom: string | null, onTap: () => void): ShopButton {
  const c = new Container() as ShopButton;
  // средняя дощечка растягивается по ширине под длинное название, рамка не искажается (девятизонная нарезка)
  const bg: Sprite | NineSliceSprite =
    kind === "medium" ? new NineSliceSprite({ texture: tex("shop_medium"), leftWidth: 10, rightWidth: 10, topHeight: 10, bottomHeight: 10 }) : image("shop_small");
  if (bg instanceof Sprite) bg.anchor.set(0.5);
  else {
    bg.x = -bg.width / 2;
    bg.y = -bg.height / 2;
  }
  c.addChild(bg);
  const texts: PopLabel[] = [];
  if (kind === "small") {
    const price = pop(top, "palatino_14", COLOR.price, { align: "center" });
    price.anchor.set(0.5, 0.5);
    price.position.set(0, -12);
    texts.push(price);
    if (bottom) {
      const act = pop(bottom, "palatino_14", COLOR.shop, { align: "center" });
      act.anchor.set(0.5, 0.5);
      act.position.set(0, 13);
      texts.push(act);
    }
  } else {
    const t = pop(top, "palatino_14", COLOR.shop, { align: "center", lineOffset: -4 });
    t.anchor.set(0.5, 0.5);
    // длинные названия («Денежное дерево») — дощечка шире, по центру
    if (bg instanceof NineSliceSprite && t.textWidth > 80) {
      bg.width = t.textWidth + 44;
      bg.x = -bg.width / 2;
    }
    texts.push(t);
  }
  c.addChild(...texts);
  let enabled = true;
  c.setEnabled = (on) => {
    enabled = on;
    bg.texture = tex(on ? `shop_${kind}` : `shop_${kind}_cant`);
    for (const t of texts) t.alpha = on ? 1 : 0.8;
  };
  press(c, 0.95, () => enabled && onTap());
  return c;
}

/** Круглая кнопка меню оригинала (buttons/back 206×198), видна нижняя половина у края экрана. */
export function roundButton(text: string, onTap: () => void, labelY = 32) {
  const c = new Container();
  const bg = image("round_button");
  bg.anchor.set(0.5);
  const t = pop(text, "TC4_16_en", COLOR.white, { align: "center" });
  t.anchor.set(0.5, 0.5);
  t.y = labelY; // подпись начинается в 120 px от верха картинки (back_offset), то есть на y = 10 экрана
  c.addChild(bg, t);
  c.hitArea = { contains: (x: number, y: number) => x * x + y * y < 95 * 95 };
  press(c, 0.96, onTap);
  return c;
}

const STYLES = {
  normal: { font: "rubius_24" as FontName, color: COLOR.normal, active: COLOR.normalActive },
  small: { font: "arial_narrow_bold_24" as FontName, color: COLOR.small, active: COLOR.smallActive },
  menu: { font: "rubius_30" as FontName, color: COLOR.menu, active: COLOR.menuActive },
  shop: { font: "palatino_14" as FontName, color: COLOR.shop, active: COLOR.shopActive },
};

/** Текстовая кнопка оригинала без подложки (button_styles: цвет в покое и при наведении). */
export function textButton(text: string, onTap: () => void, kind: keyof typeof STYLES = "normal", maxWidth = 0): PopLabel {
  const s = STYLES[kind];
  let t = pop(text, s.font, s.color, { align: "center" });
  // надпись шире отведённого места — уменьшаем шрифт, чтобы она влезла в рамку
  if (maxWidth > 0 && t.textWidth > maxWidth) {
    const k = maxWidth / t.textWidth;
    t.destroy();
    t = pop(text, s.font, s.color, { align: "center", scale: k });
  }
  t.anchor.set(0.5, 0.5);
  t.on("pointerover", () => t.setColor(s.active));
  t.on("pointerout", () => t.setColor(s.color));
  press(t, 0.95, onTap);
  return t;
}

export interface DialogButton {
  text: string;
  value: string;
}

/**
 * Окно на свитке оригинала (message_screen / dialog_roll). Возвращает value нажатой кнопки,
 * или "cancel", если нажали мимо окна.
 */
export function dialog(
  parent: Container,
  opts: {
    title?: string;
    body?: string;
    content?: Container;
    buttons: DialogButton[];
    width?: number;
    /** Сдвиг по горизонтали от центра экрана (на ферме окно по центру поля правее панели). */
    offsetX?: number;
    /** Получает функцию закрытия окна — для кнопок внутри content. */
    bind?: (close: (value: string) => void) => void;
  },
): Promise<string> {
  return new Promise((resolve) => {
    const layer = new Container();
    const shade = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.4 });
    shade.eventMode = "static";
    layer.addChild(shade);

    const box = new Container();
    const width = opts.width ?? 520;
    let y = 50;
    const items: Container[] = [];
    if (opts.title) {
      const t = pop(opts.title, "TC4_16_en", COLOR.black, { align: "center", scale: 1.15 });
      t.y = y;
      y += t.textHeight + 6;
      items.push(t);
    }
    if (opts.body) {
      const t = pop(opts.body, "Verdana14", COLOR.black, { align: "center", wrap: width - 110, lineOffset: -2 });
      t.y = y;
      y += t.textHeight + 10;
      items.push(t);
    }
    if (opts.content) {
      opts.content.y = y;
      y += opts.content.height + 10;
      items.push(opts.content);
    }
    const height = Math.max(200, y + 92);
    const roll = image("dialog");
    roll.width = width;
    roll.height = height;
    roll.x = -width / 2;
    box.addChild(roll, ...items);

    const finish = (v: string) => {
      layer.destroy({ children: true });
      resolve(v);
    };
    opts.bind?.(finish);
    const step = Math.min(180, (width - 80) / opts.buttons.length);
    opts.buttons.forEach((b, i) => {
      const btn = textButton(b.text, () => finish(b.value));
      btn.position.set((i - (opts.buttons.length - 1) / 2) * step, height - 70);
      box.addChild(btn);
    });
    box.position.set(W / 2 + (opts.offsetX ?? 0), Math.max(10, (H - height) / 2));
    shade.on("pointertap", () => finish("cancel"));
    layer.addChild(box);
    parent.addChild(layer);
  });
}

/** Всплывающая надпись события (шрифт bonus_events_white: «Нет Воды», «Хранилище Заполнено»). */
export function toast(parent: Container, message: string, x = W / 2, y = 260, scale = 0.62) {
  const t = pop(message, "bonus_events_white", COLOR.white, { align: "center", scale });
  t.anchor.set(0.5, 0.5);
  t.position.set(Math.max(150, Math.min(W - 150, x)), y);
  parent.addChild(t);
  let life = 1.6;
  const tick = () => {
    life -= 1 / 60;
    t.alpha = Math.min(1, life / 0.4);
    t.y -= 0.4;
    if (life <= 0) return void t.destroy({ children: true });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Плавающие очки (шрифт float_points: «+2» у цветка). */
export function floatPoints(parent: Container, value: string, x: number, y: number, color = COLOR.white) {
  const t = pop(value, "float_points", color, { align: "center", scale: 0.7 });
  t.anchor.set(0.5, 0.5);
  t.position.set(x, y);
  parent.addChild(t);
  let life = 1.2;
  const tick = () => {
    life -= 1 / 60;
    t.alpha = Math.min(1, life / 0.4);
    t.y -= 0.6;
    if (life <= 0) return void t.destroy({ children: true });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
