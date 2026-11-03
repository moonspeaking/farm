// Экраны игроков оригинала: «Выберите игрока» (select_user, 349×450) и «Введите ваше имя.» (new_user, 444×143).
import { Container, Graphics, Rectangle } from "pixi.js";
import { rgb } from "./popfont";
import { createProfile, currentProfile, deleteProfile, NAME_MAX, profiles, selectProfile } from "./profiles";
import type { Rules } from "./rules";
import { fmt } from "./rules";
import { COLOR, dialog, H, image, pop, textButton, W } from "./ui";

function shade(onTap?: () => void) {
  const s = new Graphics().rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.45 });
  s.eventMode = "static";
  if (onTap) s.on("pointertap", onTap);
  return s;
}

/**
 * Ввод имени нового игрока. Поле — HTML-input поверх холста (на телефоне так открывается клавиатура),
 * в рамке edit (81; 51) 240 × 24. true — игрок создан и стал текущим; false — «Отмена» (при cancelable = false отменить нельзя).
 */
export function newUserDialog(parent: Container, rules: Rules, cancelable = true): Promise<boolean> {
  return new Promise((resolve) => {
    const layer = new Container();
    layer.addChild(shade(cancelable ? () => finish(false) : undefined));
    const box = new Container();
    box.eventMode = "static";
    box.position.set((W - 444) / 2, (H - 143) / 2);
    box.addChild(image("new_user_bg"));
    const header = pop(rules.texts.headers.enter_new_user_name ?? "Введите ваше имя.", "TC4_16_en", COLOR.white, { align: "center" });
    header.position.set(222, 20); // header_pos 140; 20 — по центру окна
    box.addChild(header);

    const input = document.createElement("input");
    input.maxLength = NAME_MAX;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.enterKeyHint = "done";
    Object.assign(input.style, {
      position: "fixed", zIndex: "20", border: "0", outline: "none", background: "transparent",
      color: "#3c2410", fontFamily: '"Comic Sans MS", "Comic Neue", cursive', fontWeight: "bold", padding: "0 4px", boxSizing: "border-box",
    });
    // поле следует за холстом: координаты окна → экранные (масштаб и поля вокруг 800×600)
    const place = () => {
      const canvas = document.querySelector<HTMLCanvasElement>("#game canvas");
      if (!canvas || box.destroyed) return;
      const r = canvas.getBoundingClientRect();
      const a = box.toGlobal({ x: 81, y: 51 });
      const b = box.toGlobal({ x: 81 + 282, y: 51 + 28 });
      const k = r.width / canvas.clientWidth || 1;
      Object.assign(input.style, {
        left: `${r.left + a.x * k}px`, top: `${r.top + a.y * k}px`,
        width: `${(b.x - a.x) * k}px`, height: `${(b.y - a.y) * k}px`, fontSize: `${(b.y - a.y) * k * 0.72}px`,
      });
    };
    document.body.appendChild(input);
    requestAnimationFrame(() => {
      place();
      input.focus();
    });
    addEventListener("resize", place);

    const finish = (ok: boolean) => {
      removeEventListener("resize", place);
      input.remove();
      layer.destroy({ children: true });
      resolve(ok);
    };
    const submit = () => {
      if (createProfile(input.value)) return finish(true);
      input.focus(); // пустое или уже занятое имя — ждём другое
      input.select();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      else if (e.key === "Escape" && cancelable) finish(false);
      e.stopPropagation(); // F и пробел в поле — это буквы, а не полный экран и пауза
    });
    const ok = textButton(rules.texts.buttons.ok ?? "OK", submit);
    ok.position.set(64 + 18, 78 + 17);
    box.addChild(ok);
    if (cancelable) {
      const cancel = textButton(rules.texts.buttons.cancel ?? "Отмена", () => finish(false));
      cancel.position.set(275 + 51, 75 + 17);
      box.addChild(cancel);
    }
    layer.addChild(box);
    parent.addChild(layer);
  });
}

/** Список игроков на свитке: выбор, «Создать», «Удалить», OK. onClose вызывается, когда выбран текущий игрок. */
export function selectUserScreen(parent: Container, rules: Rules, onClose: () => void) {
  const layer = new Container();
  layer.addChild(shade(() => selected && ok())); // щелчок мимо списка — как «OK» с выбранным игроком
  const box = new Container();
  box.eventMode = "static";
  box.position.set((W - 349) / 2, (H - 450) / 2);
  box.addChild(image("select_user_bg"));
  const header = pop(rules.texts.headers.select_user ?? "Выберите игрока", "TC4_16_en", COLOR.white, { align: "center" });
  header.position.set(175, 35); // header_pos 100; 35 — по центру окна
  box.addChild(header);

  // list_box (97; 80) 160 × 228, шрифт comic_18; выбранная строка — заливка 0; 0; 128 и белый текст
  const ROW = 25;
  const VISIBLE = Math.floor(228 / ROW);
  const list = new Container();
  list.position.set(97, 80);
  list.hitArea = new Rectangle(0, 0, 160, 228);
  list.eventMode = "static";
  box.addChild(list);
  let selected = currentProfile()?.id ?? profiles()[0]?.id ?? null;
  let scroll = 0;
  const render = () => {
    list.removeChildren().forEach((c) => c.destroy({ children: true }));
    const users = profiles();
    scroll = Math.max(0, Math.min(scroll, users.length - VISIBLE));
    users.slice(scroll, scroll + VISIBLE).forEach((u, i) => {
      const row = new Container();
      row.y = i * ROW;
      const on = u.id === selected;
      row.addChild(new Graphics().rect(0, 0, 160, ROW - 1).fill({ color: 0x000080, alpha: on ? 1 : 0.001 }));
      const l = pop(u.name, "comic_18", on ? COLOR.white : rgb(60, 36, 12), { scale: 0.9 });
      l.position.set(6, 2);
      row.addChild(l);
      row.eventMode = "static";
      row.cursor = "pointer";
      row.on("pointertap", () => {
        selected = u.id;
        render();
      });
      list.addChild(row);
    });
  };
  list.on("wheel", (e) => {
    scroll += Math.sign(e.deltaY);
    render();
  });

  const close = () => {
    layer.destroy({ children: true });
    onClose();
  };
  const create = async () => {
    if (await newUserDialog(parent, rules)) selected = currentProfile()?.id ?? selected;
    render();
  };
  const remove = async () => {
    const u = profiles().find((p) => p.id === selected);
    if (!u) return;
    const r = await dialog(parent, {
      body: fmt(rules.texts.users?.delete_confirmation ?? "Удалить игрока %name%?", { name: u.name }),
      buttons: [{ text: rules.texts.buttons.yes ?? "Да", value: "ok" }, { text: rules.texts.buttons.no ?? "Нет", value: "no" }],
    });
    if (r !== "ok") return;
    deleteProfile(u.id);
    selected = currentProfile()?.id ?? profiles()[0]?.id ?? null;
    render();
  };
  const ok = () => {
    if (!selected) return void create(); // без игроков играть нельзя — сначала имя
    selectProfile(selected);
    close();
  };
  const button = (text: string, x: number, y: number, w: number, fn: () => void) => {
    const b = textButton(text, fn);
    b.position.set(x + w / 2, y + 17);
    box.addChild(b);
  };
  button(rules.texts.buttons.new_user ?? "Создать", 122, 319, 111, () => void create());
  button(rules.texts.buttons.delete ?? "Удалить", 116, 349, 120, () => void remove());
  button(rules.texts.buttons.ok ?? "OK", 158, 379, 36, ok);
  render();
  layer.addChild(box);
  parent.addChild(layer);
}
