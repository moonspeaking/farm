// «Ферма Айрис» (Magic Farm 1) на PixiJS: главное меню → ферма ⇄ город.
import { Application, Container, Graphics } from "pixi.js";
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
import { continueDayOverlay, gameMenu, highscoresScreen, optionsScreen, pauseOverlay, recordScore } from "./screens";
import { H, loadImages, toast, W } from "./ui";

async function main() {
  const app = new Application();
  await app.init({ background: 0x0f1a08, resizeTo: window, antialias: true, autoDensity: true, resolution: devicePixelRatio });
  document.getElementById("game")!.appendChild(app.canvas);

  installCursors(app, audio.options.cursors);
  const rules = await loadRules();
  await Promise.all([loadImages(rules.images), loadFonts(), loadParticles(), audio.load(rules.audio)]);
  window.addEventListener("pointerdown", () => audio.unlock());
  document.title = rules.texts.title;
  document.getElementById("loading")!.remove();

  // экран оригинала 800×600 вписывается в окно с полями (телефон в альбомной ориентации)
  const world = new Container();
  app.stage.addChild(world);
  const fit = () => {
    const k = Math.min(app.screen.width / W, app.screen.height / H);
    world.scale.set(k);
    world.position.set((app.screen.width - W * k) / 2, (app.screen.height - H * k) / 2);
  };
  fit();
  app.renderer.on("resize", fit);
  const frame = new Graphics().rect(0, 0, W, H).fill(0xffffff);
  world.addChild(frame);
  world.mask = frame;

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
      toMenu: () =>
        gameMenu(world, rules, {
          options: () => optionsScreen(world, rules, () => undefined),
          exit: () => {
            f.persist();
            audio.playMusic("menu");
            show(menu);
          },
        }),
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
        f.refresh();
        show(f);
      },
      toMap: () => {
        worldMap!.opened();
        show(worldMap!);
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
    farms[n].refresh();
    towns[n].refresh();
    show(scene === "farm" ? farms[n] : towns[n]);
    if (scene === "town") towns[n].entered();
  };

  const menu = new Menu(rules, {
    hasSave: () => Game.hasSave(),
    options: () => optionsScreen(world, rules, () => undefined),
    highscores: () => highscoresScreen(world, rules, () => undefined),
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

  // пауза: пробел — «Пауза», Esc — continue_day_screen с кнопкой «Закончить День»; игровые таймеры (и Робин) стоят, пока висит затемнение
  let paused: Container | null = null;
  const resume = () => {
    paused?.destroy({ children: true });
    paused = null;
  };
  window.addEventListener("keydown", (e) => {
    if ((e.code !== "Space" && e.code !== "Escape") || !curFarm()?.visible) return;
    e.preventDefault();
    if (paused) return resume();
    if (e.code === "Space") paused = pauseOverlay(world, rules);
    else if (curFarm()!.inDay) {
      paused = continueDayOverlay(world, rules, {
        resume,
        endDay: () => {
          resume();
          curFarm()?.endDayNow();
        },
      });
    }
  });
  document.addEventListener("visibilitychange", () => document.hidden && curFarm()?.persist());

  // ?speed=10 ускоряет игровые таймеры (для отладки)
  const speed = Number(new URLSearchParams(location.search).get("speed")) || 1;
  app.ticker.add((t) => {
    const dt = Math.min(t.deltaMS, 100) / 1000;
    worldTut?.update(dt);
    if (!paused) {
      curFarm()?.update(dt * speed);
      if (curTown()?.visible) curTown()!.update(dt);
    }
  });
}

main().catch((e) => {
  document.getElementById("loading")!.textContent = `Ошибка: ${e}`;
  console.error(e);
});
