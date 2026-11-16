import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
const enabled = process.env.RUN_DB_TESTS === "1";
test(
  "PostgreSQL transactions, isolation, idempotency and real ranking",
  { skip: !enabled },
  async () => {
    if (!process.env.DATABASE_URL?.includes("petuhon_test"))
      throw new Error("Tests require a separate petuhon_test database");
    process.env.NODE_ENV = "test";
    process.env.BOT_TOKEN = "integration-test-only";
    const { migrate, pool } = await import("../server/db.js");
    await migrate();
    const { app } = await import("../server/index.js");
    after(async () => {
      await app.close();
    });
    await pool.query("TRUNCATE operations,sessions,players CASCADE");
    function signed(id: number) {
      const p = new URLSearchParams({
        auth_date: String(Math.floor(Date.now() / 1000)),
        user: JSON.stringify({ id, first_name: `Player ${id}` }),
      });
      const data = [...p]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
      p.set(
        "hash",
        createHmac(
          "sha256",
          createHmac("sha256", "WebAppData")
            .update(process.env.BOT_TOKEN!)
            .digest(),
        )
          .update(data)
          .digest("hex"),
      );
      return p.toString();
    }
    async function login(id: number) {
      const r = await app.inject({
        method: "POST",
        url: "/play/api/auth",
        payload: { initData: signed(id) },
      });
      assert.equal(r.statusCode, 200);
      return r.cookies[0].value;
    }
    const cookie = await login(101);
    const other = await login(102);
    const cookies = { petuhon_session: cookie };
    assert.equal((await app.inject("/play/api/state")).statusCode, 401);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/play/api/auth",
          payload: { initData: signed(103) + "x" },
        })
      ).statusCode,
      401,
    );
    const operationId = randomUUID();
    const payload = {
      operationId,
      issuedAt: Date.now(),
      kind: "click",
      count: 10,
    };
    const [a, b] = await Promise.all([
      app.inject({ method: "POST", url: "/play/api/action", cookies, payload }),
      app.inject({ method: "POST", url: "/play/api/action", cookies, payload }),
    ]);
    assert.equal(a.statusCode, 200);
    assert.equal(b.statusCode, 200);
    let result = (await app.inject({ url: "/play/api/state", cookies })).json();
    assert.equal(result.state.balance, 10);
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/play/api/action",
          cookies,
          payload: { ...payload, count: 1 },
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (
        await app.inject({
          url: "/play/api/state",
          cookies: { petuhon_session: other },
        })
      ).json().state.balance,
      0,
    );
    await pool.query(
      `UPDATE players SET state=jsonb_set(jsonb_set(state,'{balance}','100'),'{earned}','100'),earned=100 WHERE id=101`,
    );
    const purchases = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: "POST",
          url: "/play/api/action",
          cookies,
          payload: {
            operationId: randomUUID(),
            issuedAt: Date.now(),
            kind: "upgrade",
            id: "power",
          },
        }),
      ),
    );
    assert.deepEqual(purchases.map((r) => r.statusCode).sort(), [200, 409]);
    result = (await app.inject({ url: "/play/api/state", cookies })).json();
    assert.equal(result.state.balance, 50);
    assert.equal(result.state.stats.power, 2);
    assert.equal(result.state.earned, 100);
    const board = (
      await app.inject({ url: "/play/api/leaderboard", cookies })
    ).json();
    assert.equal(board.players.length, 2);
    assert.equal(board.me.rank, 1);
    assert.equal(board.me.earned, "100");
    const persisted = await pool.query(
      "SELECT state FROM players WHERE id=101",
    );
    assert.equal(persisted.rows[0].state.balance, 50);
    console.log(
      "Database integration checks passed; test records are isolated in petuhon_test.",
    );
  },
);
