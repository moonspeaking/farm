"""Экспорт «Фермы Айрис» (Magic Farm 1) в веб: картинки и правила первой локации.

Картинки PopCap: X.jpg (цвет) + X_.png (альфа в яркости) → web/public/img/<имя>.webp с альфой.
Правила: xml/properties_ru.xml, xml/locations/location_1.xml, xml/locations/items.xml,
xml/ru/ru.xml (cp1251 без объявления кодировки) → web/public/data/rules.json. Числа не правятся.

Запуск: python3 export_mf1.py "<папка игры>" <папка web>
"""
import json
import subprocess
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image

# имя в вебе -> путь в data/ без расширения
IMAGES = {
    "bg": "game/farms/location_1",
    "stat_panel": "game/stat_control",
    "round_button": "buttons/back",
    "tut_circle": "tutorial/circle_103",
    "tut_circle_large": "tutorial/circle_large_smooth",
    "tut_dead": "tutorial/first_dead_flower",
    "tut_basket": "tutorial/bouquets_shop_busket",
    "tut_bouquets": "tutorial/bouquets_shop_bouquets",
    "particle_star": "particles/water-changes",
    "particle_sparkle": "particles/level-available",
    "dialog": "main_menu/dialog_roll",
    "shop_small": "game/shop/shop_button_small",
    "shop_small_cant": "game/shop/shop_button_small_cant_buy",
    "shop_medium": "game/shop/shop_button_medium",
    "shop_medium_cant": "game/shop/shop_button_medium_cant_buy",
    "veg_baloon": "game/shop/buy_veg_baloon",
    "clock_back": "game/whether_time_ctrl/back",
    "clock_fore": "game/whether_time_ctrl/fore",
    "clock_pointer": "game/whether_time_ctrl/pointer",
    "weather_normal": "game/whether_time_ctrl/normal",
    "ridge": "obstacles/ridge_00",
    "well": "obstacles/well_00",
    "barrel": "game/farms/water_storage/barrel_01",
    "barrel_water": "game/farms/water_storage/barrel_water_01",
    "pail": "game/farms/water_storage/farm_1_pail_1",
    "pail_water": "game/farms/water_storage/farm_1_water_1",
    "pail_mask": "game/farms/water_storage/farm_1_mask_1",
    "box": "game/farms/product_storage/farm_1_storage_1",
    "box_content": "game/farms/product_storage/farm_1_content_1",
    "load_progress": "main_menu/load_progress",
    "barrel_mask": "game/farms/water_storage/barrel_mask_01",
    "box_mask": "game/farms/product_storage/farm_1_mask_1",
    "drop": "game/progresses/drop",
    "flower": "game/progresses/flower",
    "heart_small": "game/progresses/heart_small",
    "heart_strong": "game/progresses/heart_strong",
    "waterpot": "game/waterpot",
    "cursor_pour": "cursors/pour",
    "menu_bg": "main_menu/main_menu_background",
    "comics": "main_menu/first_comics",
    "town_bg": "game/towns/location_1",
    "dialog_next": "buttons/dialog_next_normal",
    "dialog_next_selected": "buttons/dialog_next_selected",
    "dialog_prev": "buttons/dialog_prev_normal",
    "dialog_prev_selected": "buttons/dialog_prev_selected",
    "quest_info": "buttons/quest_info_normal",
    "bq_back": "game/bouquets/bouquets_back",
    "lu_back": "game/level_up/level_up_back",
    "lu_progress": "game/level_up/progress",
    "lu_glass": "game/level_up/glass",
    "lu_girl": "game/level_up/girl",
    "lu_helper": "game/level_up/helper",
    "lu_farm": "game/level_up/farm",
    "lu_trade": "game/level_up/trade",
    "lu_attack": "game/level_up/attack",
    "lu_helper_attack": "game/level_up/helper_attack",
    "lu_helper_pour": "game/level_up/helper_pour",
    "lu_helper_product": "game/level_up/helper_product",
    "lu_helper_attack_off": "game/level_up/helper_attack_disabled",
    "lu_helper_pour_off": "game/level_up/helper_pour_disabled",
    "lu_helper_product_off": "game/level_up/helper_product_disabled",
    "paper_sheet": "game/level_up/special_skills/paper_sheet",
    "special_back": "game/level_up/special_skills/progress_back",
    "weather_rain": "game/whether_time_ctrl/rain",
    "weather_sun": "game/whether_time_ctrl/sun",
    "weather_back": "game/whether_time_ctrl/whether_back",
    "weather_fore": "game/whether_time_ctrl/whether_fore",
    "cursor_normal": "cursors/normal",
    "cursor_gather": "cursors/gather_product",
    "cursor_attack": "cursors/attack",
    "cursor_buy": "cursors/buy",
    "cursor_sell": "cursors/sell",
    "cursor_talk": "cursors/talk",
    "game_menu_bg": "game/game_menu",
    "pause_bg": "game/pause_back",
    "options_bg": "options/background",
    "options_thumb": "options/thumb",
    "options_check": "options/checked-normal",
    "options_check_off": "options/normal-normal",
    "in_game": "highscores/in_game",
    "highscores_bg": "highscores/highscores_background",
}
SEEDS_STAGES = ("", "_2", "_3")
DIRECTIONS = ("down", "right", "right_down", "right_up", "up")

VEG_FIELDS = {"price_buy": int, "price_sell": int, "life": int, "hunger_min": float, "hunger_max": float,
              "min_product_delay": float, "max_product_delay": float, "upgrade": int,
              "upgrade_to_vegetation": str, "image_offset": "vec", "exp_for_pour": int}


def vec(s):
    return [float(x) for x in s.replace(" ", "").split(";")]


def load_image(path):
    """X.jpg + X_.png (альфа в яркости) или просто X.png."""
    jpg, png = path.with_suffix(".jpg"), path.with_suffix(".png")
    if jpg.exists():
        img = Image.open(jpg).convert("RGBA")
        mask = path.with_name(path.name + "_.png")
        if mask.exists():
            img.putalpha(Image.open(mask).convert("L").resize(img.size))
        return img
    return Image.open(png).convert("RGBA")


def read_xml(path):
    raw = path.read_bytes()
    text = raw.decode("cp1251")
    text = re.sub(r"^<\?xml[^>]*\?>", "", text.lstrip("﻿")).strip()
    return ET.fromstring(text)


def read_multi(path):
    """XML с несколькими корневыми элементами (skills.xml, items.xml): оборачиваем в <r>."""
    text = re.sub(r"^<\?xml[^>]*\?>", "", path.read_bytes().decode("cp1251").lstrip("\ufeff").strip())
    return ET.fromstring(f"<r>{text}</r>")


def pick(el, fields):
    out = {}
    for k, kind in fields.items():
        if k in el.attrib and el.attrib[k] != "":
            v = el.attrib[k]
            out[k] = vec(v) if kind == "vec" else kind(v)
    return out


def ridge_list(el):
    count = int(el.attrib.get("ridges_count", len(el)))
    return [{"position": vec(r.attrib["position"]), "dimensions": vec(r.attrib["dimensions"])}
            for r in list(el)[:count]]


def walk_dialog(nodes):
    for n in nodes:
        yield n
        for a in n.get("answers", []):
            yield from walk_dialog(a["dialog"])


def conditions(el):
    return [{"type": c.tag, **c.attrib} for c in (el if el is not None else [])]


def actions(el):
    return [{"type": a.tag, **a.attrib} for a in (el if el is not None else [])]


def dialog(logic, texts):
    """Узлы диалога: реплики и вопросы. Тексты ru.xml идут по порядку: phrase_1.., question, answer_N."""
    out = []
    phrases = [t for t in (texts if texts is not None else []) if t.tag.startswith("phrase")]
    questions = [t for t in (texts if texts is not None else []) if t.tag == "question"]
    pi = qi = 0
    for node in logic if logic is not None else []:
        if node.tag == "phrase":
            t = phrases[pi].attrib.get("text", "") if pi < len(phrases) else ""
            pi += 1
            out.append({"kind": "phrase", "talker": node.attrib.get("talker", ""), "text": t})
        elif node.tag == "question":
            qt = questions[qi] if qi < len(questions) else None
            qi += 1
            answers_t = [a for a in (qt if qt is not None else []) if a.tag.startswith("answer")]
            answers = []
            for ai, a in enumerate(node.findall("answer")):
                at = answers_t[ai] if ai < len(answers_t) else None
                answers.append({
                    "text": at.attrib.get("text", "") if at is not None else "",
                    "active_if": conditions(a.find("active_if")),
                    "dialog": dialog(a.find("dialog"), at),
                    "actions": actions(a.find("actions")),
                })
            out.append({"kind": "question", "talker": node.attrib.get("talker", ""),
                        "text": qt.attrib.get("text", "") if qt is not None else "", "answers": answers})
    return out


def export_quests(xml_dir, props, ru, n=1):
    logic = read_xml(xml_dir / "locations" / f"location_{n}_quests.xml")
    texts = ru.find(f"quests/location_{n}/quests")
    quests = {}
    for q in logic:
        qt = texts.find(q.tag) if texts is not None else None
        subs = {}
        for sq in q.find("sub_quests"):
            st = qt.find(f"sub_quests/{sq.tag}") if qt is not None else None
            subs[sq.tag] = {
                "holder": sq.attrib.get("holder", ""),
                "header": st.attrib.get("header", "") if st is not None else "",
                "dialog": dialog(sq.find("dialog"), st.find("dialog") if st is not None else None),
                "actions": actions(sq.find("actions")),
            }
        quests[q.tag] = {
            "header": qt.attrib.get("header", "") if qt is not None else "",
            "enabled_sub_quests": [s.strip() for s in q.attrib.get("enabled_sub_quests", "").split(";") if s.strip()],
            "enable_condition": conditions(q.find("enable_condition")),
            "sub_quests": subs,
        }
    # где стоят персонажи в городе (quest_holders первой локации), только те, у кого есть картинка
    used = {sq["holder"] for q in quests.values() for sq in q["sub_quests"].values()}
    locn = next(l for l in props.iter(f"location_{n}") if l.find("quest_holders") is not None)
    holders = {}
    for h in locn.find("quest_holders"):
        if h.tag in used:
            holders[h.tag] = {"position": vec(h.attrib["position"]), "dimensions": vec(h.attrib["dimensions"])}
    return quests, holders


def export_gameplay(props, loc1_props, skills_xml):
    """Уровни опыта, умения (skills.xml), заказы на букеты, прогрессы над растениями, погода."""
    levels = [int(l.attrib["l"]) for l in skills_xml.find("exp_levels")]
    char = skills_xml.find("character")
    limits = {k: float(v) for k, v in char.find("skill_limits").attrib.items()}
    skills = {}
    for sk in char.find("skills"):
        skills[sk.tag] = [{k.tag: float(k.attrib["k"]) for k in lv} for lv in sk]
    events = {}
    for ev in char.find("events"):
        events[ev.tag] = [{"value": int(lv.attrib["value"]), **{k.tag: float(k.attrib["k"]) for k in lv}} for lv in ev]
    bset = loc1_props.find("bouquet_set")
    bouquets = [[x.strip() for x in b.attrib["bouquet"].split(";") if x.strip()] for b in bset]
    prog = props.find("progresses")
    progresses = {c.tag: {"image": c.attrib["image"].rsplit("/", 1)[-1], "max": int(c.attrib["max_hearts"]),
                          "offset": vec(c.attrib["center_offset"])} for c in prog}
    weather = {w.tag: {k: float(v) for k, v in w.attrib.items()} for w in props.find("common/whether")}
    marks = {m.tag: int(m.attrib["day"]) for m in props.find("set_mark_by_day/set")}
    common = props.find("common").attrib
    return {
        "exp_levels": levels, "skill_limits": limits, "skills": skills, "skill_events": events,
        "bouquets": bouquets, "bouquet_price_k": float(common["bouquet_price_k"]),
        "progresses": progresses, "strong_heart": float(prog.attrib["strong_heart"]), "weather": weather,
        "marks_by_day": marks,
    }


# картинка из unfade_img_path → имя в веб-версии (то, что экспортируется в IMAGES)
UNFADE = {
    "data/game/shop/shop_button_small": "shop_small", "data/game/shop/shop_button_medium": "shop_medium",
    "data/tutorial/circle_103": "tut_circle", "data/tutorial/circle_large_smooth": "tut_circle_large",
    "data/tutorial/first_dead_flower": "tut_dead", "data/tutorial/bouquets_shop_busket": "tut_basket",
    "data/tutorial/bouquets_shop_bouquets": "tut_bouquets", "data/obstacles/ridge_00": "ridge",
    "data/obstacles/well_00": "well", "data/buttons/back": "round_button",
    "data/game/global_map/town_1": "map_town_1",
    "data/game/towns/quests/old_servant": "holder_old_servant",
    "data/game/towns/quests/talkers/old_servant": "talker_old_servant",
    "data/game/farms/water_storage/barrel_01": "barrel", "data/game/farms/product_storage/farm_1_storage_1": "box",
}


def export_tutorial(props):
    """Шаги туториала: где пузырь, какая картинка остаётся светлой под затемнением (fader_alpha)."""
    steps = {}
    for el in props.find("tutorial"):
        a = el.attrib
        if "baloon_pos" not in a:
            continue
        path = a.get("unfade_img_path", "").replace("\\", "/")
        steps[el.tag] = {"pos": vec(a["baloon_pos"]), "alpha": float(a.get("fader_alpha", 0.5)),
                         "pointer": not a.get("baloon_base", "").endswith("no_pointer"),
                         "image": UNFADE.get(path), "image_pos": vec(a.get("unfade_img_pos", "0;0"))}
    return steps



def collect_vegetations(seeds, veg_root, prod_root, vegetations, products):
    """Растения посева и те, во что они вырастают, + их продукты (накапливаются в общих словарях)."""
    queue = list(seeds)
    while queue:
        name = queue.pop(0)
        if name in vegetations:
            continue
        el = veg_root.find(name)
        v = pick(el, VEG_FIELDS)
        v["nodes"] = [vec(n.attrib["offset"]) for n in el.find("nodes")]
        v["products"] = [p.attrib["product"] for p in el.find("products")]
        v["probabilities"] = [float(p.attrib.get("probability", 1)) for p in el.find("products")]
        vegetations[name] = v
        nxt = v.get("upgrade_to_vegetation")
        if nxt and veg_root.find(nxt) is not None:
            queue.append(nxt)
    for v in vegetations.values():
        for p in v["products"]:
            if p in products:
                continue
            el = prod_root.find(p)
            inner = el.find(p)
            products[p] = {"price": int(el.attrib["price"]), "exp": int(el.attrib.get("exp", 0)),
                           "offset": vec(inner.attrib["offset"]) if inner is not None else [0, 0],
                           "bonuses": el.attrib.get("bonuses", "")}


def export_waves(props, bug_root, n):
    """Волны вредителей локации n: [{bugs, delay}…] по дням, места появления."""
    locn = next(l for l in props.iter(f"location_{n}") if l.find("bug_arriver") is not None)
    arriver = locn.find("bug_arriver")
    waves = [[{"bugs": [b.strip() for b in g.attrib.get("bugs", "").split(";") if b.strip()], "delay": float(g.attrib["delay"])}
              for g in w] for w in arriver.find("waves")]
    return waves, [vec(v) for v in arriver.find("arrive_positions").attrib.values()]


def bug_def(bug_root, name):
    a = bug_root.find(name).attrib
    return {
        "folder": a["folder"],
        **{k: float(a[k]) for k in ("attack", "click_radius", "obst_radius", "life", "speed", "exp") if k in a},
        "items": a.get("items", ""), "reincorn": a.get("reincorn", ""),
        "anims": {an.tag: {"rows": int(an.attrib["anim_rows"]), "time": float(an.attrib["play_time"]),
                           "loop": an.attrib.get("loop", "true") == "true"} for an in bug_root.find(name).find("anims")},
    }


def shop_positions(props, n):
    """Где у фермы локации n стоят кнопки «Продать плоды», «Купить воду» и колодца (shop_control)."""
    locn = next(l for l in props.iter(f"location_{n}") if l.find("shop_control") is not None)
    c = locn.find("shop_control/click_obj_buttons")
    return {"sell_prod": vec(c.find("product_storage/sell_prod").attrib["position"]),
            "buy_water": vec(c.find("water_storage/buy_water").attrib["position"]),
            "well": vec(c.find("well").attrib["position"])}


def export_location(n, props, xml_dir, items_root, ru, vegetations, products, bugs):
    """Всё, что отличает ферму и город локации n (общие правила остаются в корне rules.json)."""
    farm = read_xml(xml_dir / "locations" / f"location_{n}.xml")
    locn = next(l for l in props.iter(f"location_{n}") if l.find("farm") is not None)
    seeds = [x.strip() for x in farm.find("buy_vegetation_set").attrib["vegetations"].split(";") if x.strip()]
    collect_vegetations(seeds, props.find("vegetations"), props.find("products"), vegetations, products)
    ridges = locn.find("farm/ridges")
    objects = {o.attrib["name"]: {"position": vec(o.attrib["position"]), "dimensions": vec(o.attrib["dimensions"]),
                                  "image_offset": vec(o.attrib.get("image_offset", "0;0"))}
               for o in farm.iter("dynamic_obstacle")}

    def levels(tag):
        # position — где рисуется картинка (level), obstacle — левый верх препятствия объекта (для сетки вредителей), dimensions — его размер
        return [{**objects[lv.attrib["object"]], "object": lv.attrib["object"], "position": vec(lv.attrib["position"]),
                 "obstacle": objects[lv.attrib["object"]]["position"],
                 "capacity": int(lv.attrib["capacity"]), "price": int(lv.attrib["price"]),
                 "progress_height": int(lv.attrib["progress_height"])} for lv in farm.find(tag)]

    well = items_root.find("items/wells/well_00").attrib
    waves, arrive = export_waves(props, props.find("bugs"), n)
    for g in waves:
        for grp in g:
            for b in grp["bugs"]:
                bugs.setdefault(b, bug_def(props.find("bugs"), b))
    for b in list(bugs):
        r = bugs[b]["reincorn"]
        if r:
            bugs.setdefault(r, bug_def(props.find("bugs"), r))
    quests, holders = export_quests(xml_dir, props, ru, n)
    bset = locn.find("bouquet_set")
    return {
        "day_time": float(farm.attrib["time"]),
        "seeds": seeds,
        "ridges": ridge_list(ridges.find("at_start")),
        "ridges_for_sale": ridge_list(ridges.find("not_installed")),
        "water_storage": levels("water_storage"),
        "product_storage": levels("product_storage"),
        "well": {**objects["well_00"], "pail": objects["well_pail_00"],
                 **{k: float(well[k]) for k in ("delay", "fill_time", "water_capacity", "price", "pail_height")}},
        "prices": {"ridge": int(items_root.find(f"items/ridges/location_{n}").attrib["price"]),
                   "water": int(items_root.find("items/water").attrib["price"])},
        "waves": waves,
        "arrive_positions": arrive,
        "bouquets": [[x.strip() for x in b.attrib["bouquet"].split(";") if x.strip()] for b in bset],
        "obstacles": [{"position": vec(o.attrib["position"]), "dimensions": vec(o.attrib["dimensions"])} for o in farm.findall("obstacle")],
        "quests": quests,
        "holders": holders,
        "shop_positions": shop_positions(props, n),
    }


def export_audio(data_dir, web):
    """Звуки и музыка как есть (ogg/wav). Файлы по 50 байт в этой установке пустые, их пропускаем."""
    out = web / "public" / "audio"
    out.mkdir(parents=True, exist_ok=True)
    names = []
    for folder, prefix in (("sounds", ""), ("sounds/buttons", "btn_"), ("music", "")):
        for f in sorted((data_dir / folder).iterdir()):
            if f.suffix in (".ogg", ".wav") and f.stat().st_size > 100:
                (out / f"{prefix}{f.name}").write_bytes(f.read_bytes())
                names.append(f"{prefix}{f.name}")
    return names


def main():
    game, web = Path(sys.argv[1]), Path(sys.argv[2])
    data_dir, xml_dir = game / "data", game / "xml"
    props = read_xml(xml_dir / "properties_ru.xml")
    farm = read_xml(xml_dir / "locations" / "location_1.xml")
    items = read_xml(xml_dir / "locations" / "items.xml") if False else None  # два корня — читаем вручную ниже
    ru = read_xml(xml_dir / "ru" / "ru.xml")

    # ---------------- растения первой локации и их продукты
    seeds = [s.strip() for s in farm.find("buy_vegetation_set").attrib["vegetations"].split(";") if s.strip()]
    veg_root = props.find("vegetations")
    vegetations, products = {}, {}
    queue = list(seeds)
    while queue:
        name = queue.pop(0)
        if name in vegetations:
            continue
        el = veg_root.find(name)
        v = pick(el, VEG_FIELDS)
        v["nodes"] = [vec(n.attrib["offset"]) for n in el.find("nodes")]
        v["products"] = [p.attrib["product"] for p in el.find("products")]
        v["probabilities"] = [float(p.attrib.get("probability", 1)) for p in el.find("products")]
        vegetations[name] = v
        nxt = v.get("upgrade_to_vegetation")
        if nxt and veg_root.find(nxt) is not None:
            queue.append(nxt)
    prod_root = props.find("products")
    for v in vegetations.values():
        for p in v["products"]:
            el = prod_root.find(p)
            inner = el.find(p)
            products[p] = {"price": int(el.attrib["price"]), "exp": int(el.attrib.get("exp", 0)),
                           "offset": vec(inner.attrib["offset"]) if inner is not None else [0, 0]}

    # ---------------- ферма: лунки, бочки, ящики, колодец, длина дня
    loc1 = next(l for l in props.iter("location_1") if l.find("farm") is not None)
    ridges = loc1.find("farm/ridges")
    objects = {o.attrib["name"]: {"position": vec(o.attrib["position"]), "dimensions": vec(o.attrib["dimensions"]),
                                  "image_offset": vec(o.attrib.get("image_offset", "0;0"))}
               for o in farm.iter("dynamic_obstacle")}

    def levels(tag):
        # position — где рисуется картинка (level), obstacle — левый верх препятствия объекта (для сетки вредителей), dimensions — его размер
        return [{**objects[lv.attrib["object"]], "object": lv.attrib["object"], "position": vec(lv.attrib["position"]),
                 "obstacle": objects[lv.attrib["object"]]["position"],
                 "capacity": int(lv.attrib["capacity"]), "price": int(lv.attrib["price"]),
                 "progress_height": int(lv.attrib["progress_height"])} for lv in farm.find(tag)]

    items_text = (xml_dir / "locations" / "items.xml").read_bytes().decode("cp1251")
    items_root = ET.fromstring("<r>" + re.sub(r"^<\?xml[^>]*\?>", "", items_text.strip()) + "</r>")
    well = items_root.find("items/wells/well_00").attrib
    common = props.find("common").attrib
    rules = {
        "start": {"gold": int(common["gold_at_start"]), "water": int(common["water_at_start"]),
                  "vegetations": [common["vegetations_at_start"]]},
        "day_time": float(farm.attrib["time"]),
        "seeds": seeds,
        "vegetations": vegetations,
        "products": products,
        "ridges": ridge_list(ridges.find("at_start")),
        "ridges_for_sale": ridge_list(ridges.find("not_installed")),
        "obstacles": [{"position": vec(o.attrib["position"]), "dimensions": vec(o.attrib["dimensions"])} for o in farm.findall("obstacle")],
        "water_storage": levels("water_storage"),
        "product_storage": levels("product_storage"),
        "well": {**objects["well_00"], "pail": objects["well_pail_00"],
                 **{k: float(well[k]) for k in ("delay", "fill_time", "water_capacity", "price", "pail_height")}},
        "prices": {"ridge": int(items_root.find("items/ridges/location_1").attrib["price"]),
                   "water": int(items_root.find("items/water").attrib["price"])},
    }

    # ---------------- русские строки
    shop = ru.find("shop_screen_farm")
    rules["texts"] = {
        "title": ru.find("app").attrib["title"],
        "names": dict(ru.find("item_names").attrib),
        "stats": dict(ru.find("stats").attrib),
        "warnings": dict(ru.find("farm_warning").attrib),
        "events": dict(ru.find("events").attrib),
        "shop": {c.tag: c.attrib.get("text", "") for c in shop if "text" in c.attrib},
        "desc": dict(shop.find("desc").attrib),
        "buttons": {c.tag: c.attrib.get("label", "") for c in ru.find("button") if "label" in c.attrib},
        "shop_buttons": {c.tag: c.attrib.get("label", "") for c in ru.find("button/shop")},
        "buy_water": dict(ru.find("buy_water").attrib),
        "new_game": dict(ru.find("new_or_continue_game").attrib),
        "skill_names": dict(ru.find("skill_names").attrib),
        "skill_characteristics": dict(ru.find("skill_characteristic_names").attrib),
        "skill_desc": dict(ru.find("level_desc").attrib),
        "skill_up": dict(ru.find("skill_up").attrib),
        "bonus_events": dict(ru.find("bonus_events").attrib),
        "bouquets_screen": dict(ru.find("bouquets_screen").attrib),
        "tutorial": dict(ru.find("tutorial").attrib),
        "headers": dict(ru.find("headers").attrib),
        "options": dict(ru.find("options").attrib),
        "game_menu": {c.tag: c.attrib.get("label", "") for c in ru.find("button") if c.tag.startswith("game_menu")},
        "pause": dict(ru.find("pause").attrib),
        "highscores": dict(ru.find("highscores").attrib),
    }

    # ---------------- квесты первой локации: логика + тексты, связанные по порядку реплик
    quests, holders = export_quests(xml_dir, props, ru)
    rules["quests"] = quests
    rules["tutorial_steps"] = export_tutorial(props)
    rules["holders"] = holders
    rules["texts"]["characters"] = dict(ru.find("characters").attrib)
    rules["texts"]["global_map"] = dict(ru.find("global_map").attrib)
    rules["texts"]["buttons_menu"] = {k: rules["texts"]["buttons"].get(k, "") for k in
                                      ("game_adventure", "options", "menu_highscores", "menu_exit", "new_game", "continue_game")}

    # ---------------- вредители первой фермы, помощник Робин, оружие
    loc1 = next(l for l in props.iter("location_1") if l.find("bug_arriver") is not None)
    arriver = loc1.find("bug_arriver")
    waves = [[{"bugs": [b for b in g.attrib.get("bugs", "").split(";") if b.strip()], "delay": float(g.attrib["delay"])}
              for g in w] for w in arriver.find("waves")]
    used = {b for w in waves for g in w for b in g["bugs"]}
    bug_root = props.find("bugs")
    for b in list(used):  # то, во что превращаются (reincorn), тоже нужно
        r = bug_root.find(b).attrib.get("reincorn", "")
        if r:
            used.add(r)
    bugs = {}
    for name in sorted(used) + ["helper"]:
        el = bug_root.find(name)
        a = el.attrib
        bugs[name] = {
            "folder": a["folder"],
            **{k: float(a[k]) for k in ("attack", "click_radius", "obst_radius", "life", "speed", "exp") if k in a},
            "items": a.get("items", ""), "reincorn": a.get("reincorn", ""),
            "anims": {an.tag: {"rows": int(an.attrib["anim_rows"]), "time": float(an.attrib["play_time"]),
                               "loop": an.attrib.get("loop", "true") == "true"} for an in el.find("anims")},
        }
    rules["bugs"] = bugs
    rules["waves"] = waves
    rules["arrive_positions"] = [vec(v) for v in arriver.find("arrive_positions").attrib.values()]
    rules["helper"] = {k: (vec(v) if ";" in v else float(v)) for k, v in props.find("common/helper").attrib.items()}
    rules["weapon_attack"] = float(items_root.find("weapons/simple_sword").attrib["attack"])
    rules["texts"]["bug_names"] = dict(ru.find("bug_names").attrib)
    # в оригинале подсказка про цветочный магазин оставлена с английскими «sell» / «sell all» — подставляем подписи самих кнопок (без кавычек: в растровом шрифте нет « »)
    # кнопка и пункт магазина продают цветы — подпись «Продать Цветы» вместо «Продать Плоды»
    rules["texts"]["buttons"]["shop_button_sell_prod"] = rules["texts"]["buttons"]["shop_button_sell_prod"].replace("Плоды", "Цветы")
    rules["texts"]["shop"]["sell_products"] = rules["texts"]["shop"]["sell_products"].replace("плоды", "цветы")
    sb = rules["texts"]["shop_buttons"]
    tut = rules["texts"]["tutorial"]
    tut["bouquet_show_sell_button"] = (tut["bouquet_show_sell_button"]
                                       .replace("кнопку sell all", f"кнопку {sb['sell_all']}")
                                       .replace("кнопку sell", f"кнопку {sb['sell']}"))

    # ---------------- остальные локации (2–4): ферма, город, квесты; растения/продукты/вредители пополняют общие словари
    rules["shop_positions"] = shop_positions(props, 1)
    rules["locations"] = {}
    for n in (2, 3, 4):
        rules["locations"][str(n)] = export_location(n, props, xml_dir, items_root, ru, vegetations, products, bugs)
    rules["vegetations"], rules["products"], rules["bugs"] = vegetations, products, bugs
    rules["global_map"] = {c.tag: {"position": vec(c.attrib["position"]), "dimensions": vec(c.attrib["dimensions"]),
                                    "image": c.attrib.get("active_image", "")}
                           for c in props.find("global_map") if "position" in c.attrib}

    # ---------------- опыт, умения, букеты, прогрессы, погода
    rules.update(export_gameplay(props, loc1_props=next(l for l in props.iter("location_1") if l.find("bouquet_set") is not None),
                                 skills_xml=read_multi(xml_dir / "locations" / "skills.xml")))

    # ---------------- картинки
    out_img = web / "public" / "img"
    out_img.mkdir(parents=True, exist_ok=True)
    names = dict(IMAGES)
    for v in vegetations:
        names[v] = f"vegetations/{v}"
    for p in products:
        names[p] = f"products/{p}"
    all_quests = [quests] + [loc["quests"] for loc in rules["locations"].values()]
    for h in set(holders).union(*(set(loc["holders"]) for loc in rules["locations"].values())):
        if (data_dir / f"game/towns/quests/{h}.jpg").exists():
            names[f"holder_{h}"] = f"game/towns/quests/{h}"
    for n in range(1, 5):
        names[f"farm_bg_{n}"] = f"game/farms/location_{n}"
        names[f"town_bg_{n}"] = f"game/towns/location_{n}"
        names[f"box_{n}"] = f"game/farms/product_storage/farm_{n}_storage_1"
        names[f"box_content_{n}"] = f"game/farms/product_storage/farm_{n}_content_1"
        names[f"box_mask_{n}"] = f"game/farms/product_storage/farm_{n}_mask_1"
    for k in ("global_map_back", "ship", "pirate_ship", "broken_ship"):
        names[k] = f"game/global_map/{k}"
    for n in range(1, 5):
        names[f"map_town_{n}"] = f"game/global_map/town_{n}"
        names[f"map_farm_{n}"] = f"game/global_map/farm_{n}"
    talkers = {n["talker"] for qs in all_quests for q in qs.values() for sq in q["sub_quests"].values() for n in walk_dialog(sq["dialog"])}
    for tk in sorted(talkers):
        if (data_dir / f"game/towns/quests/talkers/{tk}.jpg").exists():
            names[f"talker_{tk}"] = f"game/towns/quests/talkers/{tk}"
    for bug in bugs.values():
        folder = data_dir / "bugs" / bug["folder"]
        for anim in bug["anims"]:
            for d in DIRECTIONS:
                if (folder / anim / f"{d}.jpg").exists():
                    names[f"bug_{bug['folder']}_{anim}_{d}"] = f"bugs/{bug['folder']}/{anim}/{d}"
    for item in {b["items"] for b in bugs.values() if b["items"]}:
        names[f"item_{item}"] = f"quest_items/{item}"
    for icon in ("attack_icon", "pour_icon", "product_icon"):
        names[f"helper_{icon}"] = f"bugs/helper/{icon}"
    for name, src in names.items():
        img = load_image(data_dir / src)
        img.save(out_img / f"{name}.webp", lossless=True)
    # комикс без нарисованной «лужи» кнопки (кадр с фермой, пока кнопка не появилась)
    subprocess.run([sys.executable, str(Path(__file__).with_name("make_comics_clean.py")),
                    str(out_img / "comics.webp"), str(out_img / "comics_clean.webp")], check=True)
    rules["images"] = sorted([*names, "comics_clean"])
    rules["audio"] = export_audio(data_dir, web)
    # таблица рекордов по умолчанию: файл объявлен как windows-1251, но записан в cp866
    scores = (xml_dir / "ru" / "default_scores_ru.xml").read_bytes().decode("cp866")
    rules["default_scores"] = [{"name": n, "days": int(d), "money": int(m)}
                               for n, d, m in re.findall(r'<place name="([^"]*)" days="(\d+)" money="(\d+)"', scores)]
    out = web / "public" / "data" / "rules.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rules, ensure_ascii=False, indent=1))
    print(f"картинок: {len(names)}, растений: {len(vegetations)}, продуктов: {len(products)}")
    print(json.dumps({k: rules[k] for k in ("start", "day_time", "seeds", "prices", "water_storage", "product_storage", "well")}, ensure_ascii=False)[:1800])


if __name__ == "__main__":
    main()
