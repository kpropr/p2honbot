import {
  createHmac,
  timingSafeEqual,
  randomBytes,
  createHash,
} from "node:crypto";
export function verifyTelegram(raw: string, token: string, now = Date.now()) {
  const params = new URLSearchParams(raw);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw new Error("Invalid hash");
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (seen.has(key)) throw new Error("Duplicate field");
    seen.add(key);
  }
  params.delete("hash");
  const check = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex")))
    throw new Error("Invalid signature");
  const date = Number(params.get("auth_date"));
  if (
    !Number.isFinite(date) ||
    date > now / 1000 + 30 ||
    now / 1000 - date > 3600
  )
    throw new Error("Expired login");
  const user = JSON.parse(params.get("user") || "{}");
  if (
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    typeof user.first_name !== "string"
  )
    throw new Error("Invalid user");
  return { id: String(user.id), name: user.first_name.slice(0, 80) };
}
export const sessionToken = () => randomBytes(32).toString("hex");
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
