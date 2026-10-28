// Звуки и музыка оригинала (public/audio): короткие звуки через WebAudio, музыка — плейлистом из game_list.txt / menu_list.txt.
import { applyCursors } from "./cursors";
import { loadOptions, Options, saveOptions } from "./state";

const MENU_TRACKS = ["menu", "game5"];
const GAME_TRACKS = ["game1", "game2", "game3", "game4", "game5"];

class AudioManager {
  private ctx: AudioContext | null = null;
  private soundGain: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private music: HTMLAudioElement | null = null;
  private playlist: string[] = [];
  private index = 0;
  private unlocked = false;
  options: Options = loadOptions();

  /** Загружает короткие звуки (всё, кроме музыки) заранее. */
  async load(files: string[], onProgress?: (fraction: number) => void) {
    try {
      this.ctx = new AudioContext();
    } catch {
      return; // без WebAudio игра просто молчит
    }
    this.soundGain = this.ctx.createGain();
    this.soundGain.gain.value = this.options.sound;
    this.soundGain.connect(this.ctx.destination);
    const list = files.filter((f) => !/^(menu|game\d)\./.test(f));
    let done = 0;
    await Promise.all(
      list.map(async (f) => {
          try {
            const res = await fetch(`audio/${f}`);
            const buf = await this.ctx!.decodeAudioData(await res.arrayBuffer());
            this.buffers.set(f.replace(/\.(ogg|wav)$/, ""), buf);
          } catch {
            // нечитаемый или пустой звук пропускаем
          }
          onProgress?.(++done / list.length);
        }),
    );
  }

  /**
   * Браузер разрешает звук только после жеста пользователя. На телефонах (Chrome, Samsung Internet) жестом считается
   * отпускание пальца или click, но не pointerdown, поэтому вызывается из нескольких событий и пробует снова, пока контекст не запустится.
   */
  unlock() {
    if (this.unlocked) return;
    const ctx = this.ctx;
    const done = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      // музыку, которую браузер не дал включить сам (автовоспроизведение), запускаем с первого касания или клавиши
      if (this.playlist.length && (!this.music || this.music.paused)) this.startTrack();
    };
    if (!ctx) return done();
    void ctx.resume().then(() => ctx.state === "running" && done()).catch(() => undefined);
  }

  play(name: string, volume = 1) {
    const buf = this.buffers.get(name);
    if (!buf || !this.ctx || !this.soundGain) return;
    if (this.ctx.state !== "running") return void this.ctx.resume().catch(() => undefined); // контекст мог уснуть (вкладка в фоне)
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    if (volume !== 1) {
      const g = this.ctx.createGain();
      g.gain.value = volume;
      src.connect(g).connect(this.soundGain);
    } else src.connect(this.soundGain);
    src.start();
  }

  /** Музыка меню или игры; повторный вызов с тем же списком не перезапускает трек. */
  playMusic(kind: "menu" | "game") {
    const list = kind === "menu" ? MENU_TRACKS : GAME_TRACKS;
    if (this.playlist === list) return;
    this.playlist = list;
    this.index = kind === "game" ? Math.floor(Math.random() * list.length) : 0;
    // пробуем сразу: если браузер разрешает автовоспроизведение, музыка играет уже при открытии игры
    this.startTrack();
  }

  private startTrack() {
    this.music?.pause();
    const a = new Audio(`audio/${this.playlist[this.index % this.playlist.length]}.ogg`);
    a.volume = this.options.music;
    a.addEventListener("ended", () => {
      this.index += 1;
      this.startTrack();
    });
    this.music = a;
    void a.play().catch(() => undefined);
  }

  setOptions(o: Options) {
    this.options = o;
    if (this.soundGain) this.soundGain.gain.value = o.sound;
    if (this.music) this.music.volume = o.music;
    applyCursors(o.cursors);
    saveOptions(o);
  }
}

export const audio = new AudioManager();
