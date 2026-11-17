/// <reference types="vite/client" />
import { useEffect, useRef, useState } from "react";
import type { Action, view } from "../server/game";

export type Game = ReturnType<typeof view>;
export type RankRow = {
  id: string;
  name: string;
  earned: string;
  rank: number;
};
type Ranking = { players: RankRow[]; me: RankRow | null };
type StateResponse = { name: string; state: Game; offline: number };
type Operation = Action & { operationId: string; issuedAt: number };
type ActionResponse = { state: Game; message?: string; accepted?: number };

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        ready: () => void;
        expand: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        HapticFeedback?: { impactOccurred: (style: string) => void };
      };
    };
  }
}
const telegram = window.Telegram?.WebApp;
export const localPreview =
  import.meta.env.DEV && import.meta.env.MODE === "local-game";
const previewState = localPreview
  ? new URLSearchParams(location.search).get("preview")
  : null;
export const canSignIn = localPreview || Boolean(telegram?.initData);
const integer = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
export const fmt = (value: number | string) => integer.format(Number(value));
export const rate = (value: number) => decimal.format(value);

class RequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const headers = new Headers();
  if (body) headers.set("Content-Type", "application/json");
  if (previewState) headers.set("X-Petuhon-Preview", previewState);
  const response = await fetch(import.meta.env.BASE_URL + "api/" + path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    throw new RequestError(
      response.status >= 400 ? response.status : 502,
      result?.error || "Сервер не ответил. Попробуй ещё раз.",
    );
  }
  return result;
}

export function useGame(showRanking: boolean) {
  const [game, setGame] = useState<Game | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(canSignIn);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [rankError, setRankError] = useState("");
  const [rankLoading, setRankLoading] = useState(false);
  const current = useRef<Game | null>(null);
  const pending = useRef(0);
  const inFlight = useRef(false);
  const retry = useRef<Operation | null>(null);
  const retryAt = useRef(0);
  const lastTap = useRef(0);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function accept(state: Game) {
    current.current = state;
    setGame(state);
  }
  function announce(text: string, error = false) {
    setNotice({ text, error });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(
      () => setNotice(null),
      error ? 7000 : 5000,
    );
  }
  async function load() {
    if (!canSignIn) return;
    setLoading(true);
    setError("");
    try {
      await api("auth", { initData: telegram?.initData || "" });
      const response = await api<StateResponse>("state");
      setName(response.name);
      accept(response.state);
      setConnected(true);
      if (response.offline)
        announce(`Офлайн-доход начислен · +${fmt(response.offline)} зерна`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function sync() {
    try {
      const response = await api<StateResponse>("state");
      accept(response.state);
      setConnected(true);
      if (response.offline)
        announce(`Офлайн-доход начислен · +${fmt(response.offline)} зерна`);
    } catch (e) {
      setConnected(false);
      if (e instanceof RequestError && e.status === 401) {
        current.current = null;
        setGame(null);
        setError("Сессия истекла. Войди в игру снова.");
      }
    }
  }
  async function send(operation: Operation) {
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await api<ActionResponse>("action", operation);
      retry.current = null;
      accept(result.state);
      setConnected(true);
      const messages = {
        upgrade: "Улучшение приобретено",
        business: "Уровень бизнеса повышен",
        partner: "Пара выбрана",
      } as const;
      if (result.message) announce(result.message);
      else if (
        operation.kind === "upgrade" ||
        operation.kind === "business" ||
        operation.kind === "partner"
      )
        announce(messages[operation.kind]);
      return true;
    } catch (e) {
      if (!(e instanceof RequestError) || e.status >= 500 || e.status === 429) {
        retry.current = operation;
        retryAt.current = Date.now() + 5000;
        setConnected(false);
      } else {
        retry.current = null;
        announce(e.message, true);
        await sync();
      }
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  function sendAction(action: Action) {
    return send({
      ...action,
      operationId: crypto.randomUUID(),
      issuedAt: current.current!.updated,
    });
  }
  async function flush() {
    if (inFlight.current || !current.current) return false;
    if (retry.current) {
      return Date.now() >= retryAt.current ? send(retry.current) : false;
    }
    if (!pending.current) return true;
    const count = pending.current;
    pending.current = 0;
    return sendAction({ kind: "click", count });
  }
  async function action(next: Action) {
    if (!connected || !(await flush()) || inFlight.current) return;
    await sendAction(next);
  }
  function tap() {
    const state = current.current;
    if (
      !state ||
      !connected ||
      inFlight.current ||
      pending.current >= 10 ||
      state.energy <= pending.current ||
      Date.now() - lastTap.current < 100
    )
      return false;
    lastTap.current = Date.now();
    pending.current++;
    setGame({
      ...state,
      balance: state.balance + pending.current * state.stats.power,
      energy: state.energy - pending.current,
    });
    telegram?.HapticFeedback?.impactOccurred("light");
    return true;
  }
  useEffect(() => {
    telegram?.ready();
    telegram?.expand();
    telegram?.setHeaderColor?.("#151517");
    telegram?.setBackgroundColor?.("#151517");
    void load();
    const taps = window.setInterval(() => void flush(), 1000);
    const snapshots = window.setInterval(async () => {
      if (
        !current.current ||
        inFlight.current ||
        pending.current ||
        retry.current ||
        document.hidden
      )
        return;
      inFlight.current = true;
      try {
        await sync();
      } finally {
        inFlight.current = false;
      }
    }, 10000);
    const visibility = () => {
      if (document.hidden) void flush();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(taps);
      window.clearInterval(snapshots);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  async function refreshRanking(signal?: AbortSignal) {
    setRankLoading(true);
    setRankError("");
    try {
      const result = await api<Ranking>("leaderboard");
      if (!signal?.aborted) setRanking(result);
    } catch (e) {
      if (!signal?.aborted) setRankError((e as Error).message);
    } finally {
      if (!signal?.aborted) setRankLoading(false);
    }
  }
  useEffect(() => {
    if (!showRanking || !game) return;
    const lifetime = new AbortController();
    void refreshRanking(lifetime.signal);
    const timer = window.setInterval(
      () => void refreshRanking(lifetime.signal),
      15000,
    );
    return () => {
      lifetime.abort();
      window.clearInterval(timer);
    };
  }, [showRanking, !!game]);

  return {
    game,
    name,
    loading,
    error,
    busy,
    connected,
    notice,
    rankError,
    rankLoading,
    ranking,
    refreshRanking,
    tap,
    action,
    load,
    saving: busy || pending.current > 0,
    dismissNotice: () => setNotice(null),
  };
}
