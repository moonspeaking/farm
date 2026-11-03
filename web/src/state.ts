// Состояние фермы, опыт и умения Айрис, заказы на букеты; сохранение между запусками.
import { newQuestState, QuestState } from "./quests";
import { locationRules } from "./rules";
import { currentProfile } from "./profiles";
import { KEYS, saveKey, store } from "./storage";
import type { ArriverState } from "./bugs";
import type { Rules } from "./rules";

export interface PlantSave {
  name: string;
  /** Потеряно жизни от жажды и от укусов вредителей (жизнь — life из XML, умноженная на умение «фермерство»). */
  thirstLost: number;
  damage: number;
  thirstIn: number;
  thirstTotal: number;
  produceIn: number;
  produceTotal: number;
  harvested: number;
  /** Сколько раз растение полили, когда оно хотело пить (рост по счётчику upgrade). */
  pours?: number;
  products: (string | null)[];
}

export type SkillName = "trade" | "farm" | "attack" | "helper_attack" | "helper_pour" | "helper_product";
export const SKILLS: SkillName[] = ["trade", "farm", "attack", "helper_pour", "helper_product", "helper_attack"];

export interface BouquetOrder {
  items: string[];
  placed: (string | null)[];
}

export type Weather = "normal" | "rain" | "sun";

/** Сколько уровней ёмкости есть у фермы с начала: подряд идущие, стоящие 0 (в локации 2 первый ящик стоит 1500 — его нет). */
export function ownedLevels(levels: { price: number }[]) {
  let n = 0;
  while (n < levels.length && levels[n].price === 0) n++;
  return n;
}

/** То, что у каждой фермы своё: вода, ящики, колодец, плоды, грядки, семена, заказы букетов. */
export interface FarmState {
  water: number;
  barrels: number;
  boxes: number;
  well: boolean;
  storage: Record<string, number>;
  boughtRidges: number[];
  plants: (PlantSave | null)[];
  seeds: string[];
  bouquets: { next: number; orders: BouquetOrder[]; done: number };
}

/** Что открыто на карте мира (квесты: enable_town / enable_farm). */
export interface WorldState {
  towns: Record<string, boolean>;
  farms: Record<string, boolean>;
}

interface SaveV3 {
  version: 3;
  day: number;
  gold: number;
  exp: number;
  skills: Record<SkillName, number>;
  kills: Record<string, number>;
  gathered: Record<string, number>;
  attackSpecific: Record<string, number>;
  productSpecific: Record<string, number>;
  tutorial: string[];
  loc: number;
  farms: Record<number, FarmState>;
  questStates: Record<number, QuestState>;
  world: WorldState;
  marks?: string[];
  items?: Record<string, number>;
  bugItems?: Record<string, number>;
}

interface Save {
  version: 2;
  day: number;
  gold: number;
  water: number;
  exp: number;
  skills: Record<SkillName, number>;
  kills: Record<string, number>;
  gathered: Record<string, number>;
  attackSpecific: Record<string, number>;
  productSpecific: Record<string, number>;
  barrels: number;
  boxes: number;
  well: boolean;
  storage: Record<string, number>;
  boughtRidges: number[];
  plants: (PlantSave | null)[];
  seeds: string[];
  quests: QuestState;
  bouquets: { next: number; orders: BouquetOrder[]; done: number };
  tutorial: string[];
}


type Listener = () => void;

export interface Options {
  music: number;
  sound: number;
  cursors: boolean;
  warnings: boolean;
  /** Окно с итогами дня после «Закончить День» (в оригинале его нет). */
  dayStats: boolean;
  /** Звёздочки у счётчиков панели, когда значение меняется. */
  sparkles: boolean;
}

export function loadOptions(): Options {
  const def: Options = { music: 0.5, sound: 0.7, cursors: true, warnings: true, dayStats: false, sparkles: true };
  return { ...def, ...(store.getJson<Partial<Options>>(KEYS.options) ?? {}) };
}

export function saveOptions(o: Options) {
  store.setJson(KEYS.options, o);
}

export class Game {
  day = 1;
  gold: number;
  water: number;
  exp = 0;
  skills: Record<SkillName, number> = { trade: 0, farm: 0, attack: 0, helper_attack: 0, helper_pour: 0, helper_product: 0 };
  /** Убито вредителей по папке спрайтов (snail, pchela…) и собрано плодов по семейству (romashka…). */
  kills: Record<string, number> = {};
  gathered: Record<string, number> = {};
  /** Уровни «особых» умений: атака по виду вредителя и продуктивность вида растения. */
  attackSpecific: Record<string, number> = {};
  productSpecific: Record<string, number> = {};
  /** Куплено бочек и ящиков: первый уровень в XML стоит 0 и есть с начала игры. */
  barrels = 1;
  boxes = 1;
  /** Колодец нужно купить (в магазине он полупрозрачен, пока не куплен). */
  well = false;
  /** Собранные плоды по имени продукта. */
  storage = new Map<string, number>();
  boughtRidges: number[] = [];
  savedPlants: (PlantSave | null)[] = [];
  /** Что продаётся в магазине семян (квесты могут добавлять и убирать растения). */
  seeds: string[];
  /** Квесты хранятся отдельно для каждой локации (в каждой свои квесты); this.quests — текущей. */
  questStates: Record<number, QuestState> = {};
  /** Состояния ферм остальных локаций (текущей — в самом объекте до switchLocation). */
  farms: Record<number, FarmState> = {};
  world: WorldState = { towns: { location_1: true }, farms: { location_1: true } };
  /** Метки квестов общие для всех локаций (например win, found_parrot ставятся в одних, а проверяются в других). */
  marks: string[] = [];
  /** Предметы квестов (ракушки, дубинки…) и сколько их ещё может выпасть из вредителей — общие для локаций. */
  items: Record<string, number> = {};
  bugItems: Record<string, number> = {};
  /** Волны вредителей по локациям (BugArriver фермы): живут, пока идёт игра, в сохранение не пишутся — как в exe. */
  arrivers: Record<number, ArriverState> = {};
  loc = 1;
  bouquets: { next: number; orders: BouquetOrder[]; done: number } = { next: 0, orders: [], done: 0 };
  tutorial: string[] = [];
  weather: Weather = "normal";
  private listeners: Listener[] = [];

  /** Игрок, чья это игра: сохраняется только в его запись, даже если в меню выбрали другого. */
  readonly profile = currentProfile()?.id ?? "0";

  constructor(readonly base: Rules) {
    this.gold = base.start.gold;
    this.water = base.start.water;
    this.seeds = [...base.seeds];
    this.questStates[1] = newQuestState(base.quests);
    this.fillOrders();
  }

  /** Правила текущей локации. */
  get rules(): Rules {
    return locationRules(this.base, this.loc);
  }

  get quests(): QuestState {
    return (this.questStates[this.loc] ??= newQuestState(this.rules.quests));
  }

  set quests(v: QuestState) {
    this.questStates[this.loc] = v;
  }

  private snapshot(plants = this.savedPlants): FarmState {
    return {
      water: this.water, barrels: this.barrels, boxes: this.boxes, well: this.well, storage: Object.fromEntries(this.storage),
      boughtRidges: this.boughtRidges, plants, seeds: this.seeds, bouquets: this.bouquets,
    };
  }

  private restore(f: FarmState) {
    this.water = f.water;
    this.barrels = f.barrels;
    this.boxes = f.boxes;
    this.well = f.well;
    this.storage = new Map(Object.entries(f.storage));
    this.boughtRidges = f.boughtRidges;
    this.savedPlants = f.plants;
    this.seeds = f.seeds;
    this.bouquets = f.bouquets;
  }

  /** Переход в локацию n: состояние текущей фермы откладывается, подгружается состояние n (или начальное). */
  switchLocation(n: number) {
    if (n === this.loc) return;
    this.farms[this.loc] = this.snapshot();
    this.loc = n;
    const rules = this.rules;
    this.restore(
      this.farms[n] ?? {
        water: this.base.start.water, barrels: ownedLevels(rules.water_storage), boxes: ownedLevels(rules.product_storage), well: false, storage: {}, boughtRidges: [], plants: [],
        seeds: [...rules.seeds], bouquets: { next: 0, orders: [], done: 0 },
      },
    );
    this.fillOrders();
    this.changed();
  }

  /** Подписка на изменения; возвращает функцию отписки (уничтоженная ферма или город не должны получать события). */
  onChange(fn: Listener) {
    this.listeners.push(fn);
    return () => void (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  changed() {
    for (const fn of this.listeners) fn();
  }

  /**
   * Каждая бочка и каждый ящик — отдельный объект, их capacity складываются: покупка уровня прибавляет его вместимость
   * (exe: 0x4445d0 → 0x40f490 для воды, 0x433490 → 0x40f470 для склада). Ферма 1: 8 → 18 → 30 литров, 15 → 35 → 60 плодов.
   */
  get waterMax() {
    return this.rules.water_storage.slice(0, this.barrels).reduce((a, l) => a + l.capacity, 0);
  }

  get storageMax() {
    return this.rules.product_storage.slice(0, this.boxes).reduce((a, l) => a + l.capacity, 0);
  }

  storageCount() {
    let n = 0;
    for (const v of this.storage.values()) n += v;
    return n;
  }

  /** Метка: поставлена квестом или днём (set_mark_by_day). */
  hasMark(name: string) {
    const day = this.rules.marks_by_day[name];
    return this.marks.includes(name) || (day !== undefined && this.day >= day);
  }

  // ---------------------------------------------------------------- опыт и умения

  /** Уровень Айрис: exp_levels из skills.xml — пороги опыта для уровней 2, 3… */
  get level() {
    let l = 1;
    for (const t of this.rules.exp_levels) if (this.exp >= t) l++;
    return l;
  }

  /** Опыт на текущем уровне: [накоплено, нужно до следующего]. */
  get levelProgress(): [number, number] {
    const th = this.rules.exp_levels;
    const i = this.level - 1;
    const from = i === 0 ? 0 : th[i - 1];
    const to = th[i] ?? th[th.length - 1];
    return [Math.min(this.exp, to) - from, Math.max(1, to - from)];
  }

  get skillPoints() {
    const spent = Object.values(this.skills).reduce((a, b) => a + b, 0);
    return Math.max(0, this.level - 1 - spent);
  }

  /** Сумма добавок key по взятым уровням умения; не больше предела из skill_limits. */
  bonus(skill: SkillName, key: string) {
    const levels = this.rules.skills[skill] ?? [];
    let sum = 0;
    for (let i = 0; i < Math.min(this.skills[skill], levels.length); i++) sum += levels[i][key] ?? 0;
    return Math.min(sum, this.rules.skill_limits[key] ?? Infinity);
  }

  /** Возвращает, сколько уровней набрано. */
  addExp(n: number) {
    const before = this.level;
    this.exp += n;
    this.changed();
    return this.level - before;
  }

  /** Прибавка к скорости плодоношения вида: каждый уровень особого умения даёт new_product_specific. */
  productSpecificBonus(fam: string) {
    const levels = this.rules.skill_events.gather_product ?? [];
    let sum = 0;
    for (let i = 0; i < Math.min(this.productSpecific[fam] ?? 0, levels.length); i++) sum += levels[i].new_product_specific ?? 0;
    return Math.min(sum, this.rules.skill_limits.new_product_specific ?? Infinity);
  }

  /** Прибавка к атаке против вида вредителя (attack_specific за каждый уровень особого умения). */
  attackSpecificBonus(folder: string) {
    const levels = this.rules.skill_events.kill_bugs_specific ?? [];
    let sum = 0;
    for (let i = 0; i < Math.min(this.attackSpecific[folder] ?? 0, levels.length); i++) sum += levels[i].attack_specific ?? 0;
    return Math.min(sum, this.rules.skill_limits.attack_specific ?? Infinity);
  }

  /** Цена продажи с умением «торговля» (sell_goods) и покупки (buy_goods). */
  sellPrice(base: number) {
    return Math.round(base * (1 + this.bonus("trade", "sell_goods")));
  }

  buyPrice(base: number) {
    return Math.max(1, Math.round(base * (1 - this.bonus("trade", "buy_goods"))));
  }

  // ---------------------------------------------------------------- заказы на букеты

  /** Четыре заказа из bouquet_set по порядку; выполненный заменяется следующим. */
  fillOrders() {
    const b = this.bouquets;
    while (b.orders.length < 4) {
      const items = this.rules.bouquets[b.next % this.rules.bouquets.length];
      b.next += 1;
      b.orders.push({ items: [...items], placed: items.map(() => null) });
    }
  }

  orderPrice(o: BouquetOrder) {
    const sum = o.items.reduce((a, p) => a + (this.rules.products[p]?.price ?? 0), 0);
    return this.sellPrice(sum * this.rules.bouquet_price_k);
  }

  // ---------------------------------------------------------------- сохранение

  save(plants: (PlantSave | null)[]) {
    this.savedPlants = plants;
    const data: SaveV3 = {
      version: 3, day: this.day, gold: this.gold, exp: this.exp, skills: this.skills,
      kills: this.kills, gathered: this.gathered, attackSpecific: this.attackSpecific, productSpecific: this.productSpecific,
      tutorial: this.tutorial, loc: this.loc, farms: { ...this.farms, [this.loc]: this.snapshot(plants) },
      questStates: this.questStates, world: this.world, marks: this.marks, items: this.items, bugItems: this.bugItems,
    };
    store.setJson(saveKey(KEYS.saveV3, this.profile), data);
  }

  /** Локация, где остановился текущий игрок (по ней в меню догружаются картинки); без сохранения — первая. */
  static savedLocation(): number {
    const id = currentProfile()?.id;
    const loc = id ? store.getJson<{ loc?: number }>(saveKey(KEYS.saveV3, id))?.loc : undefined;
    return typeof loc === "number" ? loc : 1;
  }

  /** Есть ли сохранение у текущего игрока. */
  static hasSave() {
    const id = currentProfile()?.id;
    if (!id) return false;
    return !!(store.get(saveKey(KEYS.saveV3, id)) ?? store.get(saveKey(KEYS.saveV2, id)));
  }

  load(): boolean {
    try {
      const raw3 = store.get(saveKey(KEYS.saveV3, this.profile));
      if (raw3) {
        const s = JSON.parse(raw3) as SaveV3;
        if (s.version !== 3) return false;
        Object.assign(this, {
          day: s.day, gold: s.gold, exp: s.exp, skills: s.skills, kills: s.kills, gathered: s.gathered,
          attackSpecific: s.attackSpecific, productSpecific: s.productSpecific, tutorial: s.tutorial,
          questStates: s.questStates, world: s.world, farms: s.farms, loc: s.loc, marks: s.marks ?? [], items: s.items ?? {}, bugItems: s.bugItems ?? {},
        });
        this.mergeOldMarks();
        this.restore(s.farms[s.loc]);
        this.fillOrders();
        return true;
      }
      // сохранение первой версии (одна ферма)
      const raw = store.get(saveKey(KEYS.saveV2, this.profile));
      const s = raw ? (JSON.parse(raw) as Save) : null;
      if (s?.version !== 2) return false;
      Object.assign(this, {
        day: s.day, gold: s.gold, water: s.water, exp: s.exp, skills: s.skills, kills: s.kills, gathered: s.gathered,
        attackSpecific: s.attackSpecific, productSpecific: s.productSpecific, barrels: s.barrels, boxes: s.boxes, well: !!s.well,
        boughtRidges: s.boughtRidges, savedPlants: s.plants, seeds: s.seeds, bouquets: s.bouquets, tutorial: s.tutorial,
        loc: 1, questStates: { 1: s.quests }, marks: [], items: {}, bugItems: {},
      });
      this.mergeOldMarks();
      this.storage = new Map(Object.entries(s.storage));
      this.fillOrders();
      return true;
    } catch {
      return false;
    }
  }

  /** Метки из старых сохранений лежали в состоянии квестов каждой локации. */
  private mergeOldMarks() {
    for (const q of Object.values(this.questStates)) {
      for (const m of q.marks ?? []) if (!this.marks.includes(m)) this.marks.push(m);
      for (const [k, v] of Object.entries(q.items ?? {})) this.items[k] = Math.max(this.items[k] ?? 0, v);
      for (const [k, v] of Object.entries(q.bugItems ?? {})) this.bugItems[k] = Math.max(this.bugItems[k] ?? 0, v);
      delete q.marks;
      delete q.items;
      delete q.bugItems;
    }
  }

  /** Новая игра текущего игрока: его сохранение стирается. */
  static clearSave() {
    const id = currentProfile()?.id;
    if (!id) return;
    store.remove(saveKey(KEYS.saveV2, id));
    store.remove(saveKey(KEYS.saveV3, id));
  }
}
