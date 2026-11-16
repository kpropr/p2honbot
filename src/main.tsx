import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  businesses,
  gifts,
  hens,
  price,
  stories,
  thresholds,
  upgrades,
} from "../shared/catalog";
import type { State, Action } from "../server/game";
import "./style.css";
type Game = State & {
  stats: { power: number; capacity: number; regen: number; income: number };
};
type Row = { id: string; name: string; earned: string; rank: number };
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        ready: () => void;
        expand: () => void;
        setHeaderColor: (c: string) => void;
        setBackgroundColor: (c: string) => void;
        HapticFeedback?: { impactOccurred: (s: string) => void };
      };
    };
  }
}
const tg = window.Telegram?.WebApp;
const fmt = (n: number | string) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(
    Number(n),
  );
async function api(path: string, body?: unknown) {
  const response = await fetch("/play/api/" + path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(
      result.error || "Не удалось связаться с сервером",
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return result;
}
function Rooster({
  small = false,
  hen = false,
}: {
  small?: boolean;
  hen?: boolean;
}) {
  return (
    <svg
      className={small ? "bird small" : "bird"}
      viewBox="0 0 320 310"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={hen ? "hen" : "body"} x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#fff6cc" />
          <stop offset="1" stopColor={hen ? "#e9bb92" : "#f3c46b"} />
        </linearGradient>
      </defs>
      <ellipse cx="162" cy="282" rx="84" ry="12" fill="#0d1510" opacity=".18" />
      {!hen && (
        <g stroke="#283d30" strokeWidth="3">
          <path d="M106 196Q20 172 30 89Q80 85 119 166" fill="#245849" />
          <path d="M104 196Q14 143 57 62Q103 80 127 161" fill="#377763" />
          <path d="M108 198Q52 128 91 55Q133 91 138 170" fill="#70a58a" />
          <path d="M105 190Q35 167 22 131Q60 112 108 168" fill="#e19143" />
        </g>
      )}
      <path
        d="M139 247L132 274M188 249L194 274M115 276L134 270L150 278M176 278L194 271L212 277"
        stroke="#e3a039"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M90 182Q102 143 151 138L161 92Q172 61 209 66Q249 74 237 124L228 157Q263 207 225 245Q187 274 136 250Q84 234 90 182Z"
        fill={`url(#${hen ? "hen" : "body"})`}
        stroke="#624832"
        strokeWidth="3"
      />
      <path
        d="M164 76Q145 49 159 37Q172 30 181 52Q174 13 194 17Q207 17 204 51Q218 20 230 35Q240 53 219 74"
        fill="#ef5b49"
        stroke="#9e3b30"
        strokeWidth="3"
      />
      <path
        d="M234 97L270 112L236 125"
        fill="#efa52e"
        stroke="#926027"
        strokeWidth="3"
      />
      <path d="M232 124Q257 148 239 158Q219 157 223 133" fill="#e64f43" />
      <ellipse cx="211" cy="98" rx="9" ry="12" fill="#fff" />
      <ellipse cx="214" cy="100" rx="4" ry="6" fill="#202a24" />
      <path
        d="M198 81Q209 75 219 82"
        stroke="#654731"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M136 162Q102 197 146 222Q186 233 201 184Q175 197 155 177"
        fill={hen ? "#e6b28a" : "#df9c4c"}
        stroke="#ba813c"
        strokeWidth="3"
      />
      <path
        d="M161 106L153 141L168 136L172 151L185 136L194 147L205 130"
        fill="#fff2cb"
      />
      <ellipse cx="224" cy="117" rx="9" ry="5" fill="#ef9b70" opacity=".65" />
    </svg>
  );
}
function App() {
  const [game, setGame] = useState<Game | null>(null);
  const [name, setName] = useState("");
  const [tab, setTab] = useState("home");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [hen, setHen] = useState("tsypa");
  const [ranking, setRanking] = useState<{
    players: Row[];
    me: Row | null;
  } | null>(null);
  const [rankError, setRankError] = useState("");
  const [pops, setPops] = useState<{ id: number; x: number; y: number }[]>([]);
  const pending = useRef(0);
  const inFlight = useRef(false);
  const uncertain = useRef<any>(null);
  const current = useRef<Game | null>(null);
  const lastTap = useRef(0);
  const ready = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function announce(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4500);
  }
  function accept(s: Game) {
    current.current = s;
    setGame(s);
  }
  async function load() {
    setLoading(true);
    setError("");
    try {
      if (!tg?.initData) {
        setError(
          "Открой PETUHON EMPIRE через кнопку «Играть» в Telegram-боте. Здесь начинается твоя империя.",
        );
        return;
      }
      await api("auth", { initData: tg.initData });
      const result = await api("state");
      setName(result.name);
      accept(result.state);
      ready.current = true;
      setConnected(true);
      if (result.offline)
        announce(
          `Пока тебя не было, бизнесы заработали ${fmt(result.offline)} 🌾`,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function send(payload: any) {
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await api("action", payload);
      uncertain.current = null;
      accept(r.state);
      setConnected(true);
      if (r.message) announce(r.message);
      return true;
    } catch (e) {
      const status = (e as any).status;
      if (!status || status >= 500 || status === 429) {
        uncertain.current = payload;
        setConnected(false);
        announce("Нет подтверждения сервера. Восстанавливаем связь…");
      } else {
        uncertain.current = null;
        announce((e as Error).message);
        try {
          accept((await api("state")).state);
        } catch {
          setConnected(false);
        }
      }
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  async function flush() {
    if (inFlight.current) return false;
    if (uncertain.current) return send(uncertain.current);
    if (!pending.current) return true;
    const count = pending.current;
    pending.current = 0;
    return send({
      kind: "click",
      count,
      operationId: crypto.randomUUID(),
      issuedAt: current.current!.updated,
    });
  }
  async function action(a: Action) {
    if (inFlight.current || !connected) return;
    if (!(await flush())) return;
    if (inFlight.current) return;
    await send({
      ...a,
      operationId: crypto.randomUUID(),
      issuedAt: current.current!.updated,
    });
  }
  useEffect(() => {
    tg?.ready();
    tg?.expand();
    tg?.setHeaderColor("#171e19");
    tg?.setBackgroundColor("#f7f3e9");
    void load();
    const timer = setInterval(() => {
      if (ready.current) void flush();
    }, 1000);
    const sync = setInterval(async () => {
      if (
        !ready.current ||
        inFlight.current ||
        pending.current ||
        uncertain.current
      )
        return;
      inFlight.current = true;
      try {
        accept((await api("state")).state);
        setConnected(true);
      } catch {
        setConnected(false);
      } finally {
        inFlight.current = false;
      }
    }, 10000);
    const wake = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearInterval(timer);
      clearInterval(sync);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  useEffect(() => {
    if (tab !== "top" || !game) return;
    let active = true;
    const refresh = async () => {
      try {
        const r = await api("leaderboard");
        if (active) {
          setRanking(r);
          setRankError("");
        }
      } catch (e) {
        if (active) setRankError((e as Error).message);
      }
    };
    void refresh();
    const interval = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [tab, !!game]);
  function tap(e: React.PointerEvent<HTMLButtonElement>) {
    const s = current.current;
    if (
      !s ||
      !connected ||
      inFlight.current ||
      pending.current >= 10 ||
      s.energy <= pending.current ||
      Date.now() - lastTap.current < 100
    )
      return;
    lastTap.current = Date.now();
    pending.current++;
    setGame({
      ...s,
      balance: s.balance + pending.current * s.stats.power,
      energy: s.energy - pending.current,
    });
    tg?.HapticFeedback?.impactOccurred("light");
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setPops((p) => [
      ...p,
      { id, x: e.clientX - rect.left, y: e.clientY - rect.top },
    ]);
    setTimeout(() => setPops((p) => p.filter((i) => i.id !== id)), 850);
  }
  const nav = [
    ["home", "◉", "Петух"],
    ["upgrades", "ϟ", "Бусты"],
    ["business", "▥", "Бизнес"],
    ["hens", "♡", "Курочки"],
    ["top", "♛", "Топ"],
  ];
  return (
    <div className="shell">
      <header>
        <a className="brand" href="/play/">
          <span className="brand-mark">
            P<span>👑</span>
          </span>
          <span>
            PETUHON<small>EMPIRE</small>
          </span>
        </a>
        <div className="season">
          <span /> ЗЕРНО РЕШАЕТ
        </div>
      </header>
      {!game ? (
        <main className="welcome">
          <span className="eyebrow">ТВОЯ БОЛЬШАЯ ИСТОРИЯ</span>
          <h1>
            Из курятника.
            <br />
            <em>В империю.</em>
          </h1>
          <div className="welcome-bird">
            <Rooster />
          </div>
          <h2>{loading ? "Открываем ворота…" : "Империя ждёт тебя"}</h2>
          <p>{error || "Загружаем твой прогресс"}</p>
          {!loading && tg?.initData && (
            <button className="primary" onClick={() => void load()}>
              Попробовать ещё раз
            </button>
          )}
          <div className="welcome-features">
            <span>🌾 Кликай</span>
            <span>🏛️ Строй</span>
            <span>♡ Влюбляйся</span>
          </div>
        </main>
      ) : (
        <>
          <section className="wallet">
            <div>
              <span className="eyebrow">ТВОЯ КАЗНА</span>
              <div className="balance">
                <span>🌾</span> {fmt(game.balance)}
              </div>
            </div>
            <div className="income">
              <span className="live-dot" /> ИМПЕРИЯ РАБОТАЕТ
              <strong>
                +{fmt(game.stats.income)} <small>/ час</small>
              </strong>
            </div>
          </section>
          <div className={"connection " + (!connected ? "offline" : "")}>
            {!connected
              ? "● Нет связи · действия приостановлены"
              : busy || pending.current
                ? "◌ Сохраняем прогресс…"
                : "✓ Прогресс сохранён"}
          </div>
          <main>
            {tab === "home" && (
              <>
                <div className="title-row">
                  <div>
                    <span className="eyebrow">
                      ЗДОРОВО, {name.toLocaleUpperCase("ru-RU")}
                    </span>
                    <h1>
                      Большому петуху —<br />
                      <em>большую империю.</em>
                    </h1>
                  </div>
                  <span className="stamp">
                    100%
                    <br />
                    ПЕТУХ
                  </span>
                </div>
                <section className="coop">
                  <div className="coop-top">
                    <span>✦ ГЛАВНЫЙ ПО ЗЁРНАМ</span>
                    <span className="power">+{game.stats.power} 🌾 / тап</span>
                  </div>
                  <div className="sun" />
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <span className="grain grain-one">✦</span>
                  <span className="grain grain-two">✦</span>
                  <button
                    className="rooster-button"
                    disabled={!connected || game.energy <= 0}
                    onPointerDown={tap}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        const r = e.currentTarget.getBoundingClientRect();
                        tap({
                          currentTarget: e.currentTarget,
                          clientX: r.left + r.width / 2,
                          clientY: r.top + r.height / 2,
                        } as any);
                      }
                    }}
                    aria-label="Кликнуть по петуху и заработать зерно"
                  >
                    <Rooster />
                    {pops.map((p) => (
                      <span
                        className="pop"
                        key={p.id}
                        style={{ left: p.x, top: p.y }}
                      >
                        +{game.stats.power} 🌾
                      </span>
                    ))}
                  </button>
                  <p className="tap-hint">
                    {game.energy > 0
                      ? "ТАПАЙ ПО ПЕТУХУ. РАСТИ КАК БОСС."
                      : "ЭНЕРГИЯ ВОССТАНАВЛИВАЕТСЯ"}
                  </p>
                  <div className="energy">
                    <div>
                      <strong>ϟ Энергия</strong>
                      <span>
                        {fmt(game.energy)} <i>/ {fmt(game.stats.capacity)}</i>
                      </span>
                    </div>
                    <progress value={game.energy} max={game.stats.capacity} />
                    <small>
                      +{game.stats.regen} в секунду · даже когда отдыхаешь
                    </small>
                  </div>
                </section>
                <div className="quick-grid">
                  <button onClick={() => setTab("business")}>
                    <span>🏡</span>
                    <strong>
                      Деньги спят?
                      <br />
                      Твои — нет.
                    </strong>
                    <small>Открыть бизнес →</small>
                  </button>
                  <button className="pink" onClick={() => setTab("hens")}>
                    <span>💌</span>
                    <strong>
                      Империя лучше,
                      <br />
                      когда вы вдвоём.
                    </strong>
                    <small>Знакомиться →</small>
                  </button>
                </div>
                <p className="footnote">Маленький клюв. Большие амбиции.</p>
              </>
            )}
            {tab === "upgrades" && (
              <>
                <Section
                  eyebrow="ЭВОЛЮЦИЯ ПЕТУХА"
                  title="Ещё сильнее."
                  text="Вкладывай в себя. Каждое зёрнышко вернётся."
                />
                {upgrades.map((u) => {
                  const level = game.upgrades[u.id] || 0;
                  const cost = price(u.base, level);
                  return (
                    <article className="shop-card" key={u.id}>
                      <span className="item-icon">{u.emoji}</span>
                      <div className="item-body">
                        <small>
                          УЛУЧШЕНИЕ · {level}/{u.max}
                        </small>
                        <h3>{u.name}</h3>
                        <p>{u.description}</p>
                        <div className="level-bar">
                          <span
                            style={{ width: (level / u.max) * 100 + "%" }}
                          />
                        </div>
                        <button
                          disabled={
                            busy ||
                            !connected ||
                            level >= u.max ||
                            game.balance < cost
                          }
                          onClick={() =>
                            void action({ kind: "upgrade", id: u.id })
                          }
                        >
                          {level >= u.max
                            ? "Максимальный уровень"
                            : `${fmt(cost)} 🌾`}{" "}
                          <span>Улучшить ↗</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </>
            )}
            {tab === "business" && (
              <>
                <Section
                  eyebrow="ЗЕРНО ДЕЛАЕТ ЗЕРНО"
                  title="Твой большой бизнес."
                  text="Работают, пока ты отдыхаешь. До 8 часов офлайн."
                />
                <div className="summary">
                  <span>Доход твоей империи</span>
                  <strong>+{fmt(game.stats.income)} 🌾 / час</strong>
                </div>
                {businesses.map((b) => {
                  const level = game.businesses[b.id] || 0;
                  const cost = price(b.base, level, 1.18);
                  return (
                    <article className="shop-card" key={b.id}>
                      <span className="item-icon">{b.emoji}</span>
                      <div className="item-body">
                        <small>
                          {level ? "УРОВЕНЬ " + level : "НОВАЯ ВОЗМОЖНОСТЬ"}
                        </small>
                        <h3>{b.name}</h3>
                        <p>{b.description}</p>
                        <div className="business-stat">
                          +{fmt(b.income)} 🌾 / час за уровень
                        </div>
                        <button
                          disabled={
                            busy ||
                            !connected ||
                            level >= 50 ||
                            game.balance < cost
                          }
                          onClick={() =>
                            void action({ kind: "business", id: b.id })
                          }
                        >
                          {level >= 50
                            ? "Максимальный уровень"
                            : `${fmt(cost)} 🌾`}
                          <span>{level ? "Расширить" : "Купить"} ↗</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </>
            )}
            {tab === "hens" && (
              <>
                <Section
                  eyebrow="ДЕЛА СЕРДЕЧНЫЕ"
                  title="Не зерном единым."
                  text="Три истории. Одна особенная курочка."
                />
                <div className="hen-tabs">
                  {hens.map((h) => (
                    <button
                      className={hen === h.id ? "selected" : ""}
                      onClick={() => setHen(h.id)}
                      key={h.id}
                    >
                      {h.emoji} {h.name}
                      {game.partner === h.id ? " ♡" : ""}
                    </button>
                  ))}
                </div>
                {hens
                  .filter((h) => h.id === hen)
                  .map((h) => {
                    const r = game.relations[h.id];
                    const scene =
                      r.dates < 5 ? stories[h.id][r.dates][r.step] : null;
                    return (
                      <div key={h.id}>
                        <section
                          className="hen-profile"
                          style={{ background: h.color }}
                        >
                          <div>
                            <small>{h.title}</small>
                            <h2>{h.name}</h2>
                            <p>{h.description}</p>
                            <span className="affection">
                              ♡ {r.affection} симпатии
                            </span>
                          </div>
                          <Rooster small hen />
                        </section>
                        <div className="relationship-stats">
                          <span>{r.dates}/5 свиданий</span>
                          <span>Бонус к бизнесам: +{r.dates * 2}%</span>
                        </div>
                        {game.partner !== h.id ? (
                          <button
                            className="primary full"
                            disabled={busy || !connected}
                            onClick={() =>
                              void action({ kind: "partner", id: h.id })
                            }
                          >
                            ♡ Выбрать пару
                          </button>
                        ) : (
                          <div className="paired">
                            ♡ Вы вместе · бонус активен
                          </div>
                        )}
                        <h3 className="subheading">Маленькие знаки внимания</h3>
                        <div className="gifts">
                          {gifts.map((g) => (
                            <button
                              key={g.id}
                              disabled={
                                busy || !connected || game.balance < g.price
                              }
                              onClick={() =>
                                void action({
                                  kind: "gift",
                                  id: h.id,
                                  gift: g.id,
                                })
                              }
                            >
                              <span>{g.emoji}</span>
                              <strong>{g.name}</strong>
                              <small>+{g.affection} ♡</small>
                              <b>{fmt(g.price)} 🌾</b>
                            </button>
                          ))}
                        </div>
                        <h3 className="subheading">
                          Ваша история{" "}
                          <span>{Math.min(r.dates + 1, 5)} / 5</span>
                        </h3>
                        {game.partner !== h.id ? (
                          <div className="note">
                            Выбери пару, чтобы отправиться на свидание. Прогресс
                            других историй сохранится.
                          </div>
                        ) : r.dates >= 5 ? (
                          <div className="note">
                            💛 Все пять свиданий пройдены. Ваша история только
                            начинается — и империя растёт быстрее!
                          </div>
                        ) : r.affection < thresholds[r.dates] ? (
                          <div className="note">
                            Следующее свидание откроется при{" "}
                            {thresholds[r.dates]} симпатии. До встречи осталось{" "}
                            {thresholds[r.dates] - r.affection} ♡
                          </div>
                        ) : (
                          <section className="dialogue">
                            <small>
                              СВИДАНИЕ {r.dates + 1} · СЦЕНА {r.step + 1}/3
                            </small>
                            <p>{scene!.text}</p>
                            {scene!.choices.map((c, i) => (
                              <button
                                key={i}
                                disabled={busy || !connected}
                                onClick={() =>
                                  void action({
                                    kind: "date",
                                    id: h.id,
                                    date: r.dates,
                                    step: r.step,
                                    choice: i,
                                  })
                                }
                              >
                                {c.text}
                                <span>→</span>
                              </button>
                            ))}
                          </section>
                        )}
                      </div>
                    );
                  })}
              </>
            )}
            {tab === "top" && (
              <>
                <Section
                  eyebrow="БОЛЬШИЕ ИМЕНА КУРЯТНИКА"
                  title="Зерновая элита."
                  text="Всё заработанное зерно. Покупки не снижают место."
                />
                {rankError && (
                  <div role="alert" className="note">
                    {rankError}
                  </div>
                )}
                {ranking?.me && (
                  <div className="my-rank">
                    <span>
                      ТВОЁ МЕСТО<strong>#{ranking.me.rank}</strong>
                    </span>
                    <span>
                      {name}
                      <strong>{fmt(ranking.me.earned)} 🌾</strong>
                    </span>
                  </div>
                )}
                <div className="ranking">
                  <div className="ranking-head">
                    <span>ИГРОК</span>
                    <span>ЗАРАБОТАНО</span>
                  </div>
                  {ranking ? (
                    ranking.players.map((r) => (
                      <div
                        className={
                          "rank-row " + (r.id === ranking.me?.id ? "is-me" : "")
                        }
                        key={r.id}
                      >
                        <span className="rank-number">
                          {r.rank <= 3
                            ? ["🥇", "🥈", "🥉"][r.rank - 1]
                            : r.rank}
                        </span>
                        <span className="avatar">{r.name.slice(0, 1)}</span>
                        <strong>{r.name}</strong>
                        <span>
                          {fmt(r.earned)} <small>🌾</small>
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="note">Загружаем рейтинг…</p>
                  )}
                </div>
                <p className="footnote">
                  Только настоящие игроки · обновляется каждые 15 секунд
                </p>
              </>
            )}
          </main>
          <nav>
            {nav.map(([id, icon, label]) => (
              <button
                className={tab === id ? "active" : ""}
                key={id}
                onClick={() => setTab(id)}
              >
                <span>{icon}</span>
                {label}
              </button>
            ))}
          </nav>
        </>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <footer>
        PETUHON EMPIRE{" "}
        <span>ВЫРАЩЕНО С ХАРАКТЕРОМ © {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}
function Section({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="section-title">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
