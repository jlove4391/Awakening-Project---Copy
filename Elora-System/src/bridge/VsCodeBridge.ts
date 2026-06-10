// Elora-System/src/bridge/VsCodeBridge.ts
export type BridgeInit = {
  /** Optional override of the base URL (default: REACT_APP_VSCODE_BRIDGE_URL or http://localhost:4317) */
  baseUrl?: string;
  /** Optional override of the auth token (default: REACT_APP_VSCODE_BRIDGE_TOKEN) */
  token?: string;
};

type ExecStart = { ok: boolean; id?: string; channel?: string; error?: string };
type ListItem = { name: string; type: "file" | "dir" };
type JSONish = Record<string, any>;

export class VsCodeBridge {
  private base: string;
  private token?: string;

  constructor(init: BridgeInit = {}) {
    const CRA = (typeof process !== "undefined" ? (process as any).env : {}) || {};
    this.base = (init.baseUrl ?? CRA.REACT_APP_VSCODE_BRIDGE_URL ?? "http://localhost:4317").replace(/\/+$/, "");
    this.token = init.token ?? CRA.REACT_APP_VSCODE_BRIDGE_TOKEN;
  }

  private headers(): HeadersInit {
    return {
      "Content-Type": "application/json",
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private async get<T = JSONish>(path: string): Promise<T> {
    const r = await fetch(`${this.base}${path}`, { headers: this.headers() });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  private async post<T = JSONish>(path: string, body: any): Promise<T> {
    const r = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      let msg = `${r.status} ${r.statusText}`;
      try { msg = (await r.json())?.error || msg; } catch {}
      throw new Error(msg);
    }
    return r.json();
  }

  // ---- Public API ----
  status() { return this.get(`/status`); }
  list(path = ".") { return this.get(`/fs/list?path=${encodeURIComponent(path)}`) as Promise<{ ok: boolean; items: ListItem[]; error?: string }>; }
  read(path: string) { return this.get(`/fs/read?path=${encodeURIComponent(path)}`) as Promise<{ ok: boolean; data?: string; error?: string }>; }
  write(path: string, data: string) { return this.post(`/fs/write`, { path, data }) as Promise<{ ok: boolean; error?: string }>; }
  mkdir(path: string) { return this.post(`/fs/mkdir`, { path }) as Promise<{ ok: boolean; error?: string }>; }

  run(cmd: string, args: string[] = [], opts?: { cwd?: string; env?: Record<string, string> }) {
    return this.post<ExecStart>(`/exec/run`, { cmd, args, ...opts });
  }
  kill(id: string) { return this.post(`/exec/kill`, { id }) as Promise<{ ok: boolean; error?: string }>; }

  openLogSocket(channel: string, onMessage: (msg: any) => void) {
    const wsBase = this.base.replace(/^http/i, "ws");
    const url = new URL(wsBase);
    url.pathname = "/ws";
    if (this.token) url.searchParams.set("token", this.token);

    const ws = new WebSocket(url.toString());
    ws.addEventListener("open", () => ws.send(JSON.stringify({ type: "join", channel })));
    ws.addEventListener("message", (e) => { try { onMessage(JSON.parse(String(e.data))); } catch {} });
    return ws;
  }

  gitStatus(cwd?: string) {
    const q = cwd ? `?cwd=${encodeURIComponent(cwd)}` : "";
    return this.get(`/git/status${q}`);
  }
  gitCommit(message: string, cwd?: string) {
    return this.post(`/git/commit`, { message, cwd });
  }
}
