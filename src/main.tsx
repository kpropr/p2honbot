import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowDown,
  ArrowRight,
  BatteryCharging,
  Check,
  CircleAlert,
  Coins,
  Heart,
  LayoutGrid,
  LoaderCircle,
  RefreshCw,
  Store,
  Trophy,
  Wheat,
  X,
  Zap,
} from "lucide-react";
import {
  businesses,
  gifts,
  hens,
  price,
  stories,
  thresholds,
  upgrades,
} from "../shared/catalog";
import type { Action } from "../server/game";
import {
  canSignIn,
  fmt,
  localPreview,
  rate,
  useGame,
  type Game,
} from "./game-client";
import emblem from "./assets/emblem.webp";
import rooster from "./assets/hero.webp";
import tsypa from "./assets/tsypa.webp";
import coco from "./assets/coco.webp";
import ryaba from "./assets/ryaba.webp";
import "./style.css";

const portraits = { tsypa, koko: coco, ryaba };

const sections = [
  { id: "home", label: "Кликер", icon: LayoutGrid },
  { id: "upgrades", label: "Улучшения", icon: Zap },
  { id: "business", label: "Бизнесы", icon: Store },
  { id: "hens", label: "Курочки", icon: Heart },
  { id: "top", label: "Рейтинг", icon: Trophy },
] as const;
type Tab = (typeof sections)[number]["id"];
type Act = (action: Action) => void;
const grain = (n: number | string) => (
  <>
    {fmt(n)} <Wheat size={14} aria-hidden="true" />
  </>
);

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <img src={emblem} alt="" width={32} height={32} />
      </span>
      <span>
        PETUHON <span className="brand-tail">EMPIRE</span>
      </span>
    </div>
  );
}

function PageTitle({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <h1 id="page-title" tabIndex={-1}>
        {title}
      </h1>
      {children && <p>{children}</p>}
    </div>
  );
}

function StatePanel({
  title,
  children,
  action,
  loading = false,
  error = false,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  loading?: boolean;
  error?: boolean;
}) {
  return (
    <div
      className="state-panel"
      role={error ? "alert" : loading ? "status" : undefined}
    >
      {loading && (
        <LoaderCircle size={20} className="spin" aria-hidden="true" />
      )}
      {error && <CircleAlert size={20} aria-hidden="true" />}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

function Metrics({ game }: { game: Game }) {
  return (
    <dl className="metrics" aria-label="Показатели империи">
      <div>
        <dt>
          <Wheat />
          Баланс
        </dt>
        <dd>
          {fmt(game.balance)} <small>зерна</small>
        </dd>
      </div>
      <div>
        <dt>
          <Zap />
          Сила клика
        </dt>
        <dd>
          +{fmt(game.stats.power)} <small>за клик</small>
        </dd>
      </div>
      <div>
        <dt>
          <Coins />
          Доход
        </dt>
        <dd>
          +{rate(game.stats.income)} <small>в час</small>
        </dd>
      </div>
    </dl>
  );
}

function Clicker({
  game,
  tap,
  connected,
  navigate,
}: {
  game: Game;
  tap: () => boolean;
  connected: boolean;
  navigate: (tab: Tab) => void;
}) {
  const [pops, setPops] = useState<{ id: number; x: number; y: number }[]>([]);
  const count = useRef(0);
  function animate(event: MouseEvent<HTMLButtonElement>) {
    if (!tap()) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const id = ++count.current;
    const x = event.detail
      ? Math.max(28, Math.min(rect.width - 28, event.clientX - rect.left))
      : rect.width / 2;
    const y = event.detail
      ? Math.max(32, event.clientY - rect.top)
      : rect.height / 2;
    setPops((items) => [...items, { id, x, y }]);
    setTimeout(
      () => setPops((items) => items.filter((item) => item.id !== id)),
      620,
    );
  }
  const owned = Object.values(game.businesses).reduce(
    (sum, level) => sum + level,
    0,
  );
  const partner = hens.find((hen) => hen.id === game.partner);
  return (
    <>
      <PageTitle title="Кликер">
        Нажимай на петуха, чтобы собирать зерно.
      </PageTitle>
      <Metrics game={game} />
      <div className="dashboard">
        <section className="panel tap-panel" aria-labelledby="tap-heading">
          <div className="panel-header">
            <h2 id="tap-heading">Сбор зерна</h2>
            <span className="muted">−1 энергии за клик</span>
          </div>
          <div className="tap-stage">
            <button
              className="rooster-button"
              disabled={!connected || game.energy <= 0}
              onClick={animate}
              aria-label="Собрать зерно"
            >
              <img className="bird" src={rooster} alt="" draggable={false} />
              <span className="tap-label">
                {!connected
                  ? "Нет связи"
                  : game.energy <= 0
                    ? "Энергия восстанавливается"
                    : "Собрать зерно"}
              </span>
              {pops.map((pop) => (
                <span
                  className="pop"
                  key={pop.id}
                  style={{ left: pop.x, top: pop.y }}
                  aria-hidden="true"
                >
                  +{fmt(game.stats.power)}
                </span>
              ))}
            </button>
          </div>
        </section>
        <div className="dashboard-side">
          <section className="panel energy-panel" aria-label="Энергия">
            <h2>
              <BatteryCharging size={17} /> Энергия
            </h2>
            <div className="energy-value">
              {fmt(game.energy)} <span>/ {fmt(game.stats.capacity)}</span>
            </div>
            <progress
              aria-label="Запас энергии"
              value={game.energy}
              max={game.stats.capacity}
            />
            <p>Восстановление +{fmt(game.stats.regen)} в секунду</p>
          </section>
          <section
            className="panel progress-panel"
            aria-labelledby="progress-heading"
          >
            <div className="panel-header">
              <h2 id="progress-heading">Прогресс</h2>
            </div>
            <div className="progress-row">
              <span>Всего заработано</span>
              <strong>{grain(game.earned)}</strong>
            </div>
            <button
              className="progress-row"
              onClick={() => navigate("business")}
            >
              <span>Уровни бизнесов</span>
              <strong>
                {fmt(owned)} <ArrowRight size={14} />
              </strong>
            </button>
            <button className="progress-row" onClick={() => navigate("hens")}>
              <span>Пара</span>
              <strong>
                {partner?.name || "Не выбрана"} <ArrowRight size={14} />
              </strong>
            </button>
          </section>
        </div>
      </div>
    </>
  );
}

function Purchase({
  cost,
  balance,
  label,
  disabled,
  max,
  onClick,
}: {
  cost: number;
  balance: number;
  label: string;
  disabled: boolean;
  max?: boolean;
  onClick: () => void;
}) {
  if (max)
    return (
      <span className="purchase-cap">
        <Check size={14} /> Максимум
      </span>
    );
  const affordable = balance >= cost;
  return (
    <div className="purchase">
      <button
        className="button purchase-button"
        disabled={disabled || !affordable}
        onClick={onClick}
        aria-label={`${label} за ${fmt(cost)} зерна`}
      >
        <span>{label}</span>
        <span className="price">{grain(cost)}</span>
      </button>
      {!affordable && <small>Не хватает {fmt(cost - balance)}</small>}
    </div>
  );
}

function Shop({
  game,
  kind,
  disabled,
  action,
}: {
  game: Game;
  kind: "upgrade" | "business";
  disabled: boolean;
  action: Act;
}) {
  const business = kind === "business";
  const items = business
    ? businesses.map((item) => ({
        ...item,
        level: game.businesses[item.id] || 0,
        max: 50,
        effect: `+${fmt(item.income)} зерна/ч за уровень`,
      }))
    : upgrades.map((item) => ({
        ...item,
        level: game.upgrades[item.id] || 0,
        effect: item.description,
      }));
  return (
    <>
      <PageTitle title={business ? "Бизнесы" : "Улучшения"}>
        {business
          ? "Бизнесы приносят зерно, даже когда игра закрыта. Офлайн-доход начисляется за период до 8 часов."
          : "Увеличивай силу клика, запас энергии и скорость восстановления."}
      </PageTitle>
      <Metrics game={game} />
      <div className="panel catalog">
        <div className="catalog-labels">
          <span>{business ? "Бизнес" : "Улучшение"}</span>
          <span>Эффект</span>
          <span>Действие</span>
        </div>
        {items.map((item) => (
          <article className="catalog-row" key={item.id}>
            <div>
              <h2>{item.name}</h2>
              <span className="muted">
                {business && !item.level
                  ? "Не куплен"
                  : `Уровень ${item.level} из ${item.max}`}
              </span>
            </div>
            <p className="effect">{item.effect}</p>
            <Purchase
              balance={game.balance}
              cost={price(item.base, item.level, business ? 1.18 : 1.6)}
              disabled={disabled}
              max={item.level >= item.max}
              label={business && !item.level ? "Купить" : "Улучшить"}
              onClick={() => action({ kind, id: item.id })}
            />
          </article>
        ))}
      </div>
    </>
  );
}

function Relationships({
  game,
  disabled,
  action,
}: {
  game: Game;
  disabled: boolean;
  action: Act;
}) {
  const [selected, setSelected] = useState(
    hens.find((h) => h.id === game.partner)?.id || hens[0].id,
  );
  const hen = hens.find((h) => h.id === selected)!;
  const relation = game.relations[hen.id];
  const paired = game.partner === hen.id;
  const scene = stories[hen.id][relation.dates]?.[relation.step];
  const needed = thresholds[relation.dates] - relation.affection;
  return (
    <>
      <PageTitle title="Курочки">
        Дари подарки и проходи свидания. Бонус к доходу даёт выбранная пара.
      </PageTitle>
      <div className="character-picker" role="group" aria-label="Персонажи">
        {hens.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={item.id === selected}
            onClick={() => setSelected(item.id)}
          >
            {item.name}
            {game.partner === item.id && (
              <Heart size={14} fill="currentColor" aria-label="Твоя пара" />
            )}
          </button>
        ))}
      </div>
      <section className="panel profile">
        <div className="profile-summary">
          <img className="profile-portrait" src={portraits[hen.id]} alt="" />
          <div>
            <h2>{hen.name}</h2>
            <p>{hen.description}</p>
          </div>
          {paired ? (
            <span className="paired">
              <Heart size={14} fill="currentColor" /> Твоя пара
            </span>
          ) : (
            <button
              className="button primary"
              disabled={disabled}
              onClick={() => action({ kind: "partner", id: hen.id })}
            >
              Выбрать пару
            </button>
          )}
        </div>
        <dl className="profile-stats">
          <div>
            <dt>Симпатия</dt>
            <dd>{fmt(relation.affection)}</dd>
          </div>
          <div>
            <dt>Свидания</dt>
            <dd>{relation.dates} / 5</dd>
          </div>
          <div>
            <dt>Бонус к доходу</dt>
            <dd>+{paired ? relation.dates * 2 : 0}%</dd>
          </div>
        </dl>
      </section>
      <div className="relationships">
        <section className="panel">
          <div className="panel-header">
            <h2>Свидания</h2>
            {paired && scene && needed <= 0 && (
              <span className="muted">Сцена {relation.step + 1} из 3</span>
            )}
          </div>
          {relation.dates >= 5 ? (
            <StatePanel title="Все свидания пройдены">
              Эта история завершена.
            </StatePanel>
          ) : !paired ? (
            <StatePanel title="Свидания пока недоступны">
              Выбери её в пару, чтобы открыть историю.
            </StatePanel>
          ) : needed > 0 ? (
            <StatePanel title="Следующее свидание закрыто">
              До встречи нужно ещё {fmt(needed)} симпатии.
            </StatePanel>
          ) : (
            <div className="dialogue">
              <span className="muted">Свидание {relation.dates + 1} из 5</span>
              <p>{scene.text}</p>
              {scene.choices.map((choice, i) => (
                <button
                  className="choice"
                  key={choice.text}
                  disabled={disabled}
                  onClick={() =>
                    action({
                      kind: "date",
                      id: hen.id,
                      date: relation.dates,
                      step: relation.step,
                      choice: i,
                    })
                  }
                >
                  <span>{choice.text}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Подарки</h2>
            <span className="muted">{grain(game.balance)}</span>
          </div>
          {gifts.map((gift) => (
            <div className="gift-row" key={gift.id}>
              <div>
                <strong>{gift.name}</strong>
                <p className="muted">+{gift.affection} симпатии</p>
              </div>
              <Purchase
                cost={gift.price}
                balance={game.balance}
                label="Подарить"
                disabled={disabled}
                onClick={() =>
                  action({ kind: "gift", id: hen.id, gift: gift.id })
                }
              />
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function Leaderboard({ model }: { model: ReturnType<typeof useGame> }) {
  const { ranking, rankError, rankLoading, refreshRanking } = model;
  return (
    <>
      <PageTitle title="Рейтинг">
        Место зависит от всего заработанного зерна. Покупки его не снижают.
      </PageTitle>
      {ranking?.me && (
        <dl className="rank-summary">
          <div>
            <dt>Твоё место</dt>
            <dd>#{fmt(ranking.me.rank)}</dd>
          </div>
          <div>
            <dt>Заработано</dt>
            <dd>{grain(ranking.me.earned)}</dd>
          </div>
        </dl>
      )}
      <section className="panel" aria-labelledby="leaderboard-heading">
        <div className="panel-header">
          <h2 id="leaderboard-heading">Игроки</h2>
          <button
            className="button icon-button"
            aria-label="Обновить рейтинг"
            disabled={rankLoading}
            onClick={() => void refreshRanking()}
          >
            <RefreshCw size={16} className={rankLoading ? "spin" : ""} />
          </button>
        </div>
        {rankError && (
          <StatePanel error title="Не удалось обновить рейтинг">
            {rankError}
          </StatePanel>
        )}
        {!ranking && !rankError && (
          <StatePanel loading title="Загружаем рейтинг" />
        )}
        {ranking &&
          (ranking.players.length ? (
            <table className="leaderboard">
              <thead>
                <tr>
                  <th scope="col">Место</th>
                  <th scope="col">Игрок</th>
                  <th scope="col">
                    <span>
                      Заработано <ArrowDown size={12} />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranking.players.map((row) => (
                  <tr
                    key={row.id}
                    className={
                      row.id === ranking.me?.id ? "current-player" : ""
                    }
                  >
                    <td>{fmt(row.rank)}</td>
                    <th scope="row">
                      {row.name}
                      {row.id === ranking.me?.id && <small>Ты</small>}
                    </th>
                    <td>{grain(row.earned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <StatePanel title="Рейтинг пока пуст">
              Здесь появятся игроки и их заработок.
            </StatePanel>
          ))}
      </section>
    </>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("home");
  const model = useGame(tab === "top");
  const { game, notice, connected, saving } = model;

  function navigate(next: Tab) {
    if (tab === next) return;
    setTab(next);
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.getElementById("page-title")?.focus({ preventScroll: true });
    });
  }
  const disabled = model.busy || !connected;
  return (
    <div className={game ? "shell" : "shell signed-out"}>
      <a className="skip-link" href="#main">
        К содержимому
      </a>
      <div className="sidebar">
        <Brand />
        {game && (
          <nav aria-label="Разделы игры">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                aria-current={id === tab ? "page" : undefined}
                title={label}
                onClick={() => navigate(id)}
                key={id}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
      <div className="workspace">
        {game && (
          <header className="topbar">
            <Brand />
            <div className="topbar-right">
              {localPreview && (
                <span className="preview-label">Локальный режим</span>
              )}
              <span
                className="save-status"
                data-state={
                  !connected ? "offline" : saving ? "saving" : "saved"
                }
              >
                {!connected ? (
                  <CircleAlert size={14} />
                ) : saving ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <Check size={14} />
                )}
                {!connected
                  ? "Нет связи"
                  : saving
                    ? "Сохранение…"
                    : "Сохранено"}
              </span>
              <span className="account" title={model.name}>
                <span aria-hidden="true">
                  {Array.from(model.name.trim())[0]?.toUpperCase() || "P"}
                </span>
                <b>{model.name}</b>
              </span>
            </div>
          </header>
        )}
        <main className="content" id="main">
          {!game ? (
            <div className="sign-in">
              <PageTitle title="PETUHON EMPIRE" />
              <div className="panel">
                {model.loading ? (
                  <StatePanel loading title="Загружаем игру">
                    Получаем твой прогресс.
                  </StatePanel>
                ) : model.error ? (
                  <StatePanel
                    error
                    title="Вход не удался"
                    action={
                      <button
                        className="button primary"
                        onClick={() => void model.load()}
                      >
                        Повторить
                      </button>
                    }
                  >
                    {model.error}
                  </StatePanel>
                ) : (
                  <StatePanel
                    title="Вход через Telegram"
                    action={
                      !canSignIn && (
                        <a
                          className="button primary"
                          href="https://t.me/p2honbot"
                        >
                          Открыть бота <ArrowRight size={16} />
                        </a>
                      )
                    }
                  >
                    Запусти игру кнопкой «Играть» в чате с ботом.
                  </StatePanel>
                )}
              </div>
            </div>
          ) : (
            <>
              {!connected && (
                <div className="offline-banner" role="status">
                  <CircleAlert size={16} /> Соединение потеряно. Восстанавливаем
                  связь.
                </div>
              )}
              {tab === "home" && (
                <Clicker
                  game={game}
                  tap={model.tap}
                  connected={connected}
                  navigate={navigate}
                />
              )}
              {tab === "upgrades" && (
                <Shop
                  game={game}
                  kind="upgrade"
                  disabled={disabled}
                  action={model.action}
                />
              )}
              {tab === "business" && (
                <Shop
                  game={game}
                  kind="business"
                  disabled={disabled}
                  action={model.action}
                />
              )}
              {tab === "hens" && (
                <Relationships
                  game={game}
                  disabled={disabled}
                  action={model.action}
                />
              )}
              {tab === "top" && <Leaderboard model={model} />}
            </>
          )}
        </main>
      </div>
      {notice && (
        <div className="toast" role={notice.error ? "alert" : "status"}>
          {notice.error ? <CircleAlert size={17} /> : <Check size={17} />}
          <span>{notice.text}</span>
          <button
            className="icon-button"
            aria-label="Закрыть уведомление"
            onClick={model.dismissNotice}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
