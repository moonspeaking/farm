// Частицы оригинала (data/particles/*.psi → public/data/particles.json, формат — в tools/export_particles.py).
// Игра обновляет частицы покадрово (позиция += скорость без dt), поэтому симуляция идёт шагом 1/60 с.
import { Container, Sprite } from "pixi.js";
import { tex } from "./ui";

export interface PsiConfig {
  rate: number;
  duration: number;
  life: [number, number];
  angle: number;
  spread: number;
  speed: [number, number];
  gravity: [number, number];
  radial: [number, number];
  tangential: [number, number];
  scale: { start: number; end: number; var: number };
  spin: { start: number; end: number; var: number };
  color_start: number[];
  color_end: number[];
  color_var: [number, number];
}

const STEP = 1 / 60;
const MAX_PARTICLES = 500;
const TEXTURE: Record<string, string> = {
  "level-available": "particle_sparkle",
  "level-available-quests": "particle_sparkle",
};

let configs: Record<string, PsiConfig> = {};

export async function loadParticles() {
  configs = (await (await fetch("data/particles.json")).json()) as Record<string, PsiConfig>;
}

const rand = (a: number, b: number) => a + (b - a) * Math.random();

interface Particle {
  s: Sprite;
  /** Точка эмиттера: от неё считаются радиальное и тангенциальное ускорения. */
  ex: number;
  ey: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  radial: number;
  tangential: number;
  age: number;
  life: number;
  spin: number;
  dSpin: number;
  scale: number;
  dScale: number;
  color: number[];
  dColor: number[];
}

/** Эмиттер: точка, откуда сыплются частицы; одноразовый (duration ≥ 0) или бесконечный (−1) до stop(). */
export class Emitter {
  elapsed = 0;
  /** Накопленная дробная часть эмиссии (rate·dt). */
  acc = 0;
  active = true;

  constructor(readonly name: string, readonly cfg: PsiConfig, public x: number, public y: number) {}

  stop() {
    this.active = false;
  }
}

export class ParticleLayer extends Container {
  private readonly emitters: Emitter[] = [];
  private readonly list: Particle[] = [];
  private clock = 0;

  constructor() {
    super();
    this.eventMode = "none";
  }

  /** Запускает эмиттер name (money-changes, water-changes, level-available…) в точке (x, y). */
  start(name: string, x: number, y: number) {
    const cfg = configs[name];
    if (!cfg) return null;
    const e = new Emitter(name, cfg, x, y);
    this.emitters.push(e);
    return e;
  }

  update(dt: number) {
    this.clock = Math.min(this.clock + dt, 0.25);
    while (this.clock >= STEP) {
      this.clock -= STEP;
      this.step(STEP);
    }
  }

  private step(dt: number) {
    // частицы: ускорения от/к эмиттеру и вдоль перпендикуляра, гравитация вниз
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.s.destroy();
        this.list.splice(i, 1);
        continue;
      }
      const dx = p.x - p.ex;
      const dy = p.y - p.ey;
      const len = Math.hypot(dx, dy) || 1e-4;
      const ux = dx / len;
      const uy = dy / len;
      p.vx += (ux * p.radial - uy * p.tangential) * dt;
      p.vy += (uy * p.radial + ux * p.tangential) * dt + p.gravity * dt;
      p.x += p.vx;
      p.y += p.vy;
      p.spin += p.dSpin * dt;
      p.scale += p.dScale * dt;
      for (let k = 0; k < 4; k++) p.color[k] += p.dColor[k] * dt;
      const [r, g, b, a] = p.color.map((c) => Math.max(0, Math.min(1, c)));
      p.s.position.set(p.x, p.y);
      p.s.scale.set(Math.max(0, p.scale));
      p.s.rotation = p.spin * p.age;
      p.s.tint = ((r * 255) << 16) | ((g * 255) << 8) | (b * 255);
      p.s.alpha = a;
    }
    // эмиссия
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      const finite = e.cfg.duration >= 0;
      if (e.active) {
        e.elapsed += dt;
        if (finite && e.elapsed >= e.cfg.duration) e.active = false;
      }
      if (!e.active) {
        this.emitters.splice(i, 1);
        continue;
      }
      e.acc += e.cfg.rate * dt;
      const n = Math.floor(e.acc);
      e.acc -= n;
      for (let k = 0; k < n && this.list.length < MAX_PARTICLES; k++) this.spawn(e);
    }
  }

  private spawn(e: Emitter) {
    const c = e.cfg;
    const life = rand(c.life[0], c.life[1]);
    const angle = c.angle - Math.PI / 2 + rand(0, c.spread) - c.spread * 0.5;
    const speed = rand(c.speed[0], c.speed[1]);
    const scale = rand(c.scale.start, c.scale.start + (c.scale.end - c.scale.start) * c.scale.var);
    const spin = rand(c.spin.start, c.spin.start + (c.spin.end - c.spin.start) * c.spin.var);
    const color = c.color_start.map((s, i) => rand(s, s + (c.color_end[i] - s) * c.color_var[i === 3 ? 1 : 0]));
    const x = e.x + rand(-2, 2);
    const y = e.y + rand(-2, 2);
    const s = new Sprite(tex(TEXTURE[e.name] ?? "particle_star"));
    s.anchor.set(0.5);
    s.blendMode = "add";
    // частица рождается после шага обновления и до отрисовки — без начального вида она один кадр мигает в углу (0; 0) слоя
    const [r, g, b, a] = color.map((v) => Math.max(0, Math.min(1, v)));
    s.position.set(x, y);
    s.scale.set(Math.max(0, scale));
    s.tint = ((r * 255) << 16) | ((g * 255) << 8) | (b * 255);
    s.alpha = a;
    this.addChild(s);
    this.list.push({
      s,
      ex: e.x,
      ey: e.y,
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: rand(c.gravity[0], c.gravity[1]),
      radial: rand(c.radial[0], c.radial[1]),
      tangential: rand(c.tangential[0], c.tangential[1]),
      age: 0,
      life,
      spin,
      dSpin: (c.spin.end - spin) / life,
      scale,
      dScale: (c.scale.end - scale) / life,
      color,
      dColor: color.map((v, i) => (c.color_end[i] - v) / life),
    });
  }
}
