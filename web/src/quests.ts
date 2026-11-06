// Движок квестов «Фермы Айрис»: условия и действия из xml/locations/location_1_quests.xml.
import type { Game } from "./state";

export interface Cond {
  type: string;
  [k: string]: string;
}

export type Action = Cond;

export interface DialogNode {
  kind: "phrase" | "question";
  talker: string;
  text: string;
  answers?: Answer[];
}

export interface Answer {
  text: string;
  active_if: Cond[];
  dialog: DialogNode[];
  actions: Action[];
}

export interface SubQuest {
  holder: string;
  header: string;
  dialog: DialogNode[];
  actions: Action[];
}

export interface Quest {
  header: string;
  enabled_sub_quests: string[];
  enable_condition: Cond[];
  sub_quests: Record<string, SubQuest>;
}

/** Сохраняемое состояние квестов. */
export interface QuestState {
  enabled: Record<string, string[]>;
  status: Record<string, string>;
  /** Устарело: метки теперь общие для всех локаций (Game.marks); поле нужно старым сохранениям. */
  marks?: string[];
  /** day_delay: день, когда условие впервые стало выполнимым. */
  delays: Record<string, number>;
  /** Записи об открытии городов, ферм и т. п. (устаревшее поле старых сохранений). */
  unlocks: string[];
  /** Предметы квестов (не плоды и не деньги): ракушки улиток и т. п. */
  /** Устарело: предметы квестов теперь общие (Game.items) — их приносят из одной локации в другую. */
  items?: Record<string, number>;
  /** enable_bug_item: сколько ещё предметов может выпасть из вредителей. */
  bugItems?: Record<string, number>;
  /** disable_bug_wave: названия вредителей, которые пока не появляются (enable_bug_wave возвращает их). */
  bugsOff?: string[];
  /** enable_helper: Робин живёт на ферме. */
  helper?: boolean;
}

export function newQuestState(quests: Record<string, Quest>): QuestState {
  return {
    enabled: Object.fromEntries(Object.entries(quests).map(([k, q]) => [k, [...q.enabled_sub_quests]])),
    status: {}, delays: {}, unlocks: [],
  };
}

export interface QuestHooks {
  /** Убрать все растения с грядок (remove_all_vegetations). */
  removeAllVegetations(): void;
  /** Сообщение игроку о событии квеста. */
  notify(text: string): void;
  /** add_vegetation: посадить растение name на свободную грядку (false — места нет или такого растения нет). */
  addVegetation(name: string): boolean;
  /** remove_vegetation: убрать с грядок все растения name. */
  removeVegetation(name: string): void;
  /** Поставлена метка (set_mark): win — конец основной игры, показывается подсказка game_fin. */
  marked(mark: string): void;
  /** have_empty_ridge: есть ли свободная грядка. */
  hasEmptyRidge(): boolean;
}

export class QuestEngine {
  constructor(
    readonly quests: Record<string, Quest>,
    private readonly game: Game,
    private readonly hooks: QuestHooks,
  ) {}

  private get st() {
    return this.game.quests;
  }

  // ---------------------------------------------------------------- условия

  private count(name: string) {
    if (name === "money") return this.game.gold;
    if (this.game.storage.has(name)) return this.game.storage.get(name) ?? 0;
    return this.game.items[name] ?? 0;
  }

  check(c: Cond, questName: string): boolean {
    switch (c.type) {
      case "have_mark":
        return this.game.hasMark(c.mark);
      case "have_items":
        return this.count(c.name) >= Number(c.count);
      case "quest_status":
        return (this.st.status[c.name] ?? "") === c.status;
      case "have_empty_ridge":
        return this.hooks.hasEmptyRidge();
      case "day_delay": {
        const key = `${questName}:${c.id}`;
        if (this.st.delays[key] === undefined) this.st.delays[key] = this.game.day;
        return this.game.day >= this.st.delays[key] + Number(c.delay);
      }
      default:
        return false;
    }
  }

  /**
   * Условия проверяются по порядку из XML до первого невыполненного (так в exe); day_delay запоминает день своей
   * первой проверки, поэтому отсчёт идёт с момента, когда выполнены условия, стоящие перед ним.
   */
  private enabledQuest(name: string) {
    const q = this.quests[name];
    // статус «done» — лишь флаг для условий других квестов: пока у квеста есть включённые части, они доступны
    // (в loc4 afterparty2/d2w ставит done и тут же включает d2e, который ставит метку dragon_sick)
    return q.enable_condition.every((c) => this.check(c, name));
  }

  answerActive(a: Answer, questName: string) {
    return a.active_if.every((c) => this.check(c, questName));
  }

  /** Задания, которые сейчас может выдать персонаж. */
  available(holder: string): { quest: string; sub: string; data: SubQuest }[] {
    const out = [];
    for (const [name, q] of Object.entries(this.quests)) {
      if (!this.enabledQuest(name)) continue;
      for (const sub of this.st.enabled[name] ?? []) {
        const data = q.sub_quests[sub];
        if (data?.holder === holder) out.push({ quest: name, sub, data });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- действия

  run(actions: Action[], questName: string) {
    const g = this.game;
    const st = this.st;
    for (const a of actions) {
      const n = Number(a.count ?? 0);
      switch (a.type) {
        case "enable_sub_quest":
          st.enabled[questName] = [...new Set([...(st.enabled[questName] ?? []), a.name])];
          break;
        case "disable_sub_quest":
          st.enabled[questName] = (st.enabled[questName] ?? []).filter((s) => s !== a.name);
          break;
        case "set_quest_status":
          st.status[questName] = a.status;
          break;
        case "set_mark":
          if (!g.marks.includes(a.mark)) {
            g.marks.push(a.mark);
            this.hooks.marked(a.mark);
          }
          break;
        case "reset_mark":
          g.marks = g.marks.filter((m) => m !== a.mark);
          break;
        case "add_items":
          if (a.name === "money") g.gold += n;
          else if (g.rules.products[a.name]) g.storage.set(a.name, (g.storage.get(a.name) ?? 0) + n);
          else g.items[a.name] = (g.items[a.name] ?? 0) + n;
          if (a.name === "money") this.hooks.notify(`+${n}$`);
          break;
        case "remove_items":
          if (a.name === "money") g.gold = Math.max(0, g.gold - n);
          else if (g.storage.has(a.name)) g.storage.set(a.name, Math.max(0, (g.storage.get(a.name) ?? 0) - n));
          else g.items[a.name] = Math.max(0, (g.items[a.name] ?? 0) - n);
          break;
        case "set_money":
          g.gold = n;
          break;
        case "enable_buy_vegetation":
          if (!g.seeds.includes(a.name)) g.seeds.push(a.name);
          break;
        case "disable_buy_vegetation":
          g.seeds = g.seeds.filter((s) => s !== a.name);
          break;
        case "add_vegetation":
          this.hooks.addVegetation(a.name);
          break;
        case "remove_vegetation":
          this.hooks.removeVegetation(a.name);
          break;
        // Волны в данных безымянные (wave.0…); по exe enable/disable_bug_wave принимают name — здесь это имя вредителя.
        case "enable_bug_wave":
          st.bugsOff = (st.bugsOff ?? []).filter((b) => b !== a.name);
          break;
        case "disable_bug_wave":
          st.bugsOff = [...new Set([...(st.bugsOff ?? []), a.name])];
          break;
        case "remove_all_vegetations":
          this.hooks.removeAllVegetations();
          break;
        case "enable_helper":
          g.helper = true;
          this.hooks.notify("Робин теперь живёт на ферме");
          break;
        case "disable_helper":
          g.helper = false;
          break;
        case "clear_bouquets":
          // испытания детектива начинают ферму заново: заказы букетов и собранные цветы пропадают
          g.bouquets = { next: 0, orders: [], done: 0 };
          break;
        case "enable_bug_item":
          g.bugItems[a.item] = (g.bugItems[a.item] ?? 0) + n;
          break;
        case "enable_town":
        case "disable_town":
          g.world.towns[a.name] = a.type === "enable_town";
          break;
        case "enable_farm":
        case "disable_farm":
          g.world.farms[a.name] = a.type === "enable_farm";
          break;
      }
    }
    g.changed();
  }
}
