import { test } from "node:test";
import assert from "node:assert/strict";
import { act, initial, settle, stats } from "../server/game.js";
import { createHmac } from "node:crypto";
import { verifyTelegram } from "../server/auth.js";
test("clicks use energy and rate bucket, no negative balance", () => {
  const s = initial(0);
  assert.equal(act(s, { kind: "click", count: 10 }, 0).accepted, 10);
  assert.equal(s.balance, 10);
  assert.equal(act(s, { kind: "click", count: 10 }, 0).accepted, 0);
  assert.equal(act(s, { kind: "click", count: 5 }, 500).accepted, 5);
  assert.throws(() => act(s, { kind: "click", count: -1 }, 500));
  s.energy = 0;
  assert.equal(act(s, { kind: "click", count: 1 }, 500).accepted, 0);
});
test("offline income capped at eight hours, fractional income retained", () => {
  const s = initial(0);
  s.businesses.stall = 1;
  settle(s, 10 * 3600000);
  assert.equal(s.balance, 80);
  assert.equal(s.earned, 80);
  settle(s, 10 * 3600000);
  assert.equal(s.balance, 80);
  settle(s, 10 * 3600000 + 360);
  assert.ok(s.balance > 80);
  assert.equal(s.energy, 500);
});
test("purchases do not reduce lifetime earned and use authoritative prices", () => {
  const s = initial(0);
  s.balance = 100;
  s.earned = 100;
  act(s, { kind: "upgrade", id: "power" }, 0);
  assert.equal(s.balance, 50);
  assert.equal(s.earned, 100);
  assert.equal(stats(s).power, 2);
  assert.throws(() => act(s, { kind: "upgrade", id: "power" }, 0));
  assert.throws(() => act(s, { kind: "business", id: "fake" }, 0));
});
test("capacity purchase does not refill energy", () => {
  const s = initial(0);
  s.balance = 100;
  s.energy = 10;
  act(s, { kind: "upgrade", id: "capacity" }, 0);
  assert.equal(s.energy, 10);
  assert.equal(stats(s).capacity, 600);
});
test("date steps cannot be replayed, one active partner bonus", () => {
  const s = initial(0);
  act(s, { kind: "partner", id: "tsypa" }, 0);
  act(s, { kind: "date", id: "tsypa", date: 0, step: 0, choice: 0 }, 0);
  assert.throws(() =>
    act(s, { kind: "date", id: "tsypa", date: 0, step: 0, choice: 0 }, 0),
  );
  for (const step of [1, 2])
    act(s, { kind: "date", id: "tsypa", date: 0, step, choice: 0 }, 0);
  assert.equal(s.relations.tsypa.dates, 1);
  assert.throws(() =>
    act(s, { kind: "date", id: "tsypa", date: 1, step: 0, choice: 0 }, 0),
  );
  s.businesses.stall = 1;
  assert.equal(stats(s).income, 10.2);
  act(s, { kind: "partner", id: "koko" }, 3600000);
  assert.equal(s.balance, 10.2);
  assert.equal(stats(s).income, 10);
  assert.equal(s.relations.tsypa.dates, 1);
});
test("Telegram signature, expiry, tampering", () => {
  const token = "test-token";
  const p = new URLSearchParams({
    auth_date: "1000",
    user: JSON.stringify({ id: 123, first_name: "Тест" }),
  });
  const check = [...p]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  assert.equal(verifyTelegram(p.toString(), token, 1000000).id, "123");
  assert.throws(() => verifyTelegram(p.toString(), token, 5000000));
  p.set("user", '{"id":456,"first_name":"Чужой"}');
  assert.throws(() => verifyTelegram(p.toString(), token, 1000000));
});
