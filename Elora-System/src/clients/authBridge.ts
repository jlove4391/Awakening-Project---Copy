// src/clients/authBridge.ts

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface BridgeResponse<T = unknown> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

const AUTH_BRIDGE_URL: string = (() => {
  const url = process.env.REACT_APP_AUTHBRIDGE_URL;
  if (!url) {
    throw new Error(
      "Missing env: REACT_APP_AUTHBRIDGE_URL. " +
        "Set it in your .env (e.g., REACT_APP_AUTHBRIDGE_URL=http://localhost:4000)"
    );
  }
  return url.replace(/\/+$/, "");
})();

const DEFAULT_TIMEOUT_MS = 10_000;

function buildUrl(path: string): string {
  return `${AUTH_BRIDGE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

async function request<T = unknown>(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<BridgeResponse<T>> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(buildUrl(path), { ...init, signal: controller.signal });
    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const body = isJson ? ((await res.json()) as T) : ((await res.text()) as unknown as T);

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error:
          (isJson && (body as unknown as { error?: string })?.error) ||
          `Request failed with status ${res.status}`,
      };
    }

    return { ok: true, status: res.status, data: body };
  } catch (err: any) {
    const aborted = err?.name === "AbortError";
    return {
      ok: false,
      status: aborted ? 408 : 0,
      error: aborted ? "Request timed out" : (err?.message ?? "Network error"),
    };
  } finally {
    clearTimeout(id);
  }
}

/* --------- Basic bridge checks --------- */
export function pingAuthBridge(timeoutMs?: number) {
  return request<{ status?: string }>("/api/health", { method: "GET" }, timeoutMs);
}

/* --------- Google helpers expected by google.ts ---------
   Adjust the paths if your server differs; these are sensible defaults.
----------------------------------------------------------- */

/** GET /api/google/status -> { google: { linked: boolean } } */
async function getStatus() {
  const res = await request<{ google?: { linked?: boolean } }>("/api/google/status", { method: "GET" });
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`);
  return res.data as { google: { linked: boolean } };
}

/** GET /api/google/auth/start -> { url: string } */
async function getAuthStartUrl() {
  const res = await request<{ url: string }>("/api/google/auth/start", { method: "GET" });
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`);
  return res.data as { url: string };
}

/** GET /api/google/calendar/events -> { events: any[] } */
async function listEvents() {
  const res = await request<{ events: unknown[] }>("/api/google/calendar/events", { method: "GET" });
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`);
  return res.data as { events: unknown[] };
}

/** GET /api/google/drive/list?pagesize=10 -> { files: any[] } */
async function driveList(pageSize = 10) {
  const qs = new URLSearchParams({ pagesize: String(pageSize) }).toString();
  const res = await request<{ files: unknown[] }>(`/api/google/drive/list?${qs}`, { method: "GET" });
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`);
  return res.data as { files: unknown[] };
}

/** POST /api/google/drive/folders { name, parentId? } -> { folderId: string } */
async function driveCreateFolder(name: string, parentId?: string) {
  const res = await request<{ folderId: string }>(
    "/api/google/drive/folders",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    }
  );
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`);
  return res.data as { folderId: string };
}

/** GET /api/gmail/messages?max=5&query=... -> { messages: any[] } */
async function gmailList(max = 5, query = "") {
  const qs = new URLSearchParams({ max: String(max), query }).toString();
  const res = await request<{ messages: unknown[] }>(`/api/gmail/messages?${qs}`, { method: "GET" });
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`);
  return res.data as { messages: unknown[] };
}

/** POST /api/gmail/send { to, subject, body } -> { message: string } */
async function gmailSend(to: string, subject: string, body: string) {
  const res = await request<{ message: string }>(
    "/api/gmail/send",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body }),
    }
  );
  if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`);
  return res.data as { message: string };
}

/* --------- public exports --------- */
export { AUTH_BRIDGE_URL, request };

// Keep your existing import style working:
export const AuthBridge = {
  url: AUTH_BRIDGE_URL,
  ping: pingAuthBridge,
  sendCommand: (payload: Json, timeoutMs?: number) =>
    request<Json>("/api/bridge/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    }, timeoutMs),

  // Google methods expected by src/elora/actions/google.ts
  getStatus,
  getAuthStartUrl,
  listEvents,
  driveList,
  driveCreateFolder,
  gmailList,
  gmailSend,
};
// dev-only convenience so we can call it from the browser console
if (typeof window !== "undefined") (window as any).AuthBridge = AuthBridge;
