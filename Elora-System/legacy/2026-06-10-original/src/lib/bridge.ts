// frontend/src/lib/bridge.ts
const BASE = "/fs"; // since you exposed bridge at /fs on the same host via tailscale serve

export async function createTask<T extends string>(kind: T, payload: any) {
  const res = await fetch(`${BASE}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, payload }),
  });
  if (!res.ok) throw new Error(`Bridge error: ${res.status}`);
  return res.json() as Promise<{ ok: true; id: string; status: string }>;
}

export function subscribeEvents(onEvent: (evt: MessageEvent) => void) {
  const es = new EventSource(`${BASE}/events`, { withCredentials: false });
  es.onmessage = onEvent;      // default
  es.addEventListener("task.update", onEvent as any);
  es.addEventListener("task.finished", onEvent as any);
  return () => es.close();
}
