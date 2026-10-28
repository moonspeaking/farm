// Вредители на ферме и помощник Робин. Параметры — из properties_ru.xml (bugs, bug_arriver, common/helper).
import { AnimatedSprite, Container, Rectangle, Sprite, Texture, type Ticker } from "pixi.js";
import { audio } from "./audio";
import { IconRow } from "./effects";
import { CELL_H, CELL_W, type Cell, cellNear, type PathGrid, pathToPlant, startCellOf, wanderPath } from "./pathgrid";
import type { RidgeView } from "./ridge";
import type { BugDef, Rules } from "./rules";
import type { Game } from "./state";
import { image, tex } from "./ui";

const DIRS = ["right", "right_down", "down", "right_up", "up"] as const;
const framesCache = new Map<string, Texture[]>();

/** Кадры из вертикальной полосы оригинала: anim_rows кадров друг под другом. */
function frames(folder: string, anim: string, dir: string, rows: number): Texture[] {
  const key = `bug_${folder}_${anim}_${dir}`;
  let list = framesCache.get(key);
  if (!list) {
    const t = tex(key);
    const h = Math.floor(t.height / rows);
    list = Array.from({ length: rows }, (_, i) => new Texture({ source: t.source, frame: new Rectangle(0, i * h, t.width, h) }));
    framesCache.set(key, list);
  }
  return list;
}

/** Направление полосы по вектору движения; левые — зеркальные правым. */
function direction(dx: number, dy: number): { dir: (typeof DIRS)[number]; flip: boolean } {
  const flip = dx < 0;
  const a = Math.atan2(dy, Math.abs(dx)); // от -π/2 (вверх) до π/2 (вниз)
  const deg = (a * 180) / Math.PI;
  const dir = deg < -67.5 ? "up" : deg < -22.5 ? "right_up" : deg < 22.5 ? "right" : deg < 67.5 ? "right_down" : "down";
  return { dir, flip };
}

/** Анимированный персонаж с полосами кадров по направлениям. */
class Actor extends Container {
  protected readonly view: AnimatedSprite;
  protected anim = "";
  protected dir: string = "down";

  /** Глубина для сортировки на ферме — по ногам персонажа. */
  get depth() {
    return this.y;
  }

  constructor(protected def: BugDef) {
    super();
    this.view = new AnimatedSprite({ textures: [Texture.EMPTY], autoUpdate: false });
    this.view.anchor.set(0.5, 0.9);
    this.addChild(this.view);
  }

  /** Кадры идут по игровому времени, а не по таймеру Pixi: на паузе персонаж замирает. */
  protected advance(dt: number) {
    this.view.update({ deltaTime: dt * 60 } as unknown as Ticker);
  }

  protected play(anim: string, dx = 0, dy = 0, force = false) {
    const a = this.def.anims[anim] ?? this.def.anims.stand;
    if (dx || dy) {
      const d = direction(dx, dy);
      this.view.scale.x = d.flip ? -1 : 1;
      if (d.dir !== this.dir) force = true;
      this.dir = d.dir;
    }
    if (anim === this.anim && !force) return;
    this.anim = anim;
    this.view.textures = frames(this.def.folder, this.def.anims[anim] ? anim : "stand", this.dir, a.rows);
    // play_time — длительность всей полосы
    this.view.animationSpeed = a.rows / a.time / 60;
    this.view.loop = a.loop;
    this.view.gotoAndPlay(0);
  }
}

export interface BugEvents {
  ridges(): RidgeView[];
  /** Сетка проходимости фермы (стены, колодец, бочки, ящики, грядки). */
  grid(self?: Bug): PathGrid;
  say(text: string, x: number, y: number): void;
  /** Вредитель убит (byHelper — Робином): опыт, счётчики особых умений, звук. */
  killed(bug: Bug, byHelper: boolean): void;
  /** Вредитель получил удар. */
  hurt(bug: Bug): void;
  /** Вредитель укусил растение. */
  bit(bug: Bug): void;
  /** Из вредителя может выпасть предмет (если квест включил enable_bug_item). */
  drop(item: string, x: number, y: number): void;
}

export class Bug extends Actor {
  life: number;
  maxLife: number;
  dead = false;
  private readonly hearts: IconRow;
  private target: RidgeView | null = null;
  private eatTimer = 0;
  private busy = 0;
  /** Путь по клеткам сетки (exe: список путевых точек +0x14) и цель пути; атакует, когда путь пройден. */
  private path: Cell[] = [];
  private goal: [number, number] = [0, 0];
  private attacking = false;
  private retry = 0;
  /** Во что превратится после анимации reincorn (улитка без панциря). */
  private reincornTo = "";

  constructor(
    public kind: string,
    private readonly rules: Rules,
    private readonly events: BugEvents,
    x: number,
    y: number,
  ) {
    super(rules.bugs[kind]);
    this.life = this.def.life ?? 1;
    this.maxLife = this.life;
    // progresses: сердечки над вредителем (attack_bug, у сильных — attack_bug_strong), смещение (0; −50)
    const strong = this.maxLife >= rules.strong_heart;
    const pr = rules.progresses[strong ? "attack_bug_strong" : "attack_bug"];
    this.hearts = new IconRow(pr.image, pr.max, 0, 1);
    this.hearts.position.set(pr.offset[0], pr.offset[1]);
    this.addChild(this.hearts);
    this.position.set(x, y);
    this.eventMode = "static";
    this.cursor = "attack";
    const r = this.def.click_radius ?? 25;
    this.hitArea = { contains: (px: number, py: number) => px * px + (py + r) * (py + r) < r * r * 1.6 };
    this.play("move", x < 400 ? 1 : -1, 0, true);
  }

  /** Удар: игрок (оружие simple_sword и умения) или Робин. */
  hit(n: number, byHelper = false) {
    if (this.dead || this.reincornTo) return;
    this.life -= n;
    this.hearts.set(this.life > 0 ? (this.life / this.maxLife) * this.hearts.max : 0);
    this.events.hurt(this);
    if (this.life > 0) {
      this.play("hit", 0, 0, true);
      this.busy = this.def.anims.hit?.time ?? 0.3;
      return;
    }
    if (this.def.reincorn) {
      // хитрая улитка теряет панцирь и бежит дальше уже без него
      this.reincornTo = this.def.reincorn;
      this.play("reincorn", 0, 0, true);
      this.busy = this.def.anims.reincorn?.time ?? 1;
      this.dropItem();
      this.hearts.set(0);
      audio.play("bug_changing");
      return;
    }
    this.dropItem();
    this.dead = true;
    this.hearts.set(0);
    this.events.killed(this, byHelper);
  }

  private dropItem() {
    if (this.def.items) this.events.drop(this.def.items, this.x, this.y);
  }

  update(dt: number) {
    this.advance(dt);
    if (this.dead) {
      this.alpha -= dt * 2;
      if (this.alpha <= 0) this.destroy({ children: true });
      return;
    }
    if (this.busy > 0) {
      this.busy -= dt;
      if (this.busy > 0) return;
      if (this.reincornTo) {
        this.kind = this.reincornTo;
        this.def = this.rules.bugs[this.reincornTo];
        this.life = this.def.life ?? 1;
        this.maxLife = this.life;
        this.reincornTo = "";
      }
      this.anim = "";
      return;
    }
    if (this.target && !this.target.plant) {
      this.target = null;
      this.attacking = false;
    }
    if (this.attacking && this.target) {
      // ест: в exe (0x4b2a16) каждый кадр растение теряет attack·dt жизни — урон идёт непрерывно, без заживления
      const [tx] = this.target.base();
      this.play("eat", tx - this.x || 1, 0);
      this.eatTimer += dt;
      const period = this.def.anims.eat?.time ?? 1;
      if (this.eatTimer >= period) {
        this.eatTimer -= period;
        this.events.bit(this); // звук bug_attack раз в проход анимации
      }
      if (this.target.bite((this.def.attack ?? 1) * dt)) {
        this.target = null;
        this.attacking = false;
      }
      return;
    }
    // выбор цели (0x4b2620): случайное растение, путь до клетки рядом с ним; без цели — блуждание (0x4b23d0)
    if (!this.target && this.retry <= 0) this.chooseTarget();
    this.retry -= dt;
    this.follow(this.def.speed ?? 40, dt);
  }

  /** Занятые вредителем клетки: вокруг следующей путевой точки, а без пути — вокруг текущей клетки (0x4b2290). */
  footprint(): [number, number, number] {
    const cell: Cell = this.path.length ? this.path[0] : [Math.floor(this.x / CELL_W), Math.floor(this.y / CELL_H)];
    return [cell[0], cell[1], this.def.obst_radius ?? 25];
  }

  private startCell(grid: PathGrid): Cell {
    return startCellOf(grid, this.x, this.y);
  }

  private chooseTarget() {
    const grid = this.events.grid(this);
    const from = this.startCell(grid);
    const all = this.events.ridges().filter((r) => r.plant);
    if (all.length) {
      const target = all[Math.floor(Math.random() * all.length)];
      const [w, h] = target.place.dimensions;
      const found = pathToPlant(grid, from, [target.place.position[0] + w / 2, target.place.position[1] + h / 2], [w, h]);
      if (found) {
        this.target = target;
        this.path = found.path;
        this.goal = [found.goal[0] * CELL_W, found.goal[1] * CELL_H];
        return;
      }
      this.retry = 0.5;
    } else if (!this.path.length) {
      const wandering = wanderPath(grid, from);
      if (wandering) this.path = wandering;
      else this.retry = 0.5;
    }
  }

  /** Движение по путевым точкам (0x4b2a10): точка засчитывается, когда до неё остаётся меньше шага. */
  private follow(speed: number, dt: number) {
    if (!this.path.length) return;
    const step = speed * dt;
    const grid = this.events.grid(this);
    const wp = () => [this.path[0][0] * CELL_W, this.path[0][1] * CELL_H] as const;
    if (!grid.walkable(this.path[0][0], this.path[0][1])) {
      // путь перекрыт (купили грядку, встал объект) — цель сбрасывается, путь строится заново
      this.path = [];
      this.target = null;
      return;
    }
    let [wx, wy] = wp();
    let d = Math.hypot(wx - this.x, wy - this.y);
    while (d < step) {
      this.x = wx;
      this.y = wy;
      this.path.shift();
      if (!this.path.length) {
        if (this.target) {
          [this.x, this.y] = this.goal;
          this.attacking = true;
        }
        return;
      }
      [wx, wy] = wp();
      d = Math.hypot(wx - this.x, wy - this.y);
    }
    this.x += ((wx - this.x) / d) * step;
    this.y += ((wy - this.y) / d) * step;
    this.play("move", wx - this.x, wy - this.y);
  }
}

/**
 * Помощник Робин (common/helper). Выбор цели — по exe (HelperTarget*): вероятность каждого дела (полив, сбор, атака) =
 * start_skill_prob + per_level_skill_prob × уровень соответствующего умения; из разрешённых целей берётся ближайшая.
 * Бьёт вредителя на attack_range раз в attack_period; на цель летит со скоростью speed.
 */
export class Helper extends Actor {
  private cooldown = 0;
  private task: { kind: "pour" | "product"; ridge: RidgeView } | { kind: "attack"; bug: Bug } | { kind: "walk"; left: number } | null = null;
  /** Путь по сетке к цели текущей задачи; клетка цели при построении (для атаки — чтобы перестроить, когда вредитель сдвинулся); паузы. */
  private path: Cell[] = [];
  private planned: Cell = [0, 0];
  private retry = 0;
  private replan = 0;
  private readonly icon: Sprite;

  /** Робин летает над растениями и вредителями — рисуется поверх всего на ферме. */
  get depth() {
    return 1e6;
  }

  constructor(private readonly rules: Rules, private readonly game: Game, private readonly home: [number, number]) {
    super(rules.bugs.helper);
    this.position.set(...home);
    this.icon = image("helper_attack_icon");
    // мысль рисуется в натуральную величину (62 × 78) в точке icon_offset от Робина
    this.icon.position.set(...this.rules.helper.icon_offset);
    this.icon.visible = false;
    this.addChild(this.icon);
    this.play("stand", 0, 1, true);
  }

  update(dt: number, bugs: Bug[], ridges: RidgeView[], onWater: (r: RidgeView) => void, grid: () => PathGrid) {
    const h = this.rules.helper;
    this.advance(dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.retry -= dt;
    this.replan -= dt;
    // exe (0x45a260): задача идёт, пока не «закончена»; когда её нет или она закончилась — выбор цели заново (0x459420)
    const task = this.task;
    if (!task) {
      this.showIcon(null);
      if (this.retry > 0) return this.play("stand", 0, 1);
      return this.begin(this.pickTask(bugs, ridges) ?? this.newWalk(grid()), grid);
    }
    if (task.kind === "walk") {
      // прогулка (0x45a5d0 / 0x45a5e0): таймер 1 с, закончена по таймеру или когда путь пройден
      task.left -= dt;
      this.showIcon(null);
      this.follow(dt, grid);
      const arrived = !this.path.length;
      if (task.left > 0 && !arrived) return;
      // нашлось дело — берём; нет — идём к той же точке ещё секунду (таймер снова 1,0) или выбираем новую
      const next = this.pickTask(bugs, ridges);
      if (next) return this.begin(next, grid);
      if (arrived) return this.begin(this.newWalk(grid()), grid);
      task.left = 1;
      return;
    }
    if (task.kind === "attack") {
      const bug = task.bug;
      if (bug.dead || bug.destroyed) {
        this.task = null;
        return;
      }
      this.showIcon("attack");
      const d = Math.hypot(bug.x - this.x, bug.y - 30 - this.y);
      if (d <= h.attack_range * 0.8) {
        // цель в пределах attack_range — стоит и бьёт
        this.path = [];
        this.play("stand", bug.x - this.x, 0);
        if (this.cooldown <= 0) {
          // умение Робина: к атаке прибавляется helper_attack, период делится на (1 + helper_attack_speed)
          bug.hit(h.attack + this.game.bonus("helper_attack", "helper_attack"), true);
          this.cooldown = h.attack_period / (1 + this.game.bonus("helper_attack", "helper_attack_speed"));
        }
        return;
      }
      // вредитель ушёл в другую клетку (или путь кончился) — путь строится заново
      const cell = grid().cellOf(bug.x, bug.y);
      if (this.replan <= 0 && (!this.path.length || this.planned[0] !== cell[0] || this.planned[1] !== cell[1])) {
        this.replan = 0.3;
        if (!this.plan(grid(), [bug.x, bug.y])) {
          this.task = null;
          this.retry = 0.5;
          return;
        }
      }
      this.follow(dt, grid);
      return;
    }
    const r = task.ridge;
    const valid = task.kind === "pour" ? r.thirsty : r.readyProduct() >= 0;
    if (!valid) {
      this.task = null;
      return;
    }
    this.showIcon(task.kind);
    this.follow(dt, grid);
    if (this.path.length) return;
    // пришёл (путь пройден) — действие при пустом списке путевых точек (0x45a2d0, 0x4570a0): полив только этого растения;
    // сбор — всех спелых плодов на этом растении, пока в ящиках есть место (шанса «полить / собрать всё» в exe нет)
    if (task.kind === "pour") onWater(r);
    else while (r.readyProduct() >= 0 && this.game.storageCount() < this.game.storageMax) r.collect(r.readyProduct(), false);
    this.task = null;
  }

  /** Каждый день Робин начинает с одного и того же места — у дома — и сразу летит по делам или гулять. */
  startDay() {
    this.rest();
    this.cooldown = 0;
  }

  /** Начинает задачу: строит путь по сетке (как у вредителей); если пути нет, задача отбрасывается и выбор повторится через полсекунды. */
  private begin(task: Helper["task"], grid: () => PathGrid) {
    this.task = task;
    if (!task) {
      this.path = [];
      this.retry = 0.5;
      return;
    }
    if (task.kind === "walk") return; // путь уже построен в newWalk
    this.path = [];
    const target: [number, number] = task.kind === "attack" ? [task.bug.x, task.bug.y] : task.ridge.base();
    if (!this.plan(grid(), target)) {
      this.task = null;
      this.retry = 0.5;
    }
  }

  /** Путь к клетке рядом с целью (0x41a350 ищет свободную клетку в радиусе 3, 0x43b000 строит путь волной). */
  private plan(grid: PathGrid, target: [number, number]) {
    const goal = cellNear(grid, grid.cellOf(target[0], target[1]), 3);
    if (!goal) return false;
    const path = grid.path(startCellOf(grid, this.x, this.y), goal);
    if (!path) return false;
    this.path = path;
    this.planned = grid.cellOf(target[0], target[1]);
    return true;
  }

  /** Скорость полёта: speed из XML, у полива и сбора — с умением «скорость» (slot 4 задач, 0x45a4f0). */
  private speed() {
    const t = this.task;
    const skill = t?.kind === "pour" ? this.game.bonus("helper_pour", "helper_pour_speed")
      : t?.kind === "product" ? this.game.bonus("helper_product", "helper_product_speed") : 0;
    return this.rules.helper.speed * (1 + skill);
  }

  /** Движение по путевым точкам (как у вредителей, 0x4b2a10): точка засчитывается, когда до неё остаётся меньше шага. */
  private follow(dt: number, grid: () => PathGrid) {
    if (!this.path.length) return;
    const step = this.speed() * dt;
    if (!grid().walkable(this.path[0][0], this.path[0][1])) {
      // путь перекрыт (купили грядку, встал вредитель) — строится заново к той же цели
      this.path = [];
      const t = this.task;
      if (t && t.kind !== "walk" && !this.plan(grid(), t.kind === "attack" ? [t.bug.x, t.bug.y] : t.ridge.base())) {
        this.task = null;
        this.retry = 0.5;
      }
      return;
    }
    const wp = () => [this.path[0][0] * CELL_W, this.path[0][1] * CELL_H] as const;
    let [wx, wy] = wp();
    let d = Math.hypot(wx - this.x, wy - this.y);
    while (d < step) {
      this.x = wx;
      this.y = wy;
      this.path.shift();
      if (!this.path.length) return;
      [wx, wy] = wp();
      d = Math.hypot(wx - this.x, wy - this.y);
    }
    this.x += ((wx - this.x) / d) * step;
    this.y += ((wy - this.y) / d) * step;
    this.play("move", wx - this.x, wy - this.y);
  }

  /** HelperTargetWalk (0x45a600): случайная ячейка поля, до 20 попыток найти проходимую; путь к ней по сетке, идёт не дольше секунды за раз. */
  private newWalk(grid: PathGrid): { kind: "walk"; left: number } | null {
    for (let i = 0; i < 20; i++) {
      const cx = Math.floor(Math.random() * grid.cols);
      const cy = Math.floor(Math.random() * grid.rows);
      if (!grid.walkable(cx, cy)) continue;
      const path = grid.path(startCellOf(grid, this.x, this.y), [cx, cy]);
      if (path) {
        this.path = path;
        return { kind: "walk", left: 1 };
      }
    }
    return null;
  }

  /** Между днями Робин отдыхает у дома (на экране его нет). */
  rest() {
    this.task = null;
    this.path = [];
    this.retry = 0;
    this.position.set(...this.home);
    this.showIcon(null);
    this.play("stand", 0, 1, true);
  }

  /** Вероятность дела (exe, 0x459420): start_skill_prob + per_level_skill_prob × уровень умения Робина; не ограничивается единицей. */
  private chance(skill: "helper_pour" | "helper_product" | "helper_attack") {
    const h = this.rules.helper;
    return h.start_skill_prob + h.per_level_skill_prob * this.game.skills[skill];
  }

  /**
   * Выбор цели по exe (0x459420): для каждого вида дела собирается ближайший кандидат (ключи map: 0 — сбор, 1 — полив, 2 — атака);
   * затем виды с кандидатами идут в этом порядке, и первый, у кого `rand < вероятность`, побеждает — берётся его ближайшая цель.
   * Не сработал ни один — задача «ждать» (в exe поле 1,0 в 0x45a5c0).
   */
  private pickTask(bugs: Bug[], ridges: RidgeView[]): NonNullable<Helper["task"]> | null {
    type Task = NonNullable<Helper["task"]>;
    const dist = (x: number, y: number) => Math.hypot(x - this.x, y - this.y);
    const nearest = (list: { d: number; task: Task }[]) => list.reduce<{ d: number; task: Task } | null>((a, c) => (!a || c.d < a.d ? c : a), null);
    const product: { d: number; task: Task }[] = [];
    if (this.game.storageCount() < this.game.storageMax) {
      for (const r of ridges) if (r.readyProduct() >= 0) product.push({ d: dist(...r.base()), task: { kind: "product", ridge: r } });
    }
    const pour: { d: number; task: Task }[] = [];
    {
      for (const r of ridges) if (r.thirsty) pour.push({ d: dist(...r.base()), task: { kind: "pour", ridge: r } });
    }
    const attack = bugs.filter((b) => !b.dead && !b.destroyed).map((b) => ({ d: dist(b.x, b.y), task: { kind: "attack", bug: b } as Task }));
    const kinds: [{ d: number; task: Task } | null, number][] = [
      [nearest(product), this.chance("helper_product")],
      [nearest(pour), this.chance("helper_pour")],
      [nearest(attack), this.chance("helper_attack")],
    ];
    for (const [cand, p] of kinds) if (cand && Math.random() < p) return cand.task;
    return null;
  }

  private showIcon(kind: "attack" | "pour" | "product" | null) {
    this.icon.visible = !!kind;
    if (kind) this.icon.texture = tex(`helper_${kind}_icon`);
  }
}

/** Появление вредителей по волнам bug_arriver: волна на день, группы идут друг за другом. */
export class BugArriver {
  private queue: { at: number; bugs: string[] }[] = [];
  private time = 0;

  /** arrive — множитель whether/bug_arrive: при дожде (0,8) вредители приходят реже, паузы длиннее. */
  startDay(rules: Rules, day: number, arrive = 1) {
    const wave = rules.waves[Math.min(day - 1, rules.waves.length - 1)] ?? [];
    this.time = 0;
    this.queue = [];
    let at = 0;
    for (const g of wave) {
      if (g.bugs.length) this.queue.push({ at, bugs: g.bugs });
      at += g.delay / Math.max(0.1, arrive);
    }
  }

  /** Имена вредителей, которым пора появиться. */
  tick(dt: number): string[] {
    this.time += dt;
    const out: string[] = [];
    while (this.queue.length && this.queue[0].at <= this.time) out.push(...this.queue.shift()!.bugs);
    return out;
  }
}
