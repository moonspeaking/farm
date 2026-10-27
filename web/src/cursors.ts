// Курсоры оригинала (public/cursors): горячая точка — минус offset из properties_ru.xml → cursors.
import type { Application } from "pixi.js";

const HOTSPOTS: Record<string, [number, number]> = {
  attack: [34, 32],
  buy: [40, 17],
  gather_product: [9, 7],
  normal: [8, 7],
  pour: [38, 37],
  sell: [40, 17],
  talk: [29, 20],
};

let app: Application | null = null;

/** Регистрирует стили курсоров в pixi: объекту достаточно задать cursor = "pour" и т. п. */
export function installCursors(a: Application, enabled: boolean) {
  app = a;
  applyCursors(enabled);
}

/** «Специальные Курсоры» из опций: включены — картинки оригинала, выключены — обычные. */
export function applyCursors(enabled: boolean) {
  const styles = app?.renderer.events.cursorStyles;
  if (!styles) return;
  for (const [name, [x, y]] of Object.entries(HOTSPOTS)) {
    styles[name] = enabled ? `url(cursors/${name}.png) ${x} ${y}, ${name === "normal" ? "default" : "pointer"}` : name === "normal" ? "default" : "pointer";
  }
  styles.default = styles.normal;
}
