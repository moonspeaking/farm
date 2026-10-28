// Падежи названий для уведомлений об особых умениях: в XML оригинала стоят шаблоны с именительным падежом в кавычках.

/** Растение (семейство плодов) в родительном падеже. */
const PLANT_GENITIVE: Record<string, string> = {
  romashka: "Ромашки",
  rose: "Розы",
  tree: "Денежного дерева",
  cactus: "Кактуса",
  nopal: "Мексиканского Кактуса",
  fern: "Папоротника",
  fire: "Огонька",
  heart: "Цветка Сердце",
  klubnika: "Куста Клубники",
  pineapple: "Ананаса",
  tiger: "Тигроцвета",
  bell: "Колокольчика",
};

/** Вредитель (папка спрайтов) в родительном падеже: «против улитки». */
const BUG_GENITIVE: Record<string, string> = {
  snail: "улитки",
  pchela: "осы",
  kloun: "колорадского жука",
  etti: "етти",
  krab: "краба",
  spirit: "призрака",
  gusenica: "гусеницы",
  bug: "жука-рогача",
  big_bug: "большого жука",
};

export const productivityRaised = (family: string, fallback: string) => `Продуктивность ${PLANT_GENITIVE[family] ?? fallback} увеличена`;
export const efficiencyRaised = (bug: string, fallback: string) => `Эффективность против ${BUG_GENITIVE[bug] ?? fallback.toLowerCase()} повышена`;
