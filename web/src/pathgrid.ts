// Сетка проходимости вредителей — по exe: конструктор сетки 0x446c50 (800×600, ячейка 25×15), занятие прямоугольника 0x444fa0,
// проходимость 0x445230, волна Ли 0x43b000 (соседи в порядке из 0x43ace0, возврат по тому же порядку).

export const CELL_W = 25;
export const CELL_H = 15;
const COLS = Math.floor(800 / CELL_W) + 1;
const ROWS = Math.floor(600 / CELL_H) + 1;

export type Cell = [number, number];
export interface Rect {
  position: [number, number];
  dimensions: [number, number];
}

/** Порядок обхода соседей: W, NW, N, NE, E, SE, S, SW (0x43ace0); цена шага одинакова и по диагонали. */
const NEIGHBOURS: Cell[] = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];

export class PathGrid {
  readonly cols = COLS;
  readonly rows = ROWS;
  private readonly busy = new Int32Array(COLS * ROWS);

  /** Прямоугольник занимает ячейки от floor(x / 25) до floor((x + w) / 25) включительно (0x444fa0). */
  add(r: Rect) {
    const x0 = Math.max(0, Math.floor(r.position[0] / CELL_W));
    const y0 = Math.max(0, Math.floor(r.position[1] / CELL_H));
    const x1 = Math.min(COLS - 1, Math.floor((r.position[0] + r.dimensions[0]) / CELL_W));
    const y1 = Math.min(ROWS - 1, Math.floor((r.position[1] + r.dimensions[1]) / CELL_H));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) this.busy[x * ROWS + y] += 1;
  }

  /** Занятие вредителем: квадрат ячеек [c − r, c + r], r = obst_radius / max(25, 15) (0x446d40). */
  addUnit(cx: number, cy: number, radius: number) {
    const r = Math.floor(radius / Math.max(CELL_W, CELL_H));
    for (let x = Math.max(0, cx - r); x <= Math.min(COLS - 1, cx + r); x++)
      for (let y = Math.max(0, cy - r); y <= Math.min(ROWS - 1, cy + r); y++) this.busy[x * ROWS + y] += 1;
  }

  walkable(x: number, y: number) {
    return x >= 0 && y >= 0 && x < COLS && y < ROWS && this.busy[x * ROWS + y] === 0;
  }

  cellOf(x: number, y: number): Cell {
    return [Math.floor(x / CELL_W), Math.floor(y / CELL_H)];
  }

  /**
   * Путь из ячейки from в to: волна заливает всю достижимую область, затем путь собирается от цели к старту
   * по ячейкам со значением на единицу меньше. Результат — ячейки от старта до цели включительно; null — пути нет.
   */
  path(from: Cell, to: Cell): Cell[] | null {
    if (!this.walkable(from[0], from[1]) || !this.walkable(to[0], to[1])) return null;
    const wave = new Int32Array(COLS * ROWS);
    wave[from[0] * ROWS + from[1]] = 1;
    let front: Cell[] = [from];
    while (front.length) {
      const next: Cell[] = [];
      for (const [cx, cy] of front) {
        const v = wave[cx * ROWS + cy] + 1;
        for (const [dx, dy] of NEIGHBOURS) {
          const x = cx + dx;
          const y = cy + dy;
          if (this.walkable(x, y) && wave[x * ROWS + y] === 0) {
            wave[x * ROWS + y] = v;
            next.push([x, y]);
          }
        }
      }
      front = next;
    }
    let [x, y] = to;
    const out: Cell[] = [[x, y]];
    while (x !== from[0] || y !== from[1]) {
      const v = wave[x * ROWS + y];
      let moved = false;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && v > 1 && wave[nx * ROWS + ny] === v - 1) {
          x = nx;
          y = ny;
          out.unshift([x, y]);
          moved = true;
          break;
        }
      }
      if (!moved) return null;
    }
    return out;
  }
}

/**
 * Выбор клетки у растения и пути к ней (0x4b2620): от клетки точки растения идут вниз, затем вверх, вправо и влево,
 * пока клетка не выйдет за габариты растения; берётся первая проходимая клетка, до которой есть путь.
 */
export function pathToPlant(grid: PathGrid, from: Cell, p: [number, number], size: [number, number]): { goal: Cell; path: Cell[] } | null {
  const [px, py] = grid.cellOf(p[0], p[1]);
  const scans: { step: Cell; within: (cx: number, cy: number) => boolean }[] = [
    { step: [0, 1], within: (_x, cy) => cy * CELL_H - 1 <= p[1] + size[1] / 2 },
    { step: [0, -1], within: (_x, cy) => p[1] - size[1] / 2 <= cy * CELL_H + 1 },
    { step: [1, 0], within: (cx) => cx * CELL_W - 1 <= p[0] + size[0] / 2 },
    { step: [-1, 0], within: (cx) => p[0] - size[0] / 2 <= cx * CELL_W + 1 },
  ];
  for (const s of scans) {
    let x = px;
    let y = py;
    do {
      x += s.step[0];
      y += s.step[1];
      if (grid.walkable(x, y)) {
        const path = grid.path(from, [x, y]);
        if (path) return { goal: [x, y], path };
      }
    } while (s.within(x, y));
  }
  return null;
}

/** Случайная проходимая клетка для блуждания без цели (0x4b23d0): x от 8, до 20 попыток. */
export function wanderPath(grid: PathGrid, from: Cell): Cell[] | null {
  for (let i = 0; i < 20; i++) {
    const x = 8 + Math.floor(Math.random() * (COLS - 8));
    const y = Math.floor(Math.random() * ROWS);
    if (!grid.walkable(x, y)) continue;
    const path = grid.path(from, [x, y]);
    if (path) return path;
  }
  return null;
}

/** Ближайшая проходимая клетка к цели: кольца радиуса 0…maxR, в кольце — 8 клеток в порядке из exe (0x41a350: вниз, влево, вправо, вверх, затем углы). */
export function cellNear(grid: PathGrid, [cx, cy]: Cell, maxR = 3): Cell | null {
  for (let r = 0; r <= maxR; r++) {
    const ring: Cell[] = [[cx, cy + r], [cx - r, cy], [cx + r, cy], [cx, cy - r], [cx - r, cy + r], [cx + r, cy + r], [cx - r, cy - r], [cx + r, cy - r]];
    for (const c of ring) if (grid.walkable(c[0], c[1])) return c;
  }
  return null;
}

/** Клетка, с которой начинается путь: клетка под точкой (x, y), а если она занята (грядкой) — ближайшая свободная. */
export function startCellOf(grid: PathGrid, x: number, y: number): Cell {
  const [cx, cy] = grid.cellOf(x, y);
  if (grid.walkable(cx, cy)) return [cx, cy];
  for (let r = 1; r < 12; r++)
    for (let dx = -r; dx <= r; dx++)
      for (let dy = -r; dy <= r; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && grid.walkable(cx + dx, cy + dy)) return [cx + dx, cy + dy];
  return [cx, cy];
}
