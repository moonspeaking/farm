// «Ферма Айрис» (Magic Farm 1) на PixiJS: главное меню → ферма ⇄ город.
import { Application, Container, Graphics } from "pixi.js";
import { audio } from "./audio";
import { installCursors } from "./cursors";
import { offerInstall } from "./install";
import { watchUpdates } from "./update";
import { currentProfile, profiles } from "./profiles";
import { requestPersistence, sessionFlag } from "./storage";
import { newUserDialog, selectUserScreen } from "./users";
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
import { H, hasImages, loadImages, setSharp, toast, unloadImages, W } from "./ui";

async function main() {
  const app = new Application();
  await app.init({ background: 0x0f1a08, resizeTo: window, antialias: true, autoDensity: true, resolution: devicePixelRatio });
  // оригинал под CrossOver на Mac выводит пиксели без профиля, и macOS растягивает sRGB-картинки на гамут Display P3 —
  // трава становится почти чисто зелёной. Повторяем этот вид: те же значения пикселей браузер трактует как P3
  // (на экранах без P3 ничего не меняется)
  const gl = (app.renderer as { gl?: WebGL2RenderingContext }).gl;
  if (gl && "drawingBufferColorSpace" in gl) gl.drawingBufferColorSpace = "display-p3";
  document.getElementById("game")!.appendChild(app.canvas);

  requestPersistence();
  installCursors(app, audio.options.cursors);
  const rules = await loadRules();
  // экран загрузки из index.html: картинки — основная часть (≈ 70 %), звуки ≈ 20 %, шрифты и частицы — остаток
  const loader = (window as unknown as { __loader?: { set(p: number): void; done(): void } }).__loader;
  const part = { img: 0, snd: 0, rest: 0 };
  const report = () => loader?.set(0.7 * part.img + 0.2 * part.snd + 0.1 * part.rest);
  await Promise.all([
    loadImages(rules.core_images, (f) => ((part.img = f), report())),
    loadFonts().then(() => ((part.rest += 0.5), report())),
    loadParticles().then(() => ((part.rest += 0.5), report())),
    audio.load(rules.audio, (f) => ((part.snd = f), report())),
  ]);
  // на телефонах звук включается только жестом «отпустил палец» / click — слушаем все события, пока контекст не запустится
  for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) window.addEventListener(type, () => audio.unlock(), { passive: true });
  document.addEventListener("visibilitychange", () => !document.hidden && audio.unlock());
  audio.playMusic("menu"); // музыка меню — сразу при открытии; если браузер не разрешил, начнётся с первого касания
  document.title = rules.texts.title;
  loader?.done();
  offerInstall();
  watchUpdates({ idle: () => !game, beforeReload: () => curFarm()?.persist() });

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
  // в портретной ориентации экран 4:3 вписывается по ширине и всё мелко — просим повернуть телефон (можно закрыть)
  const rotate = document.getElementById("rotate");
  const checkRotate = () => {
    const closed = sessionFlag.get("rotate-closed");
    if (rotate) rotate.style.display = !closed && innerWidth < innerHeight * 0.8 && innerWidth < 700 ? "block" : "none";
  };
  document.getElementById("rotate-close")?.addEventListener("click", () => {
    sessionFlag.set("rotate-closed");
    checkRotate();
  });
  window.addEventListener("resize", checkRotate);
  checkRotate();
  // на компьютере напоминаем про клавишу F (весь экран) — как на телефоне про поворот; пропадает после входа в полноэкранный режим или по крестику
  const fshint = document.getElementById("fshint");
  const checkFs = () => {
    const closed = sessionFlag.get("fshint-closed");
    const desktop = innerWidth >= 700 && matchMedia("(pointer: fine)").matches && !matchMedia("(display-mode: fullscreen)").matches;
    if (fshint) fshint.style.display = !closed && desktop && !document.fullscreenElement ? "block" : "none";
  };
  document.getElementById("fshint-close")?.addEventListener("click", () => {
    sessionFlag.set("fshint-closed");
    checkFs();
  });
  document.addEventListener("fullscreenchange", checkFs);
  window.addEventListener("resize", checkFs);
  checkFs();
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
    // подсказки не переходят с экрана на экран
    worldTut?.dismiss();
    for (const f of Object.values(farms)) f.dismissTutorial();
    for (const c of world.children) if (c !== frame && c !== worldTut) c.visible = c === scene;
  };

  /** Картинки локации n (вредители, фоны, портреты) грузятся при первом заходе — так в памяти нет неиспользуемых локаций; на это время виден экран загрузки. */
  const loading = new Map<number, { promise: Promise<void>; last: number; listeners: ((f: number) => void)[] }>();
  /** Одна загрузка на локацию: фоновая догрузка в меню и вход в игру делят её, а экран загрузки показывает общий прогресс. */
  const loadLocation = (n: number, onProgress?: (f: number) => void) => {
    let l = loading.get(n);
    if (!l) {
      const entry = { promise: Promise.resolve(), last: 0, listeners: [] as ((f: number) => void)[] };
      entry.promise = loadImages(rules.location_images[String(n)] ?? [], (f) => {
        entry.last = f;
        for (const cb of entry.listeners) cb(f);
      }).finally(() => loading.delete(n));
      loading.set(n, entry);
      l = entry;
    }
    if (onProgress) {
      onProgress(l.last);
      l.listeners.push(onProgress);
    }
    return l.promise;
  };

  const ensureLocation = async (n: number) => {
    if (hasImages(rules.location_images[String(n)] ?? [])) return;
    const screen = (window as unknown as { __loader?: { show(): void; set(p: number): void; done(): void } }).__loader;
    screen?.show();
    try {
      await loadLocation(n, (f) => screen?.set(f));
    } finally {
      screen?.done();
    }
  };

  /** В меню тихо догружаем картинки локации, где остановился игрок: «Кампания» откроет игру без экрана загрузки. */
  const preloadLocation = () => {
    const n = Game.savedLocation();
    void loadLocation(rules.location_images[String(n)] ? n : 1).catch(() => undefined);
  };

  // есть ли у города выгруженной локации ещё квесты (карта показывает значок только у городов с квестами)
  const questsLeft: Record<number, boolean> = {};

  /**
   * Ушли в локацию n: ферма, город и картинки остальных локаций выгружаются из памяти.
   * Состояние ферм уже сохранено в игре (persist при уходе), при возвращении всё строится заново, а картинки подгружаются с экраном загрузки.
   */
  const dropOthers = (n: number) => {
    const keep = new Set([...rules.core_images, ...(rules.location_images[String(n)] ?? [])]);
    for (const k of Object.keys(towns).map(Number).filter((k) => k !== n)) {
      questsLeft[k] = towns[k].hasQuests();
      towns[k].destroy({ children: true });
      delete towns[k];
    }
    for (const k of Object.keys(farms).map(Number).filter((k) => k !== n)) {
      farms[k].destroy({ children: true });
      delete farms[k];
    }
    const drop = Object.values(rules.location_images).flat().filter((name) => !keep.has(name));
    void unloadImages(drop);
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
      dayEnded: () => recordScore(rules, profiles().find((p) => p.id === g.profile)?.name ?? "Айрис", g.day, g.gold, false),
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
  let entering = false;
  const enter = async (g: Game, n: number, scene: "farm" | "town") => {
    if (entering) return;
    entering = true;
    try {
      await ensureLocation(n);
    } finally {
      entering = false;
    }
    curFarm()?.persist();
    g.switchLocation(n);
    build(g, n);
    dropOthers(n);
    show(scene === "farm" ? farms[n] : towns[n]);
    farms[n].refresh();
    towns[n].refresh();
    if (scene === "town") towns[n].entered();
  };

  const userChanged = () => {
    menu.refreshUser();
    preloadLocation();
  };
  const menu = new Menu(rules, {
    hasSave: () => Game.hasSave(),
    options: () => optionsScreen(world, rules, () => undefined),
    highscores: () => highscoresScreen(world, rules, () => undefined),
    about: () => void aboutScreen(world, rules),
    play: (fresh) => void start(fresh),
    userName: () => currentProfile()?.name ?? null,
    changeUser: () => selectUserScreen(world, rules, userChanged),
  });
  const start = async (fresh: boolean) => {
    if (fresh) Game.clearSave();
    const g = new Game(rules);
    if (!fresh) g.load();
    await ensureLocation(g.loc);
    for (const f of Object.values(farms)) f.destroy({ children: true });
    for (const t of Object.values(towns)) t.destroy({ children: true });
    worldMap?.destroy({ children: true });
    for (const k of Object.keys(farms)) delete farms[Number(k)];
    for (const k of Object.keys(towns)) delete towns[Number(k)];
    for (const k of Object.keys(questsLeft)) delete questsLeft[Number(k)];
    game = g;
    // только в dev-сборке (npm run dev): в консоли cheat() даёт +50000 монет и 30 уровень
    if (import.meta.env.DEV) (window as unknown as { cheat: () => void }).cheat = () => { g.gold += 50000; g.exp = Math.max(g.exp, rules.exp_levels[28]); g.changed(); };
    worldTut?.destroy({ children: true });
    worldTut = new Tutorial(rules, g, () => audio.options.warnings);
    build(g, g.loc);
    dropOthers(g.loc);
    worldMap = new WorldMap(rules, g, {
      openTown: (n) => enter(g, n, "town"),
      openFarm: (n) => enter(g, n, "farm"),
      close: () => show(towns[g.loc]),
      hasQuests: (n) => (towns[n] ? towns[n].hasQuests() : questsLeft[n] ?? true),
    }, worldTut);
    world.addChild(worldMap, worldTut);
    audio.playMusic("game");
    // новая игра начинается в городе: слуга ждёт Айрис с письмом (квест old_servant)
    show(fresh ? towns[g.loc] : farms[g.loc]);
    if (fresh) towns[g.loc].entered();
  };
  world.addChild(menu);
  show(menu);
  // как в оригинале: без игрока сначала спрашиваем имя (старое сохранение достанется этому игроку)
  if (!currentProfile()) {
    if (profiles().length) selectUserScreen(world, rules, userChanged);
    else void newUserDialog(world, rules, false).then(userChanged);
  } else preloadLocation();
  if (import.meta.env.DEV) Object.assign(window, { __game: { app, get farm() { return curFarm(); }, get town() { return curTown(); }, get game() { return game; }, get map() { return worldMap; }, enter: (n: number, scene: "farm" | "town") => game && enter(game, n, scene), menu, has: (names: string[]) => hasImages(names) } });

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
    // Esc на карте мира возвращает в город (кнопки «назад» на ней нет)
    if (e.code === "Escape" && worldMap?.visible && game) {
      e.preventDefault();
      show(towns[game.loc]);
      return;
    }
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
