// Thin client for Nexora actions via your existing BridgeManager.
// Works with your handler by forwarding { action, payload }.

import { postToBridge } from "../system/BridgeManager";

// PLAN: turn a high-level goal into a concrete plan (string/markdown or JSON)
export async function planTask({ goal }) {
  const res = await postToBridge("nexora", "plan", { goal });
  if (res?.error) throw new Error(res.error);
  return res; // expect { plan: string }
}

// IMPLEMENT (sandbox): apply the plan step(s) into a sandbox (no commit)
export async function implementTask({ plan, commit = false } = {}) {
  const res = await postToBridge("nexora", commit ? "commit" : "implement", { plan });
  if (res?.error) throw new Error(res.error);
  return res; // { ok: true } or { committed: true, files: [...] }
}

// DIFF: show proposed file changes from sandbox
export async function getDiff() {
  const res = await postToBridge("nexora", "diff", {});
  if (res?.error) throw new Error(res.error);
  return res; // { diffs: [{ path, patch }] }
}

// TESTS: run your repo/app tests and return pass/fail text
export async function runTests() {
  const res = await postToBridge("nexora", "tests", {});
  if (res?.error) throw new Error(res.error);
  return res; // { passed: boolean, output: string }
}

// STREAM: optional server-sent events via Bridge passthrough (if supported)
export function streamEvents(onEvent) {
  // If your Bridge exposes an SSE endpoint, hook it here; otherwise no-op.
  // Example (adjust pathing to your server):
  const es = new EventSource("/api/nexora/stream");
  es.onmessage = (m) => {
    try { onEvent(JSON.parse(m.data)); } catch { /* ignore */ }
  };
  es.onerror = () => { /* optional backoff */ };
  return () => es.close();
}
