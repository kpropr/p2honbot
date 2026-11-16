import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { pool } from "./db.js";
import { verifyTelegram, sessionToken, digest } from "./auth.js";
import { act, initial, settle, view, GameError, type State } from "./game.js";
import {
  businesses,
  gifts,
  hens,
  upgrades,
  thresholds,
  stories,
} from "../shared/catalog.js";
export const app = Fastify({
  logger: { redact: ["req.headers.cookie", "req.headers.authorization"] },
  bodyLimit: 16384,
  trustProxy: ["127.0.0.1", "172.16.0.0/12"],
});
await app.register(cookie);
await app.register(rateLimit, {
  max: 240,
  timeWindow: "1 minute",
  keyGenerator: (req) =>
    req.cookies.petuhon_session ? digest(req.cookies.petuhon_session) : req.ip,
});
const prefix = "/play/api";
const production = process.env.NODE_ENV === "production";
const actionSchema = z
  .object({
    operationId: z.uuid(),
    issuedAt: z.number().int().positive(),
    kind: z.enum(["click", "upgrade", "business", "gift", "partner", "date"]),
    id: z.string().max(40).optional(),
    count: z.number().int().min(1).max(10).optional(),
    gift: z.string().max(40).optional(),
    date: z.number().int().min(0).max(4).optional(),
    step: z.number().int().min(0).max(2).optional(),
    choice: z.number().int().min(0).max(2).optional(),
  })
  .strict();
app.addHook("onRequest", async (req, reply) => {
  if (req.method === "POST") {
    const origin = req.headers.origin;
    const expected = new URL(
      process.env.PUBLIC_URL || "http://localhost:5173/play/",
    ).origin;
    if (origin && origin !== expected)
      return reply.code(403).send({ error: "Недопустимый источник запроса" });
  }
});
app.setErrorHandler((err, req, reply) => {
  if (err instanceof z.ZodError)
    return reply.code(400).send({ error: "Некорректный запрос" });
  if (err instanceof GameError)
    return reply.code(409).send({ error: err.message });
  const e = err as Error & { statusCode?: number };
  if (e.statusCode && e.statusCode < 500)
    return reply
      .code(e.statusCode)
      .send({
        error:
          e.statusCode === 429
            ? "Слишком много запросов. Подожди немного."
            : e.message,
      });
  req.log.error({ err }, "Request failed");
  reply
    .code(500)
    .send({ error: "Сервер временно недоступен. Попробуй ещё раз." });
});
app.get(prefix + "/health", async () => {
  await pool.query("SELECT 1");
  return { ok: true };
});
app.post(
  prefix + "/auth",
  { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
  async (req, reply) => {
    const { initData } = z
      .object({ initData: z.string().max(12000) })
      .parse(req.body);
    if (!process.env.BOT_TOKEN)
      return reply
        .code(503)
        .send({ error: "Бот ещё настраивается. Загляни чуть позже." });
    let user;
    try {
      user = verifyTelegram(initData, process.env.BOT_TOKEN);
    } catch {
      return reply
        .code(401)
        .send({ error: "Открой игру заново через Telegram" });
    }
    await pool.query(
      "INSERT INTO players(id,name,state) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name=excluded.name",
      [user.id, user.name, JSON.stringify(initial())],
    );
    const token = sessionToken();
    await pool.query(
      "INSERT INTO sessions(hash,player_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
      [digest(token), user.id],
    );
    reply.setCookie("petuhon_session", token, {
      path: "/play/api",
      httpOnly: true,
      secure: production,
      sameSite: "strict",
      maxAge: 604800,
    });
    return { name: user.name };
  },
);
app.addHook("preHandler", async (req, reply) => {
  if (
    !req.url.startsWith(prefix) ||
    req.url === prefix + "/auth" ||
    req.url === prefix + "/health"
  )
    return;
  const token = req.cookies.petuhon_session;
  if (!token)
    return reply.code(401).send({ error: "Открой игру через Telegram" });
  const { rows } = await pool.query(
    "SELECT player_id FROM sessions WHERE hash=$1 AND expires_at>now()",
    [digest(token)],
  );
  if (!rows.length)
    return reply
      .code(401)
      .send({ error: "Сессия истекла. Открой игру заново." });
  (req as any).playerId = String(rows[0].player_id);
});
app.get(prefix + "/catalog", async () => ({
  businesses,
  gifts,
  hens,
  upgrades,
  thresholds,
  stories,
}));
app.get(prefix + "/state", async (req) => {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query(
      "SELECT name,state FROM players WHERE id=$1 FOR UPDATE",
      [(req as any).playerId],
    );
    const s: State = rows[0].state;
    const away = Date.now() - s.updated;
    const income = settle(s);
    await c.query("UPDATE players SET state=$2,earned=$3 WHERE id=$1", [
      (req as any).playerId,
      JSON.stringify(s),
      s.earned,
    ]);
    await c.query("COMMIT");
    return {
      name: rows[0].name,
      state: view(s),
      offline: away > 60000 ? Math.floor(income) : 0,
    };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
app.post(prefix + "/action", async (req) => {
  const { operationId, issuedAt, ...action } = actionSchema.parse(req.body);
  if (issuedAt > Date.now() + 60000 || issuedAt < Date.now() - 86400000)
    throw new GameError("Срок операции истёк. Обнови состояние игры.");
  const id = (req as any).playerId;
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query(
      "SELECT state FROM players WHERE id=$1 FOR UPDATE",
      [id],
    );
    const previous = await c.query(
      "SELECT payload,result FROM operations WHERE player_id=$1 AND id=$2",
      [id, operationId],
    );
    if (previous.rows.length) {
      const p = previous.rows[0].payload;
      if (
        Object.keys(p).length !== Object.keys(action).length ||
        Object.entries(action).some(([k, v]) => p[k] !== v)
      )
        throw new GameError("Идентификатор операции уже использован");
      await c.query("COMMIT");
      return { ...previous.rows[0].result, state: view(rows[0].state) };
    }
    const s: State = rows[0].state;
    const result = act(s, action);
    await c.query("UPDATE players SET state=$2,earned=$3 WHERE id=$1", [
      id,
      JSON.stringify(s),
      s.earned,
    ]);
    await c.query(
      "INSERT INTO operations(player_id,id,payload,result) VALUES($1,$2,$3,$4)",
      [id, operationId, JSON.stringify(action), JSON.stringify(result)],
    );
    await c.query("COMMIT");
    return { ...result, state: view(s) };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
app.get(prefix + "/leaderboard", async (req) => {
  const id = (req as any).playerId;
  const { rows } = await pool.query(
    `WITH ranked AS (SELECT id::text,name,floor(earned)::text AS earned,row_number() OVER(ORDER BY earned DESC,id ASC)::int AS rank FROM players) SELECT * FROM ranked WHERE rank<=100 OR id=$1 ORDER BY rank`,
    [id],
  );
  return {
    players: rows.filter((r) => r.rank <= 100),
    me: rows.find((r) => r.id === id) || null,
  };
});
app.get("/play/", async (_, reply) =>
  reply
    .type("text/html; charset=utf-8")
    .header("Cache-Control", "no-cache")
    .send(await readFile(resolve("dist/index.html"))),
);
app.get("/play/assets/:file", async (req, reply) => {
  const { file } = req.params as { file: string };
  if (!/^[a-zA-Z0-9_-]+\.(js|css|svg|woff2)$/.test(file))
    return reply.code(404).send();
  try {
    return reply
      .type(
        file.endsWith(".js")
          ? "application/javascript"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".svg")
              ? "image/svg+xml"
              : "font/woff2",
      )
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .send(await readFile(resolve("dist/assets", file)));
  } catch {
    return reply.code(404).send();
  }
});
app.get("/play", async (_, reply) => reply.redirect("/play/"));
app.addHook("onClose", async () => {
  await pool.end();
});
if (process.env.NODE_ENV !== "test") {
  await app.listen({
    host: process.env.HOST || "127.0.0.1",
    port: Number(process.env.PORT || 8081),
  });
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () => void app.close());
  const cleanup = setInterval(() => {
    void pool
      .query("DELETE FROM sessions WHERE expires_at<now()")
      .catch(() => {});
    void pool
      .query(
        "DELETE FROM operations WHERE created_at<now()-interval '48 hours'",
      )
      .catch(() => {});
  }, 3600000);
  cleanup.unref();
}
