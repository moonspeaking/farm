// Правила «Фермы Айрис» из xml/ оригинала (выгружает tools/export_mf1.py).
import type { Quest } from "./quests";

export interface Vegetation {
  exp_for_pour?: number;
  price_buy: number;
  price_sell: number;
  life: number;
  hunger_min: number;
  hunger_max: number;
  min_product_delay: number;
  max_product_delay: number;
  /** Сколько плодов собрать до перехода на следующую стадию (-1 — последняя стадия). */
  upgrade: number;
  upgrade_to_vegetation?: string;
  image_offset: [number, number];
  nodes: [number, number][];
  products: string[];
  probabilities: number[];
}

export interface Product {
  price: number;
  exp: number;
  offset: [number, number];
}

export interface Place {
  position: [number, number];
  dimensions: [number, number];
}

export interface StorageLevel extends Place {
  object: string;
  /** Левый верх препятствия объекта (position — где рисуется картинка). */
  obstacle: [number, number];
  capacity: number;
  price: number;
  /** На сколько пикселей опускается содержимое при пустой ёмкости (progress_height). */
  progress_height: number;
  image_offset: [number, number];
}

export interface BugAnim {
  rows: number;
  time: number;
  loop: boolean;
}

export interface BugDef {
  folder: string;
  attack?: number;
  click_radius?: number;
  obst_radius?: number;
  life?: number;
  speed?: number;
  items: string;
  reincorn: string;
  anims: Record<string, BugAnim>;
}

/** Что отличает ферму и город локации 2–4 от локации 1 (корень rules.json описывает локацию 1). */
export interface LocationRules {
  day_time: number;
  seeds: string[];
  ridges: Place[];
  ridges_for_sale: Place[];
  water_storage: StorageLevel[];
  product_storage: StorageLevel[];
  well: Rules["well"];
  prices: { ridge: number; water: number };
  waves: Rules["waves"];
  arrive_positions: [number, number][];
  bouquets: string[][];
  shop_positions: Rules["shop_positions"];
  obstacles: Place[];
  quests: Record<string, Quest>;
  holders: Record<string, Place>;
}

export interface Rules {
  /** Имена картинок фона фермы, ящиков и города: у локации 1 — bg, box…, у остальных — farm_bg_N и т. д. */
  bg_image: string;
  box_image: string;
  box_content_image: string;
  box_mask_image: string;
  town_bg_image: string;
  /** Номер локации, для которой собраны эти правила. */
  location: number;
  /** Верхние левые углы кнопок «Продать плоды» и «Купить воду» и кнопки колодца (shop_control локации). */
  shop_positions: { sell_prod: [number, number]; buy_water: [number, number]; well: [number, number] };
  locations: Record<string, LocationRules>;
  global_map: Record<string, { position: [number, number]; dimensions: [number, number]; image: string }>;
  start: { gold: number; water: number; vegetations: string[] };
  day_time: number;
  seeds: string[];
  vegetations: Record<string, Vegetation>;
  products: Record<string, Product>;
  ridges: Place[];
  obstacles: Place[];
  ridges_for_sale: Place[];
  water_storage: StorageLevel[];
  product_storage: StorageLevel[];
  well: Place & { image_offset: [number, number]; pail: Place; delay: number; fill_time: number; water_capacity: number; price: number; pail_height: number };
  prices: { ridge: number; water: number };
  images: string[];
  quests: Record<string, Quest>;
  holders: Record<string, Place>;
  bugs: Record<string, BugDef>;
  /** Волна на каждый день: группы вредителей, delay — пауза после группы. */
  waves: { bugs: string[]; delay: number }[][];
  arrive_positions: [number, number][];
  helper: { attack: number; attack_period: number; attack_range: number; speed: number; radius: number; start_skill_prob: number; per_level_skill_prob: number; icon_offset: [number, number] };
  /** Метки, которые игра ставит по дню (set_mark_by_day): shop_barrel — с 5-го дня и т. д. */
  marks_by_day: Record<string, number>;
  weapon_attack: number;
  /** Шаги туториала из properties_ru.xml → tutorial: позиция пузыря и светлая картинка под затемнением. */
  tutorial_steps: Record<string, { pos: [number, number]; alpha: number; pointer: boolean; image: string | null; image_pos: [number, number] }>;
  default_scores: { name: string; days: number; money: number }[];
  audio: string[];
  exp_levels: number[];
  skill_limits: Record<string, number>;
  skills: Record<string, Record<string, number>[]>;
  skill_events: Record<string, ({ value: number } & Record<string, number>)[]>;
  bouquets: string[][];
  bouquet_price_k: number;
  progresses: Record<string, { image: string; max: number; offset: [number, number] }>;
  strong_heart: number;
  weather: Record<string, { bug_arrive: number; hungry: number; product: number }>;
  texts: {
    title: string;
    names: Record<string, string>;
    stats: Record<string, string>;
    warnings: Record<string, string>;
    events: Record<string, string>;
    shop: Record<string, string>;
    desc: Record<string, string>;
    buttons: Record<string, string>;
    shop_buttons: Record<string, string>;
    buy_water: Record<string, string>;
    new_game: Record<string, string>;
    characters: Record<string, string>;
    global_map: Record<string, string>;
    buttons_menu: Record<string, string>;
    bug_names: Record<string, string>;
    skill_names: Record<string, string>;
    skill_characteristics: Record<string, string>;
    skill_desc: Record<string, string>;
    skill_up: Record<string, string>;
    bonus_events: Record<string, string>;
    bouquets_screen: Record<string, string>;
    tutorial: Record<string, string>;
    headers: Record<string, string>;
    options: Record<string, string>;
    game_menu: Record<string, string>;
    pause: Record<string, string>;
    highscores: Record<string, string>;
  };
}

export async function loadRules(): Promise<Rules> {
  const res = await fetch("data/rules.json");
  const rules = (await res.json()) as Rules;
  Object.assign(rules, { bg_image: "bg", box_image: "box", box_content_image: "box_content", box_mask_image: "box_mask", town_bg_image: "town_bg", location: 1 });
  return rules;
}

const overlays = new Map<string, Rules>();

/** Правила локации n: общие + то, что задано для неё отдельно. Локация 1 — сами правила. */
export function locationRules(base: Rules, n: number): Rules {
  if (n === 1) return base;
  const key = `${n}`;
  let r = overlays.get(key);
  if (!r) {
    r = {
      ...base, ...base.locations[key], location: n,
      bg_image: `farm_bg_${n}`, box_image: `box_${n}`, box_content_image: `box_content_${n}`, box_mask_image: `box_mask_${n}`, town_bg_image: `town_bg_${n}`,
    };
    overlays.set(key, r);
  }
  return r;
}

/** Случайное число между a и b (в XML бывает min > max — берём как есть, порядок не важен). */
export const rand = (a: number, b: number) => Math.min(a, b) + Math.random() * Math.abs(b - a);

/** Подстановка %ключей% и переводы строк «\n» из строк оригинала. */
export function fmt(s: string | undefined, vars: Record<string, string | number> = {}) {
  let out = (s ?? "").replace(/\\n/g, "\n");
  for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`%${k}%`, String(v));
  return out.trim();
}
