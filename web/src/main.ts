// «Ферма Айрис» (Magic Farm 1) на PixiJS: главное меню → ферма ⇄ город.
import { Application, ColorMatrixFilter, Container, Graphics } from "pixi.js";
import { audio } from "./audio";
import { installCursors } from "./cursors";
import { loadParticles } from "./particles";
import { Farm } from "./farm";
import { Menu } from "./menu";
import { QuestEngine } from "./quests";
import { loadRules, locationRules } from "./rules";
import { Game } from "./state";
import { Town } from "./town";
import { Tutorial } from "./tutorial";
import { WorldMap } from "./worldmap";
import { loadFonts } from "./popfont";
import { aboutScreen, gameMenu, highscoresScreen, optionsScreen, pauseOverlay, recordScore } from "./screens";
import { H, loadImages, setSharp, toast, W } from "./ui";

async function main() {
  const app = new Application();
  await app.init({ background: 0x0f1a08, resizeTo: window, antialias: true, autoDensity: true, resolution: devicePixelRatio });
  document.getElementById("game")!.appendChild(app.canvas);

  // профиль лежит в localStorage: просим браузер не вычищать его при нехватке места
  void navigator.storage?.persist?.().catch(() => undefined);
  installCursors(app, audio.options.cursors);
  const rules = await loadRules();
  // экран загрузки из index.html: картинки — основная часть (≈ 70 %), звуки ≈ 20 %, шрифты и частицы — остаток
  const loader = (window as unknown as { __loader?: { set(p: number): void; done(): void } }).__loader;
  const part = { img: 0, snd: 0, rest: 0 };
  const report = () => loader?.set(0.7 * part.img + 0.2 * part.snd + 0.1 * part.rest);
  await Promise.all([
    loadImages(rules.images, (f) => ((part.img = f), report())),
    loadFonts().then(() => ((part.rest += 0.5), report())),
    loadParticles().then(() => ((part.rest += 0.5), report())),
    audio.load(rules.audio, (f) => ((part.snd = f), report())),
  ]);
  window.addEventListener("pointerdown", () => audio.unlock());
  window.addEventListener("keydown", () => audio.unlock());
  audio.playMusic("menu"); // музыка меню — сразу при открытии; если браузер не разрешил, начнётся с первого касания
  document.title = rules.texts.title;
  loader?.done();

  // экран оригинала 800×600 вписывается в окно с полями (телефон в альбомной ориентации)
  const world = new Container();
  app.stage.addChild(world);
  const fit = () => {
    const k = Math.min(app.screen.width / W, app.screen.height / H);
    world.scale.set(k);
    setSharp(k * devicePixelRatio >= 1.75);
    world.position.set((app.screen.width - W * k) / 2, (app.screen.height - H * k) / 2);
  };
  fit();
  app.renderer.on("resize", fit);
  const frame = new Graphics().rect(0, 0, W, H).fill(0xffffff);
  world.addChild(frame);
  world.mask = frame;
  // цветокоррекция под вид оригинала. Подобрана по кадру оригинала (трава справа внизу фермы): средний цвет (0,206; 0,537; 0,076),
  // насыщенность 0,872 против (0,246; 0,523; 0,105) и 0,823 у самих файлов — насыщенность +15 %, красный ×0,87, зелёный ×0,97, синий ×0,96
  const grade = new ColorMatrixFilter();
  grade.saturate(0.15, false);
  for (let i = 0; i < 5; i++) {
    grade.matrix[i] *= 0.87;
    grade.matrix[5 + i] *= 0.97;
    grade.matrix[10 + i] *= 0.96;
  }
  world.filters = [grade];

  let game: Game | null = null;
  // у каждой локации своя ферма, город и набор квестов; создаются при первом заходе
  const farms: Record<number, Farm> = {};
  const towns: Record<number, Town> = {};
  let worldMap: WorldMap | null = null;
  // подсказки города и карты рисуются поверх всего экрана, отдельно от подсказок фермы
  let worldTut: Tutorial | null = null;
  const curFarm = () => (game ? farms[game.loc] ?? null : null);
  const curTown = () => (game ? towns[game.loc] ?? null : null);

  const show = (scene: Container) => {
    // подсказки не переходят с экрана на экран
    worldTut?.dismiss();
    for (const f of Object.values(farms)) f.dismissTutorial();
    for (const c of world.children) if (c !== frame && c !== worldTut) c.visible = c === scene;
  };

  /** Создаёт ферму и город локации n (игра уже переключена на неё). */
  const build = (g: Game, n: number) => {
    if (farms[n]) return;
    const lr = locationRules(rules, n);
    const f: Farm = new Farm(lr, g, {
      toTown: () => {
        towns[n].refresh();
        show(towns[n]);
        towns[n].entered();
      },
      toMenu: () => openMenu(f),
      dayEnded: () => recordScore(rules, "Айрис", g.day, g.gold, false),
    });
    const quests = new QuestEngine(lr.quests, g, {
      removeAllVegetations: () => f.removeAllPlants(),
      notify: (s) => toast(world, s),
      marked: (m) => m === "win" && worldTut?.show("game_fin", 400, 300),
      hasEmptyRidge: () => f.hasEmptyRidge(),
      addVegetation: (v) => f.addVegetation(v),
      removeVegetation: (v) => f.removeVegetation(v),
    });
    const t: Town = new Town(lr, g, quests, {
      toFarm: () => {
        show(f);
        f.refresh();
      },
      toMap: () => {
        show(worldMap!);
        worldMap!.opened();
      },
      saved: () => f.persist(),
      menu: () => f.openMenu(),
    }, worldTut!);
    farms[n] = f;
    towns[n] = t;
    world.addChild(f, t);
  };

  /** Переход в локацию n: ферма текущей сохраняется, состояние игры переключается. */
  const enter = (g: Game, n: number, scene: "farm" | "town") => {
    curFarm()?.persist();
    g.switchLocation(n);
    build(g, n);
    show(scene === "farm" ? farms[n] : towns[n]);
    farms[n].refresh();
    towns[n].refresh();
    if (scene === "town") towns[n].entered();
  };

  const menu = new Menu(rules, {
    hasSave: () => Game.hasSave(),
    options: () => optionsScreen(world, rules, () => undefined),
    highscores: () => highscoresScreen(world, rules, () => undefined),
    about: () => void aboutScreen(world, rules),
    play: (fresh) => {
      for (const f of Object.values(farms)) f.destroy({ children: true });
      for (const t of Object.values(towns)) t.destroy({ children: true });
      worldMap?.destroy({ children: true });
      for (const k of Object.keys(farms)) delete farms[Number(k)];
      for (const k of Object.keys(towns)) delete towns[Number(k)];
      if (fresh) Game.clearSave();
      const g = new Game(rules);
      if (!fresh) g.load();
      game = g;
      worldTut?.destroy({ children: true });
      worldTut = new Tutorial(rules, g, () => audio.options.warnings);
      build(g, g.loc);
      worldMap = new WorldMap(rules, g, {
        openTown: (n) => enter(g, n, "town"),
        openFarm: (n) => enter(g, n, "farm"),
        close: () => show(towns[g.loc]),
        hasQuests: (n) => !towns[n] || towns[n].hasQuests(),
      }, worldTut);
      world.addChild(worldMap, worldTut);
      audio.playMusic("game");
      // новая игра начинается в городе: слуга ждёт Айрис с письмом (квест old_servant)
      show(fresh ? towns[g.loc] : farms[g.loc]);
      if (fresh) towns[g.loc].entered();
    },
  });
  world.addChild(menu);
  show(menu);
  if (import.meta.env.DEV) Object.assign(window, { __game: { app, get farm() { return curFarm(); }, get town() { return curTown(); }, get game() { return game; }, get map() { return worldMap; }, enter: (n: number, scene: "farm" | "town") => game && enter(game, n, scene), menu } });

  // пауза: пробел — «Пауза», Esc и кнопка «Меню» — меню игры; пока висит любое из них, игровые таймеры (и Робин) стоят
  let paused: Container | null = null;
  let closeMenu: (() => void) | null = null;
  const resume = () => {
    paused?.destroy({ children: true });
    paused = null;
  };
  function openMenu(f: Farm) {
    if (closeMenu || paused) return;
    const done = () => (closeMenu = null);
    closeMenu = gameMenu(world, rules, {
      options: () => optionsScreen(world, rules, done),
      exit: () => {
        done();
        f.persist();
        audio.playMusic("menu");
        show(menu);
      },
      closed: done,
    });
  }
  window.addEventListener("keydown", (e) => {
    // F — полный экран и обратно (работает и в меню); на iPhone Fullscreen API нет — тогда игра ставится на главный экран как PWA
    if (e.code === "KeyF" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
      else void document.documentElement.requestFullscreen?.().catch(() => undefined);
      return;
    }
    if (e.code !== "Space" && e.code !== "Escape") return;
    const farm = curFarm();
    if (!farm || !(farm.visible || curTown()?.visible)) return;
    e.preventDefault();
    if (e.code === "Escape") {
      if (closeMenu) closeMenu();
      else if (!paused) openMenu(farm);
      return;
    }
    if (!farm.visible || closeMenu) return;
    if (paused) resume();
    else paused = pauseOverlay(world, rules);
  });
  document.addEventListener("visibilitychange", () => document.hidden && curFarm()?.persist());

  // ?speed=10 ускоряет игровые таймеры (для отладки)
  const speed = Number(new URLSearchParams(location.search).get("speed")) || 1;
  app.ticker.add((t) => {
    const dt = Math.min(t.deltaMS, 100) / 1000;
    worldTut?.update(dt);
    if (worldMap?.visible) worldMap.update(dt);
    if (!paused && !closeMenu) {
      curFarm()?.update(dt * speed);
      if (curTown()?.visible) curTown()!.update(dt);
    }
  });
}

main().catch((e) => {
  (window as unknown as { __loader?: { fail(t: string): void } }).__loader?.fail(`Ошибка: ${e}`);
  console.error(e);
});
