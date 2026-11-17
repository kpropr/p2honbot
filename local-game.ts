import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";
import {
  act,
  GameError,
  initial,
  settle,
  view,
  type Action,
} from "./server/game";

export function localGame(): Plugin {
  const player = initial();
  player.balance = 320;
  player.earned = 420;
  player.businesses.stall = 1;
  player.energy = 380;
  const name = "Локальный игрок";
  const operations = new Map<string, ReturnType<typeof act>>();

  return {
    name: "petuhon-local-game",
    apply: "serve",
    transformIndexHtml(html) {
      return html.replace(
        '<script src="https://telegram.org/js/telegram-web-app.js"></script>',
        "",
      );
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0];
        if (!path?.startsWith("/play/api/")) return next();
        const send = (status: number, value: object) => {
          res.writeHead(status, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify(value));
        };
        const fixture = req.headers["x-petuhon-preview"];
        if (fixture === "slow")
          await new Promise((resolve) => setTimeout(resolve, 1800));
        try {
          switch (path.slice("/play/api/".length)) {
            case "auth":
              return send(200, { name });
            case "state":
              settle(player);
              return send(200, { name, state: view(player), offline: 0 });
            case "action": {
              const operation = await readOperation(req);
              let result = operations.get(operation.operationId);
              if (!result) {
                result = act(player, operation);
                operations.set(operation.operationId, result);
              }
              return send(200, { ...result, state: view(player) });
            }
            case "leaderboard": {
              if (fixture === "rank-error")
                return send(503, { error: "Локальная имитация сбоя." });
              if (fixture === "rank-empty")
                return send(200, { players: [], me: null });
              const me = {
                rank: 1,
                name,
                id: "local",
                earned: String(view(player).earned),
              };
              return send(200, { players: [me], me });
            }
            default:
              return send(404, {
                error: "Запрос не поддерживается в локальном режиме.",
              });
          }
        } catch (error) {
          return send(error instanceof GameError ? 409 : 400, {
            error:
              error instanceof Error
                ? error.message
                : "Не удалось выполнить действие.",
          });
        }
      });
    },
  };
}

async function readOperation(
  req: IncomingMessage,
): Promise<Action & { operationId: string }> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4096) throw new Error("Слишком большой запрос.");
  }
  return JSON.parse(body);
}
