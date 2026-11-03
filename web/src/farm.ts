// Ферма первой локации «Фермы Айрис»: подготовка к дню (магазин на объектах) → день → итоги.
import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { audio } from "./audio";
import { BouquetScreen } from "./bouquets";
import { PathGrid } from "./pathgrid";
import { continueDayOverlay } from "./screens";
import { Bug, BugArriver, Helper, newArriverState } from "./bugs";
import { Hud } from "./hud";
import { efficiencyRaised, productivityRaised } from "./names";
import { LevelUp } from "./levelup";
import { skillNotice, splash, WeatherFx } from "./notices";
import { rgb } from "./popfont";
import { family, RidgeView } from "./ridge";
import { fmt, Place, Rules, StorageLevel } from "./rules";
import { REPEAT_HINTS_UNTIL_DAY, type Game, type PlantSave, type Weather } from "./state";
import { Reminder, Tutorial } from "./tutorial";
import { COLOR, dialog, floatPoints, H, image, pop, roundButton, shopButton, type ShopButton, tex, textButton, toast, W } from "./ui";

/** Шаги обучения, уже сдвинутые под перенесённые кнопки. */
const shiftedSteps = new WeakSet<object>();

type Mode = "shop" | "day";

/**
 * Ёмкость с наполнением (бочка с водой, ящик с плодами), 0x40d110: картинка содержимого сдвигается вниз на
 * round((1 − доля) · progress_height) пикселей и показывается только там, где альфа маски непрозрачна.
 */
class Filled extends Container {
  private readonly fill: Sprite;
  private readonly cache = new Map<number, Texture>();
  /** Ключ порядка рисования на ферме; по умолчанию — нижний край картинки. */
  sortKey: number | null = null;

  get depth() {
    return this.sortKey ?? this.y + this.height;
  }

  constructor(base: string, private readonly content: string, private readonly holeName: string, private readonly fillDepth: number) {
    super();
    this.fill = new Sprite();
    this.addChild(image(base), this.fill);
  }

  /** Содержимое, сдвинутое на shift пикселей вниз и обрезанное альфой маски (кадры собираем один раз на сдвиг). */
  private frame(shift: number) {
    let t = this.cache.get(shift);
    if (!t) {
      const c = tex(this.content);
      const cv = document.createElement("canvas");
      cv.width = c.width;
      cv.height = c.height;
      const g = cv.getContext("2d")!;
      g.drawImage(c.source.resource as CanvasImageSource, 0, shift);
      g.globalCompositeOperation = "destination-in";
      g.drawImage(tex(this.holeName).source.resource as CanvasImageSource, 0, 0);
      t = Texture.from(cv);
      this.cache.set(shift, t);
    }
    return t;
  }

  set level(k: number) {
    const shift = Math.floor((1 - Math.max(0, Math.min(1, k))) * this.fillDepth + 0.5);
    // при сдвиге на всю глубину exe ничего не копирует — содержимого не видно
    this.fill.visible = shift < this.fillDepth;
    if (this.fill.visible) this.fill.texture = this.frame(shift);
  }
}

/** Доля общего запаса по ёмкостям (0x443ee0): каждая берёт равную часть, заполняются по порядку. */
function spread(list: Filled[], total: number) {
  const share = 1 / list.length;
  let rest = total;
  for (const f of list) {
    f.level = rest <= share ? rest / share : 1;
    rest -= share;
    if (rest < 0.0001) rest = 0;
  }
}

/**
 * Ступени быстрых бонусов (exe, HintLayer): при созревании / жажде запись получает v = 1,0 и теряет по секунде в секунду;
 * v > 0,5 — «лучший» (×4), v > 0,25 — «хороший» (×3), иначе «обычный» (×2), на v ≤ 0 окно закрыто.
 * Опыт за действие начисляет сам HintLayer: base × множитель вместо base, а не сверх него.
 */
const BONUS_TIERS = [
  { within: 0.5, suffix: "_best", mult: 4 },
  { within: 0.75, suffix: "_good", mult: 3 },
  { within: 1, suffix: "", mult: 2 },
];
/** «Экономный Полив» (exe, HintLayer: сравнение с 3,0): растению осталось жить не больше стольких секунд. */
const ECONOM_POUR_LEFT = 3;
/** controls/time из properties: углы стрелки дня (рад.), положение картинки и точка вращения в ней. */
const CLOCK_ANGLE = [0, 1.57];
const CLOCK_POS = [20, 2];
const CLOCK_PIVOT = [85, 7];
/** Награда опытом = обычная награда действия × множитель (в exe: imul на 2 / 3 / 4, у «Экономного Полива» shl 1). */
const ECONOM_POUR_MULT = 2;

export interface FarmEvents {
  /** «В Город» (to_town: 193; -110). */
  toTown(): void;
  /** «Меню» на левой панели. */
  toMenu(): void;
  /** Завершён день (для таблицы результатов). */
  dayEnded(): void;
}

export class Farm extends Container {
  private mode: Mode = "shop";
  /** Пауза: меню, окна умений и т. п. — таймеры дня стоят. */
  paused = false;
  readonly ridges: RidgeView[] = [];
  private readonly weatherFx = new WeatherFx();
  private readonly objects = new Container();
  private readonly shopLayer = new Container();
  private readonly top = new Container();
  private readonly screens = new Container();
  readonly ui = new Container();
  private readonly hud: Hud;
  private readonly tutorial: Tutorial;
  private readonly barrels: Filled[] = [];
  private readonly boxes: Filled[] = [];
  private readonly well: Sprite;
  private readonly pail: Filled;
  private readonly startBtn: Container;
  private readonly townBtn: Container;
  /** «Закончить День» — досрочное завершение, на месте кнопки «Начать День». */
  private readonly pointer: Sprite;
  private readonly weatherIcon: Sprite;
  private bouquets: BouquetScreen | null = null;
  private dayLeft = 0;
  private harvestedToday = 0;
  private expToday = 0;
  private lastTick = -1;
  private bugs: Bug[] = [];
  /** «Нажмите эту кнопку для начала дня» каждые 10 с, когда растение уже куплено (exe 0x48e960, метка first_vegetation). */
  private readonly startReminder = new Reminder();
  // состояние волн хранится в игре (по локации): между днями и при уходе с фермы не сбрасывается
  private readonly arriver: BugArriver;
  private helper: Helper | null = null;
  /** Колодец: секунды до готовности следующего ведра. */
  /** Колодец (WellControl, 0x4afac0): пауза после использования и наполнение ведра в секундах (0 … fill_time). */
  /** Серии быстрых действий: сбор и полив считаются отдельно. */
  private readonly combo = { gather: 1, pour: 1 };
  private wellCooldown = 0;
  private wellProgress = 0;
  private endPrompt: Container | null = null;
  /** Пустая грядка, на которой сейчас показана кнопка «Посадить растение». */
  private plantTarget: RidgeView | null = null;
  /** Грядка с растением, у которой сейчас кнопка «Продать» (одна, как «Посадить растение»). */
  private sellTarget: RidgeView | null = null;
  /** Покупка (грядка, бочка, ящик, колодец), у которой сейчас показана кнопка «Купить». */
  private buyTarget: string | null = null;

  private unsubscribe: () => void = () => undefined;

  destroy(options?: Parameters<Container["destroy"]>[0]) {
    this.unsubscribe();
    super.destroy(options);
  }

  constructor(private readonly rules: Rules, private readonly game: Game, private readonly events: FarmEvents) {
    super();
    this.arriver = new BugArriver((game.arrivers[rules.location] ??= newArriverState()));
    const t = rules.texts;
    this.addChild(image(rules.bg_image), this.objects, this.weatherFx, this.shopLayer, this.top, this.screens, (this.tutorial = new Tutorial(rules, game, () => audio.options.warnings)));
    this.hud = new Hud(rules, game, { openLevelUp: () => this.openLevelUp(), menu: () => this.openMenu() });
    this.addChild(this.hud, this.ui);
    // подсказки стоят над панелью, чтобы их было видно
    this.addChild(this.tutorial);

    // ---------------- колодец и ведро (location_1.xml: well_00, well_pail_00)
    const wl = rules.well;
    this.well = image("well");
    this.well.position.set(wl.position[0] + wl.image_offset[0], wl.position[1] + wl.image_offset[1]);
    this.well.eventMode = "static";
    this.well.cursor = "default"; // «pour» включает syncWellCursor
    this.well.on("pointertap", () => this.tapWell());
    this.well.on("pointerover", () => this.setBuyTarget("well"));
    // вода в ведре — тот же Filled, что у бочки: картинка воды опускается на pail_height при пустом ведре (0x40d110)
    this.pail = new Filled("pail", "pail_water", "pail_mask", rules.well.pail_height);
    // картинка ведра 70 × 60 стоит в skin_ru.xml → game_screen/well_ctrl/well_pail_00: 240; 440 (exe 0x4146b0 берёт её по имени ведра) —
    // на 10 px левее и на 30 px выше препятствия ведра. Имя ведра на всех фермах одно, а на ферме 3 колодец сдвинут, поэтому
    // сдвиг считаем от препятствия: на фермах 1, 2, 4 это ровно 240; 440, на ферме 3 ведро остаётся у колодца
    this.pail.position.set(wl.pail.position[0] - 10, wl.pail.position[1] - 30);
    this.pail.level = 1;
    this.pail.sortKey = this.well.y + this.well.height + 1; // ведро стоит у колодца и рисуется поверх его картинки
    this.pail.eventMode = "static";
    this.pail.cursor = "default";
    this.pail.on("pointertap", () => this.tapWell());
    this.objects.addChild(this.well, this.pail);

    // ---------------- часы дня (whether_time_ctrl) и круглые кнопки (start_day: 527; -110, to_town: 193; -110)
    const clock = new Container();
    clock.addChild(image("clock_back"));
    this.pointer = image("clock_pointer");
    // стрелка: rotate_pos 20; 2 и rotate_center 85; 7 из controls/time — вращение вокруг (105; 9) элемента (0x4b02d0)
    this.pointer.anchor.set(CLOCK_PIVOT[0] / this.pointer.texture.width, CLOCK_PIVOT[1] / this.pointer.texture.height);
    this.pointer.position.set(CLOCK_POS[0] + CLOCK_PIVOT[0], CLOCK_POS[1] + CLOCK_PIVOT[1]);
    // значок погоды прижат к правому верхнему углу элемента (0x4b0b70: x = ширина − ширина картинки, y = 0)
    this.weatherIcon = image("weather_normal");
    this.weatherIcon.position.set(111 - this.weatherIcon.width, 0);
    clock.addChild(this.pointer, this.weatherIcon, image("clock_fore"));
    clock.position.set(689, 0);
    this.startBtn = roundButton(t.buttons.start_new_day ?? "Начать День", () => void this.startDay());
    // в XML 527; −110, но кнопка заходит на часы дня — сдвинута влево, чтобы не накладываться на них
    this.startBtn.position.set(482 + 103, -110 + 99);
    // подсказка start_day подсвечивает кнопку по XML (528; -110) — сдвигаем её вместе с кнопкой (один раз на набор правил)
    const startStep = rules.tutorial_steps.start_day;
    if (startStep && !shiftedSteps.has(startStep)) {
      shiftedSteps.add(startStep);
      startStep.pos[0] += 482 - 527;
      startStep.image_pos[0] += 482 - 527;
    }
    this.townBtn = roundButton(t.buttons.to_town_from_shop ?? "В Город", () => {
      audio.play("btn_simple_button_activated");
      this.events.toTown();
    });
    this.townBtn.position.set(193 + 103, -110 + 99);
    // часы дня рисуются поверх кнопки «Начать День»: её правый край заходит под них
    this.top.addChild(this.startBtn, this.townBtn, clock);

    // ---------------- сохранение
    rules.ridges.forEach((p) => this.addRidge(p));
    game.boughtRidges.forEach((i) => this.addRidge(rules.ridges_for_sale[i]));
    game.savedPlants.forEach((p, i) => p && this.ridges[i]?.setPlant(p.name, p));
    if (!game.savedPlants.length && rules.location === 1) {
      // vegetations_at_start: стартовое растение уже растёт на первой грядке
      rules.start.vegetations.forEach((v, i) => this.ridges[i]?.setPlant(v));
    }
    this.renderStorages();
    this.syncHelper();
    this.unsubscribe = game.onChange(() => this.renderStats());
    this.enterShop();
  }

  // ================================================================ режимы

  private enterShop() {
    this.mode = "shop";
    this.startBtn.visible = true;
    this.townBtn.visible = true;
    this.pointer.rotation = CLOCK_ANGLE[0];
    for (const r of this.ridges) r.pause();
    this.weatherFx.set("normal");
    this.weatherIcon.texture = tex("weather_normal");
    this.syncWell();
    this.renderShop();
    this.renderStats();
    this.persist();
    this.shopHints();
  }

  /** Подсказки обучения для экрана подготовки. */
  private shopHints() {
    const g = this.game;
    const tut = this.tutorial;
    // пузыри магазина из exe (ShopScreenFarm 0x4acf50, 0x4ad4d0, 0x4adbb0): висят, пока игрок не сделал действие —
    // флаг «сделано» ставит само действие, а не показ (поэтому force: подсказка повторяется при каждом входе в магазин)
    const free = this.ridges.find((x) => !x.plant);
    // подсказки «купите» не показываем, когда денег всё равно не хватает: действие сделать нельзя
    const repeat = g.day <= REPEAT_HINTS_UNTIL_DAY; // дальше пузыри «купите» и «продайте» не повторяются
    const cheapest = Math.min(...this.shopSeeds().map((s) => g.buyPrice(this.rules.vegetations[s].price_buy)));
    if (repeat && free && !g.tutorial.includes("@first_vegetation") && g.gold >= cheapest) tut.show("first_vegetation", free.x + free.anchorPoint[0], free.y + 10, true);
    if (repeat && g.storageCount() > 0 && !g.tutorial.includes("@sell_prod")) tut.show("sell_prod", this.rules.shop_positions.sell_prod[0] + 50, this.rules.shop_positions.sell_prod[1], true);
    if (repeat && g.tutorial.includes("@can_buy_water") && !g.tutorial.includes("@buy_water") && g.gold >= g.buyPrice(this.rules.prices.water)) tut.show("buy_water", 0, 0, true);
    if (g.hasMark("shop_barrel") && this.rules.water_storage[g.barrels]) {
      const nb = this.rules.water_storage[g.barrels];
      // подсказка подсвечивает кнопку «Купить» — показываем её именно у этого объекта
      if (tut.show("barrel", nb.position[0] + 60, nb.position[1] + 60)) this.setBuyTarget("barrel");
    }
    if (g.hasMark("shop_box") && this.rules.product_storage[g.boxes]) {
      const nb = this.rules.product_storage[g.boxes];
      if (tut.show("box", nb.position[0] + 70, nb.position[1] + 40)) this.setBuyTarget("box");
    }
    if (g.hasMark("shop_ridges") && g.boughtRidges.length < this.rules.ridges_for_sale.length) {
      const idx = this.rules.ridges_for_sale.findIndex((_, i) => !g.boughtRidges.includes(i));
      const free = this.rules.ridges_for_sale[idx];
      if (free && tut.show("new_ridge", free.position[0] + 24, free.position[1] + 4)) this.setBuyTarget(`ridge:${idx}`);
    }
    if (g.hasMark("shop_well") && !g.well && tut.show("well", 188, 480)) this.setBuyTarget("well");
  }

  private async startDay() {
    if (this.paused) return;
    const t = this.rules.texts;
    audio.play("btn_simple_button_activated");
    const plants = this.ridges.filter((r) => r.plant).length;
    if (!plants) return toast(this.ui, "Сначала посадите растение");
    const free = this.game.storageMax - this.game.storageCount();
    let warning = "";
    if (this.game.water < plants) warning = t.warnings.low_water;
    else if (free < plants) warning = t.warnings.low_storage_capacity;
    if (warning && audio.options.warnings) {
      const r = await dialog(this.ui, {
        offsetX: 30,
        body: fmt(warning),
        buttons: [{ text: t.buttons.yes ?? "Да", value: "ok" }, { text: t.buttons.no ?? "Нет", value: "no" }],
      });
      if (r !== "ok") return;
    }
    this.tutorial.hide();
    this.markTutorial("@start_day"); // напоминание «Начать День» больше не нужно
    this.mode = "day";
    this.dayLeft = this.rules.day_time;
    this.harvestedToday = 0;
    this.expToday = 0;
    this.lastTick = -1;
    this.startBtn.visible = false;
    this.townBtn.visible = false;
    this.clearShop();
    this.syncWell();
    // начало дня (0x411ba3): ведро полное, пауза сброшена
    this.wellCooldown = 0;
    this.wellProgress = this.rules.well.fill_time;
    this.pail.level = 1;
    // погода дня (exe, 0x411bbe): до 5-го дня всегда обычная, дальше rand() % 3 — поровну обычная, солнце, дождь
    const w: Weather = this.game.day < 5 ? "normal" : (["normal", "sun", "rain"] as const)[Math.floor(Math.random() * 3)];
    this.game.weather = w;
    this.weatherFx.set(w);
    this.weatherIcon.texture = tex(w === "normal" ? "weather_normal" : `weather_${w}`);
    this.weatherIcon.x = 111 - this.weatherIcon.width;
    for (const rid of this.ridges) {
      rid.resetThirst();
      rid.setDay(true);
      rid.resume();
    }
    this.helper?.startDay();
    // TutorialLayer при старте дня (exe 0x4765e0): после первого дня first_flower уже не нужна; в первый день — пузырь у растения
    // (offset −20; −80 из tutorial/first_flower). Подсказки «первых» событий бывают только на ферме 1 — на других флаги ставятся сразу
    if (this.game.day > 1) this.markTutorial("first_flower");
    if (this.game.loc !== 1) for (const id of ["first_no_water", "first_no_room", "first_vegetation_dead"]) this.markTutorial(id);
    const flowerAt = this.ridges.find((x) => x.plant);
    if (flowerAt) {
      const b = flowerAt.base();
      this.tutorial.show("first_flower", b[0] - 20, b[1] - 80);
    }
    audio.play("day_start");
    this.renderStats();
  }

  /**
   * «Быстрый Сбор» / «Быстрый Полив»: нажали вскоре после созревания / после того, как растение захотело пить.
   * Три ступени по времени (окно 1 с по v из exe). Возвращает опыт за действие целиком: base × множитель или base.
   */
  private bonusEvent(kind: "gather" | "pour", seconds: number, x: number, y: number, baseExp: number) {
    const tier = BONUS_TIERS.find((t) => seconds < t.within);
    if (!tier) return baseExp;
    // серия (HintLayer +0x78 у сбора, +0x7c у полива): начинается с 1, после каждого бонуса растёт; при N > 1 к названию добавляется « xN»
    const n = this.combo[kind];
    this.combo[kind] = n + 1;
    this.showBonus(`fast_${kind}${tier.suffix}`, x, y, n);
    return baseExp * tier.mult;
  }

  /** Окно быстрого действия закрылось, а плод не собран / растение не полито — серия начинается заново (0x49ef20). */
  private windowMissed(kind: "gather" | "pour") {
    this.combo[kind] = 1;
  }

  private showBonus(key: string, x: number, y: number, count = 1) {
    const name = this.rules.texts.bonus_events[key] ?? key;
    toast(this.ui, count > 1 ? `${name} x${count}` : name, x, y - 20, 0.85);
    audio.play("product_appear");
  }

  /**
   * Время дня вышло: игра стоит, поле затемнено, по центру круглая кнопка «Закончить День» (continue_day_screen, 347; 197);
   * день заканчивается по нажатию.
   */
  private promptEndDay() {
    if (this.endPrompt) return;
    audio.play("day_end"); // звук конца дня — в тот же миг, когда появляется кнопка, а не после нажатия
    this.endPrompt = continueDayOverlay(this.ui, this.rules, {
      resume: () => undefined,
      endDay: () => {
        this.endPrompt?.destroy({ children: true });
        this.endPrompt = null;
        void this.endDay();
      },
    });
  }

  private async endDay() {
    this.mode = "shop";
    // вредители уходят вместе с днём
    for (const b of this.bugs) b.destroy({ children: true });
    this.bugs = [];
    this.helper?.rest();
    // день кончился — у растений жажда сбрасывается, засохшие на вид возвращаются к норме, несобранные плоды пропадают
    for (const r of this.ridges) {
      r.resetThirst();
      r.clearProducts();
    }
    const day = this.game.day;
    this.game.day += 1;
    this.events.dayEnded();
    this.game.changed();
    // итоги дня — только если включены в опциях (в оригинале после «Закончить День» сразу начинается подготовка)
    if (audio.options.dayStats) {
      this.paused = true;
      await dialog(this.ui, {
        offsetX: 30,
        title: `${this.rules.texts.stats.day_title} ${day}`,
        body: `Собрано плодов: ${this.harvestedToday}\nОпыта получено: ${this.expToday}\nНа складе: ${this.game.storageCount()} / ${this.game.storageMax}`,
        buttons: [{ text: this.rules.texts.buttons.ok ?? "OK", value: "ok" }],
      });
      this.paused = false;
    }
    this.enterShop();
  }

  update(dt: number) {
    this.hud.tick(dt);
    // днём окно подсказки с затемнением ставит игру на паузу до «Закрыть» (exe 0x476cd0); простой пузырь — нет, он гаснет через 10 с
    const waiting = this.mode === "day" && this.tutorial.blocking;
    this.tutorial.update(dt);
    this.bouquets?.update(dt);
    if (this.paused || waiting) return;
    if (this.mode !== "day" && !this.bouquets && this.startBtn.visible) {
      this.startReminder.tick(dt, this.tutorial, this.game.tutorial.includes("@first_vegetation") && !this.game.tutorial.includes("@start_day") && this.game.day <= REPEAT_HINTS_UNTIL_DAY, () => this.tutorial.show("start_day_baloon", 630, 70, true));
    }
    this.weatherFx.update(dt);
    // Робин работает только в течение дня, между днями его на ферме нет
    if (this.helper) this.helper.visible = this.mode === "day";
    this.syncWellCursor();
    if (this.mode !== "day") return;
    if (this.endPrompt) return;
    for (const r of this.ridges) r.update(dt);
    // disable_bug_wave: отключённые квестом вредители не появляются
    const name = this.arriver.tick(this.rules, dt, !this.bugs.some((b) => !b.dead), this.rules.weather[this.game.weather]?.bug_arrive ?? 1);
    if (name && !this.game.quests.bugsOff?.includes(name)) this.spawnBug(name);
    for (const b of this.bugs) {
      b.update(dt);
      // вредитель через 3 с после появления ставит в очередь подсказку «Это вредитель» (exe: таймер +0x3c = 3 в конструкторе Bug, 0x405a2c)
      if (b.hintIn > 0 && (b.hintIn -= dt) <= 0 && !b.dead) this.tutorial.show("bug", b.x, b.y - 40);
    }
    this.bugs = this.bugs.filter((b) => !b.destroyed);
    this.helper?.update(dt, this.bugs, this.ridges, (r) => this.waterRidge(r, true), () => this.pathGrid(this.helper ?? undefined));
    this.sortObjects();
    this.updateWell(dt);
    this.dayLeft -= dt;
    // стрелка часов проходит верхнюю половину циферблата за день
    this.pointer.rotation = CLOCK_ANGLE[0] - (CLOCK_ANGLE[1] - CLOCK_ANGLE[0]) * (1 - Math.max(0, this.dayLeft) / this.rules.day_time);
    // последние пять секунд тикают часы (звук tick.ogg)
    const left = Math.ceil(this.dayLeft);
    if (left <= 5 && left > 0 && left !== this.lastTick) {
      this.lastTick = left;
      audio.play("tick");
    }
    if (this.dayLeft <= 0) this.promptEndDay();
  }

  // ================================================================ опыт и особые умения

  private gainExp(n: number, x: number, y: number) {
    if (n <= 0) return;
    const before = this.game.level;
    this.game.addExp(n);
    this.expToday += n;
    floatPoints(this.ui, `+${n}`, x, y);
    if (this.game.level > before) {
      audio.play("level_up");
      toast(this.ui, `${this.rules.texts.stats.hero_title} ${this.game.level}`, 400, 200);
      this.tutorial.show("level_up", 52, 140);
    }
  }

  /** Счётчик к особому умению (убито вредителей вида / собрано плодов вида); при пороге — новый уровень и лист-уведомление. */
  private specific(kind: "attack" | "product", key: string, name: string) {
    const g = this.game;
    const table = kind === "attack" ? g.attackSpecific : g.productSpecific;
    const counter = kind === "attack" ? g.kills : g.gathered;
    const levels = this.rules.skill_events[kind === "attack" ? "kill_bugs_specific" : "gather_product"] ?? [];
    const lvl = table[key] ?? 0;
    if (lvl >= levels.length) return;
    counter[key] = (counter[key] ?? 0) + 1;
    if (counter[key] < levels[lvl].value) return;
    table[key] = lvl + 1;
    counter[key] = 0;
    // склонения для благозвучности: «Продуктивность Ромашки увеличена», «Эффективность против улитки повышена»
    const text = kind === "attack" ? efficiencyRaised(key, name) : productivityRaised(key, name);
    const next = levels[lvl + 1]?.value ?? 0;
    skillNotice(this.ui, text, 0, next, kind === "attack" ? rgb(214, 65, 135) : rgb(102, 190, 2));
    audio.play("level_up");
  }

  // ================================================================ грядки

  private addRidge(place: Place) {
    const r = new RidgeView(place, this.rules, this.game, {
      tap: (ridge) => this.tapRidge(ridge),
      hover: (ridge) => {
        // кнопки «Посадить растение» и «Продать» по одной: стоят на грядке под курсором, пока курсор не перейдёт на другую
        if (this.mode !== "shop") return;
        if (ridge.plant) {
          if (this.sellTarget === ridge) return;
          this.sellTarget = ridge;
        } else {
          if (this.plantTarget === ridge) return;
          this.plantTarget = ridge;
        }
        this.renderShop();
      },
      windowMissed: (kind) => this.windowMissed(kind),
      say: (s, x, y) => {
        toast(this.ui, s, x, y);
      },
      harvested: (_ridge, product, x, y, ripeFor) => {
        audio.play("product_harvest");
        const base = this.rules.products[product]?.exp ?? 0;
        const exp = this.bonusEvent("gather", ripeFor, x, y - 40, base);
        this.harvestedToday += 1;
        this.renderStorages();
        this.gainExp(exp, x, y - 10);
        const fam = family(product);
        this.specific("product", fam, this.rules.texts.names[fam] ?? fam);
        if (this.game.storageCount() >= this.game.storageMax) this.tutorial.show("first_no_room", x, y);
      },
      // первое засыхание: подсказка с исключением — растение остаётся, указатель — на самом растении
      spareDry: (ridge) => {
        const p = ridge.plant;
        if (!p) return false;
        const view = p.view;
        // пока подсказка ждёт очереди, исключение действует для всех растений: в оригинале флаг ставится при показе, не при очереди
        return this.tutorial.queued("first_vegetation_dead") || this.tutorial.show("first_vegetation_dead", ridge.x + view.x + view.width / 2, ridge.y + view.y + view.height / 2);
      },
      died: (ridge, reason) => {
        audio.play("vegetation_die");
        const at = { x: ridge.x + ridge.anchorPoint[0], y: ridge.y - 20 }; // координаты фермы (toGlobal дал бы экранные)
        toast(this.ui, reason === "thirst" ? "Растение засохло" : "Растение съедено", at.x, at.y);
      },
      grew: () => audio.play("vegetation_upgrade"),
      hungry: (ridge) => {
        audio.play("vegetation_hunger");
        const b = ridge.base();
        this.tutorial.show("water", b[0], b[1] - 30);
      },
      appeared: (_ridge, x, y) => {
        audio.play("product_appear");
        this.tutorial.show("flower", x, y);
      },
    });
    this.ridges.push(r);
    this.objects.addChild(r);
    this.sortObjects();
  }

  /** Ниже на экране — ближе к зрителю. */
  private sortObjects() {
    const key = (c: Container) => ("depth" in c ? (c.depth as number) : c.y + c.height);
    this.objects.children.sort((a, b) => key(a) - key(b));
  }

  // ================================================================ вредители и Робин

  /** Сетка проходимости вредителей: стены локации, колодец с ведром, купленные бочки и ящики, грядки (obstacle / dynamic_obstacle из XML). */
  private pathGrid(self?: Bug | Helper) {
    const grid = new PathGrid();
    for (const o of this.rules.obstacles) grid.add(o);
    const g = this.game;
    if (g.well) {
      grid.add(this.rules.well);
      grid.add(this.rules.well.pail);
    }
    this.rules.water_storage.slice(0, g.barrels).forEach((l) => grid.add({ position: l.obstacle, dimensions: l.dimensions }));
    this.rules.product_storage.slice(0, g.boxes).forEach((l) => grid.add({ position: l.obstacle, dimensions: l.dimensions }));
    for (const r of this.ridges) grid.add(r.place);
    // другие вредители занимают клетки вокруг следующей путевой точки (0x4b2290 → 0x446d40), свою клетку вредитель освобождает
    for (const b of this.bugs) if (b !== self && !b.dead) grid.addUnit(...b.footprint());
    // Робин занимает клетки так же (0x4545c0), сам себе не мешает
    if (this.helper && this.helper !== self && this.helper.visible) grid.addUnit(...this.helper.footprint());
    return grid;
  }

  private spawnBug(name: string) {
    if (!this.rules.bugs[name]) return;
    const [x, y] = this.rules.arrive_positions[Math.floor(Math.random() * this.rules.arrive_positions.length)];
    const folder = this.rules.bugs[name].folder;
    const bug = new Bug(name, this.rules, {
      ridges: () => this.ridges,
      grid: (self) => this.pathGrid(self),
      say: (s, sx, sy) => toast(this.ui, s, sx, sy),
      hurt: () => audio.play("bug_hit"),
      bit: () => audio.play("bug_attack"),
      killed: (b) => {
        audio.play("bug_die");
        const def = this.rules.bugs[b.kind];
        const key = def.folder;
        this.gainExp((def as unknown as { exp?: number }).exp ?? 0, b.x, b.y - 40);
        this.specific("attack", key, this.rules.texts.bug_names[key] ?? key);
      },
      drop: (item, bx, by) => this.dropItem(item, bx, by),
    }, x, y + (Math.random() - 0.5) * 40);
    // удар игрока: оружие simple_sword из items.xml + умение «борьба с вредителями» + особая атака по виду
    bug.on("pointertap", (e) => {
      e.stopPropagation();
      if (this.mode !== "day" || this.paused) return;
      const g = this.game;
      // урон = оружие · (1 + attack) · (1 + attack_specific_<вид>) — так в exe (0x415045)
      bug.hit(this.rules.weapon_attack * (1 + g.bonus("attack", "attack")) * (1 + g.attackSpecificBonus(folder)));
    });
    this.bugs.push(bug);
    this.objects.addChild(bug);
  }

  /** Предмет выпадает, только пока квест разрешил (enable_bug_item count). */
  private dropItem(item: string, x: number, y: number) {
    const g = this.game;
    const left = g.bugItems[item] ?? 0;
    if (left <= 0) return;
    g.bugItems[item] = left - 1;
    g.items[item] = (g.items[item] ?? 0) + 1;
    const icon = image(`item_${item}`);
    icon.anchor.set(0.5);
    icon.position.set(x, y - 30);
    this.ui.addChild(icon);
    let t = 0;
    const fly = () => {
      t += 1 / 60;
      icon.y -= 1;
      icon.alpha = 1 - t;
      if (t >= 1) return void icon.destroy();
      requestAnimationFrame(fly);
    };
    requestAnimationFrame(fly);
    toast(this.ui, `+1 (${g.items[item]})`, x, y - 60);
  }

  /** Робин появляется после квеста слуги (enable_helper). */
  private syncHelper() {
    if (!this.game.quests.helper && this.helper) {
      // disable_helper: Робин уходит с фермы
      this.helper.destroy({ children: true });
      this.helper = null;
    }
    if (!this.game.quests.helper || this.helper) return;
    this.helper = new Helper(this.rules, this.game, [255, 285]);
    this.helper.visible = this.mode === "day";
    this.objects.addChild(this.helper);
  }

  /** Условие квеста have_empty_ridge. */
  hasEmptyRidge() {
    return this.ridges.some((r) => !r.plant);
  }

  private tapRidge(r: RidgeView) {
    if (this.paused) return;
    if (this.mode === "shop") {
      // между днями нажатие на пустую грядку — то же, что кнопка «Посадить растение»
      if (r.plant) return;
      if (this.cantAffordSeed()) return this.notEnough();
      void this.chooseSeed(r);
      return;
    }
    if (this.mode !== "day") return;
    this.waterRidge(r);
  }

  private setBuyTarget(key: string) {
    if (this.mode !== "shop" || this.buyTarget === key) return;
    this.buyTarget = key;
    this.renderShop();
  }

  /** Денег не хватает ни на одно из доступных растений. */
  private cantAffordSeed() {
    const g = this.game;
    const seeds = g.hasMark("shop_vegetation") ? g.seeds : g.seeds.filter((s) => this.rules.start.vegetations.includes(s));
    return g.gold < Math.min(...seeds.map((s) => g.buyPrice(this.rules.vegetations[s].price_buy)));
  }

  private waterRidge(r: RidgeView, free = false) {
    if (!r.plant || !r.thirsty) return;
    if (!free && this.game.water <= 0) {
      const at = { x: r.x + r.anchorPoint[0], y: r.y - 30 };
      toast(this.ui, this.rules.texts.events.no_water ?? "Нет Воды", at.x, at.y);
      // подсказка обещает «сейчас мы заполним вашу бочку» — при первом показе бочки заполняются
      if (this.tutorial.show("first_no_water", at.x, at.y + 30)) {
        this.game.water = this.game.waterMax;
        this.game.changed();
        this.renderStorages();
      }
      return;
    }
    const exp = r.plant.def.exp_for_pour ?? 0;
    const info = r.thirstInfo();
    if (r.water()) {
      if (!free) this.game.water -= 1;
      // опыт и бонусы начисляет слушатель на событие полива, кто бы ни поливал — игрок или Робин (0x422e40)
      let gained = exp;
      const at = { x: r.x + r.anchorPoint[0], y: r.y - 30 };
      // «Экономный Полив» (exe проверяет раньше быстрого и на нём выходит): растению оставалось меньше 3 с — опыт ×2
      if (info.left < ECONOM_POUR_LEFT) {
        this.showBonus("econom_pour", at.x, at.y);
        gained = exp * ECONOM_POUR_MULT;
      } else gained = this.bonusEvent("pour", info.seconds, at.x, at.y, exp);
      audio.play("vegetation_pour");
      const b = r.base();
      splash(this.objects, b[0], b[1] - 20);
      this.gainExp(gained, b[0], b[1] - 60);
      this.game.changed();
      this.renderStorages();
    }
  }

  // ================================================================ колодец и бочки

  /**
   * Колодец (exe: WellItem 0x4510b0, WellControl 0x4afac0 / 0x4afc80 / 0x4afb30): поля delay = 20, fill_time = 1,
   * water_capacity = 5, pail_height = 17. В начале дня ведро полное. Пока пауза не кончилась, она убывает; потом
   * наполнение растёт на dt за кадр до fill_time. Нажатие отдаёт round(наполнение / fill_time · water_capacity) литров
   * (не больше свободного места в бочках; при нуле ничего не происходит), после чего наполнение 0 и пауза delay секунд.
   */
  private updateWell(dt: number) {
    const w = this.rules.well;
    if (this.wellCooldown <= 0) this.wellProgress = Math.min(w.fill_time, this.wellProgress + dt);
    else this.wellCooldown -= dt;
    this.pail.level = this.wellProgress / w.fill_time;
  }

  /** Курсор с бочкой над колодцем и ведром — только днём и пока в ведре есть вода. */
  private syncWellCursor() {
    const w = this.rules.well;
    const liters = Math.floor((this.wellProgress / w.fill_time) * w.water_capacity + 0.5);
    const cursor = this.mode === "day" && this.game.well && liters > 0 ? "pour" : "default";
    this.well.cursor = cursor;
    this.pail.cursor = cursor;
  }

  private tapWell() {
    if (!this.game.well) return toast(this.ui, "Колодец нужно купить");
    if (this.mode !== "day" || this.paused) return;
    const w = this.rules.well;
    const room = this.game.waterMax - this.game.water;
    const n = Math.min(Math.floor((this.wellProgress / w.fill_time) * w.water_capacity + 0.5), room);
    if (n <= 0) return room <= 0 ? toast(this.ui, "Бочки полны") : undefined;
    this.game.water += n;
    this.wellProgress = 0;
    this.wellCooldown = w.delay;
    this.pail.level = 0;
    audio.play("well_use");
    this.game.changed();
    this.renderStorages();
    toast(this.ui, `+${n} л`, this.pail.x + 30, this.pail.y - 10);
  }

  private renderStorages() {
    const place = (list: Filled[], levels: StorageLevel[], owned: number, base: string, content: string, mask: string, onTap?: () => void) => {
      while (list.length < owned) {
        const lv = levels[list.length];
        const f = new Filled(base, content, mask, lv.progress_height);
        f.position.set(lv.position[0], lv.position[1]);
        if (onTap) {
          f.eventMode = "static";
          f.cursor = "buy";
          f.on("pointertap", onTap);
        }
        list.push(f);
        this.objects.addChild(f);
      }
    };
    place(this.barrels, this.rules.water_storage, this.game.barrels, "barrel", "barrel_water", "barrel_mask");
    place(this.boxes, this.rules.product_storage, this.game.boxes, this.rules.box_image, this.rules.box_content_image, this.rules.box_mask_image);
    // запас делится между ёмкостями по порядку (в exe — равными долями)
    if (this.barrels.length) spread(this.barrels, this.game.waterMax ? this.game.water / this.game.waterMax : 0);
    if (this.boxes.length) spread(this.boxes, this.game.storageMax ? this.game.storageCount() / this.game.storageMax : 0);
    this.syncWell();
    this.sortObjects();
  }

  /**
   * Колодец виден, только когда куплен; между днями (после первого заработка) он показан полупрозрачным с предложением купить,
   * в течение дня непроданного колодца нет.
   */
  private syncWell() {
    const owned = this.game.well;
    this.well.visible = owned || (this.mode === "shop" && this.game.hasMark("shop_well"));
    this.well.alpha = owned ? 1 : 0.5;
    this.pail.visible = owned;
  }

  // ================================================================ магазин на объектах

  private clearShop() {
    this.shopLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private renderShop() {
    this.clearShop();
    for (const r of this.ridges) r.setDay(this.mode === "day");
    if (this.mode !== "shop" || this.bouquets) return;
    const t = this.rules.texts;
    const g = this.game;
    const names = t.names;
    const price = (n: number) => fmt(t.shop.price, { price: n });
    const add = (b: Container, x: number, y: number) => {
      b.position.set(x, y);
      this.shopLayer.addChild(b);
    };

    // грядки: «Посадить растение» только на одной (первой пустой) грядке; если денег не хватает ни на одно растение — красная (cant_buy)
    const broke = this.cantAffordSeed();
    const empty = this.ridges.filter((r) => !r.plant);
    const target = this.plantTarget && empty.includes(this.plantTarget) ? this.plantTarget : (empty[0] ?? null);
    this.plantTarget = target;
    const planted = this.ridges.filter((r) => r.plant);
    const seller = this.sellTarget && planted.includes(this.sellTarget) ? this.sellTarget : (planted[0] ?? null);
    this.sellTarget = seller;
    for (const r of this.ridges) {
      const [ax, ay] = [r.x + r.anchorPoint[0], r.y + r.anchorPoint[1]];
      if (!r.plant) {
        if (r !== target) continue;
        if (broke) {
          const b = shopButton("medium", fmt(t.buttons.buy_veg ?? "Посадить\nрастение"), null, () => this.notEnough());
          b.setEnabled(false);
          add(b, ax, ay - 30);
          continue;
        }
        add(shopButton("medium", fmt(t.buttons.buy_veg ?? "Посадить\nрастение"), null, () => void this.chooseSeed(r)), ax, ay - 30);
        continue;
      }
      if (r !== seller) continue;
      const p = r.plant;
      const sell = shopButton("small", price(g.sellPrice(p.def.price_sell)), t.buttons.sell_veg ?? "Продать", () => void this.sellPlant(r));
      sell.scale.set(0.9);
      add(sell, ax, ay + 24);
    }

    // покупки: полупрозрачные объекты видны все, а кнопка «Купить» одна — у объекта под курсором (по умолчанию у первого)
    const buyables: { key: string; button: () => ShopButton; at: [number, number] }[] = [];
    const ghostOf = (key: string, ghost: Sprite) => {
      ghost.eventMode = "static";
      ghost.on("pointerover", () => this.setBuyTarget(key));
      this.shopLayer.addChild(ghost);
    };

    // места под новые грядки (с 10-го дня, метка shop_ridges)
    if (g.hasMark("shop_ridges")) {
      this.rules.ridges_for_sale.forEach((place, i) => {
        if (g.boughtRidges.includes(i)) return;
        const ghost = image("ridge");
        ghost.anchor.set(0.5);
        ghost.alpha = 0.45;
        const cx = place.position[0] + place.dimensions[0] / 2;
        const cy = place.position[1] + place.dimensions[1] / 2;
        ghost.position.set(cx, cy);
        ghostOf(`ridge:${i}`, ghost);
        const cost = g.buyPrice(this.rules.prices.ridge);
        buyables.push({
          key: `ridge:${i}`,
          at: [cx, cy - 22],
          button: () => {
            const b = shopButton("small", price(cost), t.buttons.buy_ridge ?? "Купить", () => void this.buyRidge(i));
            b.setEnabled(g.gold >= cost);
            return b;
          },
        });
      });
    }

    // бочка (с 5-го дня), ящик (с 6-го), колодец (с 12-го)
    const nextBarrel = this.rules.water_storage[g.barrels];
    if (nextBarrel && g.hasMark("shop_barrel")) {
      const ghost = image("barrel");
      ghost.alpha = 0.4;
      ghost.position.set(...nextBarrel.position);
      ghostOf("barrel", ghost);
      const cost = g.buyPrice(nextBarrel.price);
      buyables.push({
        key: "barrel",
        // buy_barrel: смещение (10; 50) от объекта
        at: [nextBarrel.position[0] + 10 + 50, nextBarrel.position[1] + 50 + 30],
        button: () => {
          const b = shopButton("small", price(cost), t.buttons.buy_barrel ?? "Купить", () => this.buyStorage("barrels", nextBarrel.price));
          b.setEnabled(g.gold >= cost);
          return b;
        },
      });
    }
    const nextBox = this.rules.product_storage[g.boxes];
    if (nextBox && g.hasMark("shop_box")) {
      const ghost = image(this.rules.box_image);
      ghost.alpha = 0.4;
      ghost.position.set(...nextBox.position);
      ghostOf("box", ghost);
      const cost = g.buyPrice(nextBox.price);
      buyables.push({
        key: "box",
        at: [nextBox.position[0] + 20 + 50, nextBox.position[1] + 35 + 30],
        button: () => {
          const b = shopButton("small", price(cost), t.buttons.buy_box ?? "Купить", () => this.buyStorage("boxes", nextBox.price));
          b.setEnabled(g.gold >= cost);
          return b;
        },
      });
    }
    if (!g.well && g.hasMark("shop_well")) {
      const cost = g.buyPrice(this.rules.well.price);
      buyables.push({
        key: "well",
        at: [this.rules.shop_positions.well[0] + 50, this.rules.shop_positions.well[1] + 30],
        button: () => {
          const b = shopButton("small", price(cost), t.buttons.buy_well ?? "Купить", () => this.buyWell());
          b.setEnabled(g.gold >= cost);
          return b;
        },
      });
    }
    const active = buyables.find((b) => b.key === this.buyTarget) ?? buyables[0];
    this.buyTarget = active?.key ?? null;
    if (active) add(active.button(), ...active.at);

    // «Купить Воду» (433; 32) и «Продать Цветы» (547; 86) — средние кнопки
    // нечего покупать (бочки полны) и нечего продавать (нет плодов и собранных букетов) — кнопок нет
    if (g.water < g.waterMax) {
      const water = shopButton("medium", fmt(t.buttons.shop_button_buy_water ?? "Купить\nВоду"), null, () => this.openBuyWater());
      // в XML (433; 32), но «Начать День» сдвинута влево от часов и кнопка заходила бы под неё — «Купить Воду» сдвинута левее на 32 px
      add(water, this.rules.shop_positions.buy_water[0] + 50 - 32, this.rules.shop_positions.buy_water[1] + 30);
    }
    if (g.storageCount() > 0 || g.bouquets.orders.some((o) => o.placed.some(Boolean))) {
      const sell = shopButton("medium", fmt(t.buttons.shop_button_sell_prod ?? "Продать\nЦветы"), null, () => this.openBouquets());
      add(sell, this.rules.shop_positions.sell_prod[0] + 50, this.rules.shop_positions.sell_prod[1] + 30);
    }
    void names;
  }

  private notEnough() {
    toast(this.ui, this.rules.texts.desc.not_enough_money ?? "Недостаточно денег");
  }

  /** Растения, которые сейчас можно купить. */
  private shopSeeds() {
    const g = this.game;
    return g.hasMark("shop_vegetation") ? g.seeds : g.seeds.filter((s) => this.rules.start.vegetations.includes(s));
  }

  /** Выбор растения для пустой грядки: набор buy_vegetation_set локации (остальные — с 7-го дня, метка shop_vegetation). */
  private async chooseSeed(r: RidgeView) {
    const t = this.rules.texts;
    const g = this.game;
    const content = new Container();
    const step = 150;
    let close: (v: string) => void = () => {};
    const seeds = this.shopSeeds();
    seeds.forEach((seed, i) => {
      const def = this.rules.vegetations[seed];
      const card = new Container();
      const pic = image(seed);
      pic.anchor.set(0.5, 1);
      pic.scale.set(Math.min(1, 100 / pic.texture.height));
      pic.y = 100;
      const cost = g.buyPrice(def.price_buy);
      const ok = g.gold >= cost;
      const btn = shopButton("medium", fmt(t.shop.buy_veg_buy, { vegetation_name: t.names[seed] ?? seed, price: cost }), null, () => {
        if (!ok) return this.notEnough();
        close(seed);
      });
      btn.setEnabled(ok);
      btn.y = 140;
      card.addChild(pic, btn);
      card.x = (i - (seeds.length - 1) / 2) * step;
      content.addChild(card);
    });
    const chosen = await dialog(this.ui, {
      offsetX: 30,
      title: fmt(t.shop.buy_vegetation ?? "Купить растение"),
      content,
      buttons: [{ text: t.buttons.cancel ?? "Отмена", value: "cancel" }],
      width: 560,
      bind: (fn) => (close = fn),
    });
    if (!this.rules.vegetations[chosen]) return;
    this.game.gold -= g.buyPrice(this.rules.vegetations[chosen].price_buy);
    r.setPlant(chosen);
    audio.play("vegetation_buy");
    // exe 0x465c30: покупка растения ставит метку first_vegetation и ставит в очередь подсказку «Начать День»
    // (подсказка с затемнением, такие показываются один раз — флаг по имени в 0x4409c0)
    this.markTutorial("@first_vegetation");
    this.tutorial.show("start_day", 630, 70);
    this.afterPurchase();
  }

  private async sellPlant(r: RidgeView) {
    const t = this.rules.texts;
    const p = r.plant!;
    const name = t.names[p.name] ?? p.name;
    const cost = this.game.sellPrice(p.def.price_sell);
    const res = await dialog(this.ui, {
      offsetX: 30,
      body: fmt(t.desc.apply_sell_vegetation, { vegetation_name: name }) + `\n${fmt(t.shop.sell_item_price, { price: cost })}`,
      buttons: [{ text: t.buttons.yes ?? "Да", value: "ok" }, { text: t.buttons.no ?? "Нет", value: "no" }],
    });
    if (res !== "ok") return;
    this.game.gold += cost;
    r.clearPlant();
    audio.play("vegetation_sell");
    this.afterPurchase();
  }

  private async buyRidge(i: number) {
    const t = this.rules.texts;
    const price = this.game.buyPrice(this.rules.prices.ridge);
    if (this.game.gold < price) return this.notEnough();
    const res = await dialog(this.ui, {
      offsetX: 30,
      body: `${fmt(t.desc.apply_buy_ridge)}\n${fmt(t.shop.buy_item_price, { price })}`,
      buttons: [{ text: t.buttons.yes ?? "Да", value: "ok" }, { text: t.buttons.no ?? "Нет", value: "no" }],
    });
    if (res !== "ok") return;
    this.game.gold -= price;
    this.game.boughtRidges.push(i);
    this.addRidge(this.rules.ridges_for_sale[i]);
    audio.play("ridge_install");
    this.afterPurchase();
  }

  private buyStorage(kind: "barrels" | "boxes", base: number) {
    const price = this.game.buyPrice(base);
    if (this.game.gold < price) return this.notEnough();
    this.game.gold -= price;
    this.game[kind] += 1;
    audio.play(kind === "barrels" ? "bochka_buy" : "box_buy");
    this.renderStorages();
    this.afterPurchase();
  }

  private buyWell() {
    const price = this.game.buyPrice(this.rules.well.price);
    if (this.game.gold < price) return this.notEnough();
    this.game.gold -= price;
    this.game.well = true;
    audio.play("well_buy");
    this.renderStorages();
    this.afterPurchase();
  }

  /** Окно «Покупка воды» (controls/buy_water): литр или «Заполнить Все», цена за литр с умением «торговля». */
  private openBuyWater() {
    const t = this.rules.texts;
    const g = this.game;
    this.markTutorial("@buy_water"); // exe 0x4ae846: нажали «Купить воду» — пузырь buy_water больше не нужен
    const layer = new Container();
    const shade = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.4 });
    shade.eventMode = "static";
    layer.addChild(shade);
    const box = new Container();
    layer.addChild(box);
    this.ui.addChild(layer);
    const roll = image("dialog");
    roll.width = 470;
    roll.height = 330;
    roll.x = -235;
    box.addChild(roll);
    box.position.set(W / 2 + 30, 120);
    const ink = COLOR.black;
    const title = pop(t.buy_water.title ?? "Покупка воды", "TC4_16_en", ink, { align: "center", scale: 1.2 });
    title.position.set(0, 46);
    // ширина с запасом, чтобы описание не переносилось на вторую строку; строку «Деньги» не показываем — деньги видны на панели
    const desc = pop(t.buy_water.desc ?? "", "Verdana14", ink, { align: "center", wrap: 420 });
    desc.position.set(0, 80);
    const water = pop("", "BritannicBold14", rgb(60, 60, 160), { align: "center" });
    water.position.set(0, 110);
    const priceLabel = pop("", "BritannicBold14", ink, { align: "center" });
    priceLabel.position.set(0, 136);
    box.addChild(title, desc, water, priceLabel);
    const close = () => {
      layer.destroy({ children: true });
      this.afterPurchase();
    };
    const refresh = () => {
      water.text = fmt(t.buy_water.water, { current: g.water, total: g.waterMax });
      priceLabel.text = fmt(t.buttons.water_price, { price: g.buyPrice(this.rules.prices.water) });
    };
    const buy = (n: number) => {
      const price = g.buyPrice(this.rules.prices.water);
      const k = Math.min(n, g.waterMax - g.water, Math.floor(g.gold / price));
      if (k <= 0) return g.gold < price ? this.notEnough() : toast(layer, "Бочки полны", W / 2, 300);
      g.gold -= k * price;
      g.water += k;
      audio.play(n > 1 ? "buy_water_all" : "buy_water");
      g.changed();
      refresh();
      this.renderStorages();
      // кнопка «Купить Воду» на ферме исчезает сразу, как только бочки полны
      this.renderShop();
      // бочки полны — окно покупки закрывается само, как в оригинале
      if (g.water >= g.waterMax) close();
    };
    const b1 = textButton(t.buttons.buy_water ?? "Купить литр воды", () => buy(1));
    b1.position.set(0, 180);
    const b2 = textButton(t.buttons.buy_water_all ?? "Заполнить Все", () => buy(1e9));
    b2.position.set(0, 214);
    const b3 = textButton(t.buttons.buy_water_exit ?? "Закрыть", close);
    b3.position.set(0, 248);
    box.addChild(b1, b2, b3);
    shade.on("pointertap", close);
    refresh();
  }

  // ================================================================ цветочный магазин и окно умений

  private openBouquets() {
    if (this.bouquets) return;
    // exe 0x46fa10: открыли продажу — пузырь sell_prod снят, и с этого момента показывается подсказка о покупке воды
    this.markTutorial("@can_buy_water");
    this.markTutorial("@sell_prod");
    this.clearShop();
    this.top.visible = false;
    this.tutorial.hide();
    this.bouquets = new BouquetScreen(this.rules, this.game, () => {
      this.bouquets = null;
      this.top.visible = true;
      this.afterPurchase();
    });
    this.screens.addChild(this.bouquets);
    const tut = this.tutorial;
    const screen = this.bouquets;
    // обзор окна (bouquets_1…4), затем по состоянию: возьмите цветок → перетащите на место → цена → продажа по одному → «Назад»
    const first = this.rules.bouquets[0]?.[0] ?? "";
    const takeFlower = () => {
      const at = screen.flowerSpot(first);
      if (at && !this.game.tutorial.includes("bouquet_take_flower")) tut.show("bouquet_take_flower", at[0], at[1] - 10);
    };
    screen.hooks = {
      picked: (p) => {
        if (p !== first || this.game.tutorial.includes("bouquet_drag_to_target")) return;
        if (!this.game.tutorial.includes("bouquet_take_flower")) this.game.tutorial.push("bouquet_take_flower");
        const at = screen.targetSpot(p);
        if (at) tut.show("bouquet_drag_to_target", at[0], at[1] - 10);
      },
      dropped: () => tut.hide(),
      completed: () => {
        tut.show("full_bouquet", 0, 0, false, () =>
          tut.show("bouquet_show_sell_button", 200, 185, false, () => tut.show("bouquet_show_back", 469, 556)));
      },
    };
    tut.show("bouquets_1", 469, 80, false, () =>
      tut.show("bouquets_2", 469, 300, false, () => tut.show("bouquets_3", 200, 300, false, () => tut.show("bouquets_4", 200, 220, false, takeFlower))));
  }

  openLevelUp() {
    if (this.paused) return;
    this.paused = true; // пока открыто окно умений, игра днём стоит
    const screen = new LevelUp(this.rules, this.game, !!this.game.quests.helper, () => {
      this.paused = false;
      this.persist();
    });
    this.ui.addChild(screen);
  }

  /** remove_all_vegetations из квестов. */
  /** Действие квеста add_vegetation: растение name на первую свободную грядку. */
  addVegetation(name: string) {
    const ridge = this.ridges.find((r) => !r.plant);
    if (!ridge || !this.rules.vegetations[name]) return false;
    ridge.setPlant(name);
    this.afterPurchase();
    return true;
  }

  /** Действие квеста remove_vegetation: убрать все растения name. */
  removeVegetation(name: string) {
    for (const r of this.ridges) if (r.plant?.name === name) r.clearPlant();
    this.afterPurchase();
  }

  removeAllPlants() {
    for (const r of this.ridges) r.clearPlant();
    this.afterPurchase();
  }

  /** Ферма снова на экране (после города): обновить магазин и цифры. */
  refresh() {
    this.syncHelper();
    this.renderShop();
    this.renderStats();
    this.persist();
    this.shopHints();
  }

  /** Флаг «действие сделано» для пузырей обучения (в exe — множество GameHolder, 0x442160). */
  private markTutorial(flag: string) {
    if (!this.game.tutorial.includes(flag)) this.game.tutorial.push(flag);
  }

  private afterPurchase() {
    this.game.changed();
    this.renderShop();
    this.persist();
  }

  // ================================================================ прочее

  /** Экран сменили — подсказки фермы убираются. */
  dismissTutorial() {
    this.tutorial.dismiss();
  }

  /** Меню игры (кнопка «Меню» панели — на ферме и в городе). */
  openMenu() {
    this.events.toMenu();
  }

  private renderStats() {
    this.hud.update();
    this.renderStorages();
  }

  persist() {
    const plants: (PlantSave | null)[] = this.ridges.map((r) => r.savePlant());
    this.game.save(plants);
  }

  /** Для отладки из консоли. */
  debug() {
    return { mode: this.mode, ridges: this.ridges, game: this.game };
  }
}
