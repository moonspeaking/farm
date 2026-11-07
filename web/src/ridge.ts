// Грядка и растение на ней. Числа — из правил оригинала; допущения помечены.
import { Container, Sprite, Texture } from "pixi.js";
import { IconRow } from "./effects";
import { Place, Rules, Vegetation } from "./rules";
import type { Game, PlantSave } from "./state";
import { image, tex } from "./ui";

const silhouettes = new Map<string, Texture>();

/**
 * Красный силуэт растения (0x44cbb0): у каждого пикселя остаётся альфа, цвет — 0xff0000. Он ложится поверх растения
 * с прозрачностью, растущей по мере того, как кончается вода, и трава «желтеет и сохнет».
 */
function silhouette(name: string) {
  let t = silhouettes.get(name);
  if (!t) {
    const src = tex(name);
    const cv = document.createElement("canvas");
    cv.width = src.width;
    cv.height = src.height;
    const g = cv.getContext("2d")!;
    g.drawImage(src.source.resource as CanvasImageSource, 0, 0);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "#ff0000";
    g.fillRect(0, 0, cv.width, cv.height);
    t = Texture.from(cv);
    silhouettes.set(name, t);
  }
  return t;
}


interface Plant extends PlantSave {
  def: Vegetation;
  view: Sprite;
  /** Красный силуэт поверх растения (засыхание). */
  dry: Sprite;
  views: (Sprite | null)[];
  /** Сколько секунд плод в узле уже созрел (для бонуса «Быстрый Сбор»). */
  ripeFor: number[];
}

export interface RidgeEvents {
  /** Нажатие по лунке или растению (ферма решает, что делать). */
  tap(ridge: RidgeView): void;
  /** Курсор над лункой или растением. */
  hover(ridge: RidgeView): void;
  say(text: string, x: number, y: number): void;
  /** Плод собран в корзину (из любого источника: игрок или Робин). */
  harvested(ridge: RidgeView, product: string, x: number, y: number, ripeFor: number, byPlayer: boolean): void;
  /** Растение должно засохнуть: true — в первый раз делается исключение (first_vegetation_dead), оно остаётся с полным запасом воды. */
  spareDry(ridge: RidgeView): boolean;
  /** Окно быстрого сбора (плод ждёт дольше секунды) или быстрого полива (растение хочет пить дольше секунды) закрылось без действия. */
  windowMissed(kind: "gather" | "pour"): void;
  /** Растение погибло: «засохло» или «съедено». */
  died(ridge: RidgeView, reason: "thirst" | "eaten"): void;
  /** Растение ушло на следующую стадию. */
  grew(ridge: RidgeView): void;
  /** Растение захотело пить (появились капли). */
  hungry(ridge: RidgeView): void;
  /** На растении созрел плод. */
  appeared(ridge: RidgeView, x: number, y: number): void;
}

/** Семейство растения/продукта: romashka_2 → romashka, p_rose_3 → rose. */
export const family = (name: string) => name.replace(/^p_/, "").replace(/_\d+$/, "");

export class RidgeView extends Container {
  plant: Plant | null = null;
  readonly ground: Sprite;
  private readonly plantLayer = new Container();
  private readonly fx = new Container();
  private readonly drops = new IconRow("drop", 10);
  private readonly lives = new IconRow("flower", 3, 0, 1);
  /** Точка опоры растения — центр лунки (в её координатах). */
  readonly anchorPoint: [number, number];

  /** Глубина для сортировки на ферме — нижний край грядки: вредитель, стоящий ниже, рисуется поверх и принимает удары. */
  get depth() {
    return this.y + this.place.dimensions[1];
  }

  constructor(
    readonly place: Place,
    private readonly rules: Rules,
    private readonly game: Game,
    private readonly events: RidgeEvents,
  ) {
    super();
    const [x, y] = place.position;
    const [w, h] = place.dimensions;
    this.position.set(x, y);
    // точка грядки в exe (0x439b60 / 0x439bf0) — position + dimensions / 2 целочисленным делением: к ней идут Робин и вредители
    this.anchorPoint = [Math.trunc(w / 2), Math.trunc(h / 2)];
    this.ground = image("ridge");
    this.ground.anchor.set(0.5);
    this.ground.position.set(...this.anchorPoint);
    this.ground.eventMode = "static";
    this.ground.cursor = "default";
    this.ground.on("pointertap", () => this.events.tap(this));
    this.ground.on("pointerover", () => this.events.hover(this));
    this.addChild(this.ground, this.plantLayer, this.fx, this.drops, this.lives);
    // progresses/center_offset: капли жажды — у основания (0; −10), цветочки жизни — над растением (0; −110)
    const p = rules.progresses;
    this.drops.position.set(this.anchorPoint[0] + p.vegetation_hunger.offset[0], this.anchorPoint[1] + p.vegetation_hunger.offset[1]);
    this.lives.position.set(this.anchorPoint[0] + p.attack_vegetation.offset[0], this.anchorPoint[1] + p.attack_vegetation.offset[1]);
  }

  private day = false;

  /**
   * Курсоры зависят от режима: в течение дня над жаждущим растением и его грядкой — бочка («полив»), иначе обычный;
   * между днями пустая грядка — монетки («купить»), растение — обычный.
   */
  setDay(day: boolean) {
    this.day = day;
    this.updateCursors();
  }

  private updateCursors() {
    const planted = !!this.plant;
    // бочка днём — только над растением, которому нужен полив
    const pour = this.day && this.thirsty;
    this.ground.cursor = pour ? "pour" : this.day || planted ? "default" : "buy";
    if (this.plant) this.plant.view.cursor = pour ? "pour" : "default";
  }

  /** Запас жизни: life из XML и умение «фермерство» (vegetation_life). */
  get maxLife() {
    return (this.plant?.def.life ?? 1) * (1 + this.game.bonus("farm", "vegetation_life"));
  }

  // ---------------------------------------------------------------- растение

  setPlant(name: string, save?: PlantSave) {
    this.clearPlant();
    const def = this.rules.vegetations[name];
    const view = image(name);
    // image_offset из XML — сдвиг картинки растения от точки опоры
    view.position.set(this.anchorPoint[0] + def.image_offset[0], this.anchorPoint[1] + def.image_offset[1]);
    view.eventMode = "static";
    view.on("pointertap", () => this.events.tap(this));
    view.on("pointerover", () => this.events.hover(this));
    this.plantLayer.addChild(view);
    // капли жажды — у основания растения: у высоких растений третьей фермы (ананас, кактус) точка опоры посередине картинки,
    // и капли на стандартном смещении оказывались над самим растением
    const hungerOffset = this.rules.progresses.vegetation_hunger.offset;
    // смещение (0; −10) в данных — центр ряда капель, а не нижний край: картинка капли 20 × 34, ряд центрируется по этой точке (exe 0x425860)
    const base = this.anchorPoint[1] + hungerOffset[1] + tex("drop").height / 2;
    const bottom = view.y + view.height;
    this.drops.y = bottom > this.anchorPoint[1] + 44 ? bottom - 10 : base; // обычные растения не трогаем — только те, что уходят заметно ниже точки опоры
    const dry = new Sprite(silhouette(name));
    dry.eventMode = "none";
    dry.alpha = 0;
    view.addChild(dry);
    const thirstTotal = this.nextThirst(def);
    const produceTotal = this.nextProduce(def, name);
    this.plant = {
      name, def, view, dry, thirstLost: 0, damage: 0,
      thirstIn: thirstTotal, thirstTotal,
      produceIn: produceTotal, produceTotal,
      harvested: 0,
      products: def.nodes.map(() => null),
      ...(save ?? {}),
      views: def.nodes.map(() => null),
      ripeFor: def.nodes.map(() => Infinity), // плоды из сохранения считаются давно созревшими
    };
    this.plant.products.forEach((p, i) => p && this.showProduct(i, p));
    this.updateCursors();
    this.updateRows();
  }

  /**
   * Сколько секунд растение проживёт без полива (Vegetation::update, 0x44e520): целые границы
   * round(hunger_min·Kw·Kh) … round(hunger_max·Kw·Kh), внутри — равномерно; Kw — погода hungry, Kh = 1 + умение «фермерство».
   * Пить оно «хочет», когда осталось меньше половины.
   */
  private nextThirst(def: Vegetation) {
    const k = (this.rules.weather[this.game.weather]?.hungry ?? 1) * (1 + this.game.bonus("farm", "hungry"));
    const lo = Math.round(def.hunger_min * k);
    const hi = Math.round(def.hunger_max * k);
    return lo + Math.random() * (hi - lo);
  }

  /**
   * Задержка до нового плода (0x44e350): целые границы round(min_product_delay·K) … round(max_product_delay·K),
   * K = погода product · (1 − new_product) · (1 − new_product_specific_<семейство>) — эти два умения в exe вычитаются.
   */
  private nextProduce(def: Vegetation, name: string) {
    const k = (this.rules.weather[this.game.weather]?.product ?? 1)
      * (1 - this.game.bonus("farm", "new_product")) * (1 - this.game.productSpecificBonus(family(name)));
    const lo = Math.round(def.min_product_delay * k);
    const hi = Math.round(def.max_product_delay * k);
    return lo + Math.random() * (hi - lo);
  }

  clearPlant() {
    this.eatenFor = 0;
    if (!this.plant) return;
    for (const s of this.plant.views) s?.destroy();
    this.plant.view.destroy();
    this.plant = null;
    this.updateCursors();
    this.drops.set(0);
    this.lives.set(0);
  }

  savePlant(): PlantSave | null {
    const p = this.plant;
    if (!p) return null;
    const { name, thirstLost, damage, thirstIn, thirstTotal, produceIn, produceTotal, harvested, products, pours } = p;
    return { name, thirstLost, damage, thirstIn, thirstTotal, produceIn, produceTotal, harvested, pours, products: [...products] };
  }

  /** Начало и конец дня: время жизни без воды выбирается заново (с погодой нового дня), как после полива; растение снова обычного цвета. */
  resetThirst() {
    const p = this.plant;
    if (!p) return;
    p.thirstTotal = this.nextThirst(p.def);
    p.thirstIn = p.thirstTotal;
    this.updateRows();
    this.updateCursors();
  }

  /** Конец дня: несобранные плоды пропадают, таймер появления следующего заводится заново. */
  clearProducts() {
    const p = this.plant;
    if (!p) return;
    p.views.forEach((v, i) => {
      v?.destroy();
      p.views[i] = null;
      p.products[i] = null;
      p.ripeFor[i] = Infinity;
    });
    p.produceTotal = this.nextProduce(p.def, p.name);
    p.produceIn = p.produceTotal;
  }

  /** Полив днём: true, если растение хотело пить. */
  water(): boolean {
    const p = this.plant;
    if (!p || !this.thirsty) return false;
    p.thirstTotal = this.nextThirst(p.def);
    p.thirstIn = p.thirstTotal;
    this.updateRows();
    this.updateCursors();
    // рост (0x44eec0): каждый полив жаждущего растения уменьшает счётчик (в начале равен upgrade из XML); на нуле растение сменяется следующей
    // стадией (upgrade_to_vegetation, звук vegetation_upgrade). Сбор плодов на рост не влияет, умение grow_up в exe не читается.
    p.pours = (p.pours ?? 0) + 1;
    const next = p.def.upgrade_to_vegetation;
    if (next && p.def.upgrade > 0 && p.pours >= p.def.upgrade && this.rules.vegetations[next]) {
      const keep = { thirstIn: p.thirstIn, thirstTotal: p.thirstTotal, thirstLost: p.thirstLost, harvested: p.harvested };
      // несобранные плоды переходят на новую стадию (на тех же узлах, где они есть), а не пропадают при смене картинки растения
      const ripe = p.products.map((n, i) => ({ n, f: p.ripeFor[i] }));
      this.setPlant(next);
      Object.assign(this.plant!, keep);
      const np = this.plant!;
      ripe.forEach(({ n, f }, i) => {
        if (!n || i >= np.products.length) return;
        np.products[i] = n;
        np.ripeFor[i] = f;
        this.showProduct(i, n);
      });
      this.events.grew(this);
    }
    return true;
  }

  /** Состояние жажды для бонусов полива: сколько секунд растение хочет пить и сколько секунд жизни у него осталось. */
  thirstInfo() {
    const p = this.plant;
    if (!p || !this.thirsty) return { seconds: 0, left: Infinity };
    // seconds — сколько уже хочет пить; left — сколько осталось жить (в exe «Экономный Полив» сравнивает именно его с 3,0)
    return { seconds: p.thirstTotal / 2 - p.thirstIn, left: p.thirstIn };
  }

  get thirsty() {
    return !!this.plant && this.plant.thirstIn < this.plant.thirstTotal / 2;
  }

  /** Точка опоры растения в координатах фермы. */
  base(): [number, number] {
    return [this.x + this.anchorPoint[0], this.y + this.anchorPoint[1]];
  }

  /** Сколько ещё показывать здоровье: цветочки видны, пока вредитель ест растение, и пропадают, когда он перестал. */
  private eatenFor = 0;

  /** Укус вредителя: attack из XML снимает жизнь растения. true — растение съедено. */
  bite(n: number): boolean {
    const p = this.plant;
    if (!p) return false;
    p.damage += n;
    this.eatenFor = 0.3;
    if (p.damage >= this.maxLife) return this.die("eaten");
    this.updateRows();
    return false;
  }

  private die(reason: "thirst" | "eaten") {
    this.clearPlant();
    this.events.died(this, reason);
    return true;
  }

  /** Номер узла с созревшим плодом или -1. */
  readyProduct() {
    return this.plant ? this.plant.products.findIndex((s) => s !== null) : -1;
  }

  collect(i: number, byPlayer = true) {
    const p = this.plant;
    const name = p?.products[i];
    if (!p || !name) return;
    const g = this.game;
    const ripeFor = p.ripeFor[i];
    if (g.storageCount() >= g.storageMax) {
      const at = { x: this.x + this.anchorPoint[0], y: this.y - 20 };
      return this.events.say(this.rules.texts.events.no_room ?? "Хранилище заполнено", at.x, at.y);
    }
    g.storage.set(name, (g.storage.get(name) ?? 0) + 1);
    const at = { x: this.x + p.view.x + p.def.nodes[i][0], y: this.y + p.view.y + p.def.nodes[i][1] - 20 };
    p.views[i]?.destroy();
    p.views[i] = null;
    p.products[i] = null;
    p.harvested += 1;
    g.changed();
    this.events.harvested(this, name, at.x, at.y, ripeFor, byPlayer);
  }

  private spawnProduct() {
    const p = this.plant!;
    const free = p.products.findIndex((s) => s === null);
    if (free < 0) return false;
    // продукт выбирается по вероятностям probability из XML
    const total = p.def.probabilities.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let k = 0;
    while (k < p.def.products.length - 1 && (r -= p.def.probabilities[k]) > 0) k++;
    p.products[free] = p.def.products[k];
    p.ripeFor[free] = 0;
    this.showProduct(free, p.def.products[k]);
    const at = { x: this.x + p.view.x + p.def.nodes[free][0], y: this.y + p.view.y + p.def.nodes[free][1] };
    this.events.appeared(this, at.x, at.y);
    return true;
  }

  private showProduct(i: number, name: string) {
    const p = this.plant!;
    const s = image(name);
    const [nx, ny] = p.def.nodes[i];
    const [ox, oy] = this.rules.products[name]?.offset ?? [0, 0];
    // узел — от левого верхнего угла картинки растения, offset продукта — от узла
    s.position.set(p.view.x + nx + ox, p.view.y + ny + oy);
    s.eventMode = "static";
    s.cursor = "gather_product";
    s.on("pointertap", (e) => {
      e.stopPropagation();
      this.collect(i);
    });
    this.fx.addChildAt(s, 0);
    p.views[i] = s;
  }

  // ---------------------------------------------------------------- такт (только днём)

  update(dt: number) {
    const p = this.plant;
    if (!p) return;
    p.products.forEach((s, i) => {
      if (!s) return;
      const was = p.ripeFor[i];
      p.ripeFor[i] += dt;
      if (was < 1 && p.ripeFor[i] >= 1) this.events.windowMissed("gather");
    });
    this.eatenFor = Math.max(0, this.eatenFor - dt);
    // таймер жизни без воды идёт всегда; плоды растут независимо от жажды (0x44e520)
    const wasThirsty = this.thirsty;
    const wasWaiting = this.thirsty ? p.thirstTotal / 2 - p.thirstIn : 0;
    p.thirstIn -= dt;
    if (wasThirsty && wasWaiting < 1 && p.thirstTotal / 2 - p.thirstIn >= 1) this.events.windowMissed("pour");
    if (!wasThirsty && this.thirsty) {
      this.events.hungry(this);
      this.updateCursors();
    }
    if (p.thirstIn <= 0) {
      if (this.events.spareDry(this)) {
        p.thirstTotal = this.nextThirst(p.def);
        p.thirstIn = p.thirstTotal;
        this.updateRows();
        return;
      }
      this.die("thirst");
      return;
    }
    if (p.products.includes(null)) {
      p.produceIn -= dt;
      if (p.produceIn <= 0 && this.spawnProduct()) {
        p.produceTotal = this.nextProduce(p.def, p.name);
        p.produceIn = p.produceTotal;
      }
    }
    this.updateRows();
  }

  /**
   * Капли — остаток времени жизни без воды (0x425860): одна капля = T0/10 секунд, их становится меньше, а последняя уменьшается;
   * показаны, пока растение хочет пить. Растение краснеет с альфой 3·(0,25 − T/T0) (0x44ea20): с последней четверти времени.
   * Цветочки — остаток жизни при укусах.
   */
  private updateRows() {
    const p = this.plant;
    if (!p) return;
    const max = this.maxLife;
    if (this.thirsty) this.drops.setValue(p.thirstIn, p.thirstTotal / 10);
    else this.drops.set(0);
    p.dry.alpha = Math.max(0, Math.min(1, 3 * (0.25 - p.thirstIn / p.thirstTotal)));
    // цветочки жизни убывают так же плавно, как капли: один цветочек = max/3 жизни, последний уменьшается
    if (this.eatenFor > 0 && p.damage > 0) this.lives.setValue(Math.max(0, max - p.damage), max > this.lives.max ? max / this.lives.max : 1);
    else this.lives.set(0);
  }

  /** Перерыв между днями: капли и таймеры стоят. */
  pause() {
    this.drops.visible = false;
    this.lives.visible = false;
  }

  resume() {
    this.updateRows();
  }
}
