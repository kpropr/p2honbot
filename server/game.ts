import {
  businesses,
  gifts,
  hens,
  price,
  stories,
  thresholds,
  upgrades,
} from "../shared/catalog.js";
export type State = {
  balance: number;
  earned: number;
  energy: number;
  updated: number;
  upgrades: Record<string, number>;
  businesses: Record<string, number>;
  partner: string | null;
  relations: Record<string, { affection: number; dates: number; step: number }>;
  clickTokens: number;
  clickTime: number;
};
export const initial = (now = Date.now()): State => ({
  balance: 0,
  earned: 0,
  energy: 500,
  updated: now,
  upgrades: {},
  businesses: {},
  partner: null,
  relations: Object.fromEntries(
    hens.map((h) => [h.id, { affection: 0, dates: 0, step: 0 }]),
  ),
  clickTokens: 10,
  clickTime: now,
});
export const stats = (s: State) => ({
  power: 1 + (s.upgrades.power || 0),
  capacity: 500 + 100 * (s.upgrades.capacity || 0),
  regen: 1 + (s.upgrades.regen || 0),
  income:
    businesses.reduce((n, b) => n + (s.businesses[b.id] || 0) * b.income, 0) *
    (1 + (s.partner ? s.relations[s.partner].dates * 0.02 : 0)),
});
export function settle(s: State, now = Date.now()) {
  const elapsed = Math.max(0, now - s.updated) / 1000;
  const st = stats(s);
  const income = (Math.min(elapsed, 28800) * st.income) / 3600;
  s.balance += income;
  s.earned += income;
  s.energy = Math.min(st.capacity, s.energy + elapsed * st.regen);
  s.updated = Math.max(s.updated, now);
  s.clickTokens = Math.min(
    10,
    s.clickTokens + Math.max(0, now - s.clickTime) / 100,
  );
  s.clickTime = Math.max(now, s.clickTime);
  return income;
}
export class GameError extends Error {}
const need = (ok: unknown, message: string) => {
  if (!ok) throw new GameError(message);
};
function spend(s: State, n: number) {
  need(s.balance >= n, "Не хватает зерна");
  s.balance -= n;
}
export type Action = {
  kind: "click" | "upgrade" | "business" | "gift" | "partner" | "date";
  id?: string;
  count?: number;
  gift?: string;
  date?: number;
  step?: number;
  choice?: number;
};
export function act(
  s: State,
  a: Action,
  now = Date.now(),
): { message?: string; accepted?: number } {
  settle(s, now);
  if (a.kind === "click") {
    const count = a.count ?? 0;
    need(
      Number.isInteger(count) && count > 0 && count <= 10,
      "Некорректное число кликов",
    );
    const accepted = Math.min(
      count,
      Math.floor(s.energy),
      Math.floor(s.clickTokens),
    );
    s.energy -= accepted;
    s.clickTokens -= accepted;
    const reward = accepted * stats(s).power;
    s.balance += reward;
    s.earned += reward;
    return { accepted };
  }
  if (a.kind === "upgrade") {
    const item = upgrades.find((i) => i.id === a.id);
    need(item, "Неизвестное улучшение");
    const level = s.upgrades[item!.id] || 0;
    need(level < item!.max, "Максимальный уровень");
    spend(s, price(item!.base, level));
    s.upgrades[item!.id] = level + 1;
    return {};
  }
  if (a.kind === "business") {
    const item = businesses.find((i) => i.id === a.id);
    need(item, "Неизвестный бизнес");
    const level = s.businesses[item!.id] || 0;
    need(level < 50, "Максимальный уровень");
    spend(s, price(item!.base, level, 1.18));
    s.businesses[item!.id] = level + 1;
    return {};
  }
  const hen = hens.find((h) => h.id === a.id);
  need(hen, "Неизвестная курочка");
  const r = s.relations[hen!.id];
  if (a.kind === "partner") {
    s.partner = hen!.id;
    return {};
  }
  if (a.kind === "gift") {
    const gift = gifts.find((g) => g.id === a.gift);
    need(gift, "Неизвестный подарок");
    spend(s, gift!.price);
    r.affection += gift!.affection;
    return { message: `${hen!.name}: «Спасибо! Мне очень приятно»` };
  }
  need(s.partner === hen!.id, "Сначала выбери пару");
  need(r.dates < 5, "Все свидания пройдены");
  need(r.affection >= thresholds[r.dates], "Нужно больше симпатии");
  need(a.date === r.dates && a.step === r.step, "Сцена уже изменилась");
  const chapter = stories[hen!.id][r.dates];
  const choice = chapter[r.step].choices[a.choice ?? -1];
  need(choice, "Выбери ответ");
  r.affection += choice.points;
  r.step++;
  if (r.step === chapter.length) {
    r.dates++;
    r.step = 0;
  }
  return { message: choice.reply };
}
export function view(s: State) {
  return {
    ...s,
    stats: stats(s),
    balance: Math.floor(s.balance),
    earned: Math.floor(s.earned),
    energy: Math.floor(s.energy),
  };
}
