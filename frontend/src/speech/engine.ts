/**
 * Transport mot den lokale talemotoren. Alle kall til motoren går gjennom
 * denne modulen. Adressen må være loopback: lyd skal aldri forlate maskinen.
 */

export const TOKEN_STORAGE_KEY = "evidaspeech.nsbEngineToken";
// start.ps1 setter VITE_NSB_ENGINE_URL fra evidaspeech.local.json. Adressen sjekkes uansett med assertLoopback.
export const DEFAULT_ENGINE_URL: string = import.meta.env.VITE_NSB_ENGINE_URL ?? "http://127.0.0.1:8766";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function assertLoopback(url: string): URL {
  const parsed = new URL(url);
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`Talemotoren må kjøre på denne maskinen (127.0.0.1), ikke ${parsed.hostname}.`);
  }
  if (parsed.protocol !== "http:") throw new Error("Talemotoren nås med http:// på 127.0.0.1.");
  return parsed;
}

export type EngineHealth =
  | { status: "running"; model: string; version: string; device: string }
  | { status: "not_running" };

export type PairResult = { ok: true } | { ok: false; reason: "wrong_code" | "closed" | "origin_refused" | "not_running" | "unexpected" };

export interface TokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

/** localStorage kan kaste (privat vindu, blokkert lagring); da huskes nøkkelen bare i minnet. */
export function browserTokenStore(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = safeLocalStorage()): TokenStore {
  let memory: string | null = null;
  return {
    get: () => {
      try {
        return storage?.getItem(TOKEN_STORAGE_KEY) ?? memory;
      } catch {
        return memory;
      }
    },
    set: (token) => {
      memory = token;
      try {
        storage?.setItem(TOKEN_STORAGE_KEY, token);
      } catch {
        /* bare i minnet */
      }
    },
    clear: () => {
      memory = null;
      try {
        storage?.removeItem(TOKEN_STORAGE_KEY);
      } catch {
        /* ingenting å fjerne */
      }
    }
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export class EngineTransport {
  readonly base: URL;

  constructor(
    baseUrl: string = DEFAULT_ENGINE_URL,
    readonly tokens: TokenStore = browserTokenStore(),
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)
  ) {
    this.base = assertLoopback(baseUrl);
  }

  private url(path: string): string {
    return new URL(path, this.base).toString();
  }

  async health(): Promise<EngineHealth> {
    try {
      const r = await this.fetchImpl(this.url("/v1/health"), { cache: "no-store" });
      if (!r.ok) return { status: "not_running" };
      const body = (await r.json()) as Record<string, unknown>;
      return {
        status: "running",
        model: String(body.model ?? ""),
        version: String(body.version ?? ""),
        device: String(body.device ?? "")
      };
    } catch {
      return { status: "not_running" };
    }
  }

  async pair(code: string): Promise<PairResult> {
    let r: Response;
    try {
      r = await this.fetchImpl(this.url("/v1/pair"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() })
      });
    } catch {
      return { ok: false, reason: "not_running" };
    }
    if (r.status === 401) return { ok: false, reason: "wrong_code" };
    if (r.status === 410) return { ok: false, reason: "closed" };
    if (r.status === 403) return { ok: false, reason: "origin_refused" };
    if (!r.ok) return { ok: false, reason: "unexpected" };
    const body = (await r.json()) as { token?: unknown };
    if (typeof body.token !== "string" || body.token.length === 0) return { ok: false, reason: "unexpected" };
    this.tokens.set(body.token);
    return { ok: true };
  }

  /**
   * Gjelder lagret nøkkel fortsatt? En nøkkel motoren avviser, slettes, så
   * brukeren blir bedt om ny paring.
   */
  async checkToken(): Promise<"valid" | "invalid" | "missing" | "unreachable"> {
    const token = this.tokens.get();
    if (!token) return "missing";
    try {
      const r = await this.fetchImpl(this.url("/v1/whoami"), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (r.status === 401) {
        this.tokens.clear();
        return "invalid";
      }
      return r.ok ? "valid" : "unreachable";
    } catch {
      return "unreachable";
    }
  }

  async isPaired(): Promise<boolean> {
    return (await this.checkToken()) === "valid";
  }

  streamUrl(user?: string): string | null {
    const token = this.tokens.get();
    if (!token) return null;
    const u = new URL("/v1/stream", this.base);
    u.protocol = "ws:";
    u.searchParams.set("token", token);
    if (user) u.searchParams.set("user", user);
    return u.toString();
  }
}
