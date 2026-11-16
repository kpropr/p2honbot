export {};
const token = process.env.BOT_TOKEN;
const url = process.env.PUBLIC_URL;
if (!token || !url) throw new Error("BOT_TOKEN and PUBLIC_URL are required");
async function api(method: string, body: object) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(40000),
    },
  );
  const result = (await response.json()) as any;
  if (!result.ok)
    throw new Error(`Telegram ${method} failed (${result.error_code})`);
  return result.result;
}
await api("setChatMenuButton", {
  menu_button: { type: "web_app", text: "Играть 🌾", web_app: { url } },
});
await api("setMyCommands", {
  commands: [{ command: "start", description: "Открыть PETUHON EMPIRE" }],
});
let offset = 0;
while (true) {
  try {
    const updates = await api("getUpdates", {
      offset,
      timeout: 25,
      allowed_updates: ["message"],
    });
    for (const u of updates) {
      const m = u.message;
      if (
        m?.chat?.type === "private" &&
        /^\/start(?:\s|$)/.test(m.text || "")
      ) {
        await api("sendMessage", {
          chat_id: m.chat.id,
          text: "🐓 PETUHON EMPIRE\n\nИз одного зёрнышка — в большую империю. Кликай, строй бизнесы и найди свою курочку.\n\nТвоё место на вершине уже ждёт.",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🌾 Войти в империю", web_app: { url } }],
            ],
          },
        });
      }
      offset = u.update_id + 1;
    }
  } catch (e) {
    console.error((e as Error).message.replaceAll(token, "[redacted]"));
    await new Promise((r) => setTimeout(r, 5000));
  }
}
