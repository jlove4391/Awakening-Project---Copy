import { Router } from "express";
import { spawn } from "child_process";
import { nanoid } from "nanoid";
import { envFlag, isCommandAllowed, safeResolveUnderRoot } from "../security.js";

type Running = {
  proc: ReturnType<typeof spawn>;
  channelId: string;
};

function assertStringArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("args must be an array of strings");
  }
  return value;
}

export function execRouter(wsHub: { broadcast: (ch: string, data: any) => void; createChannelId: () => string }) {
  const r = Router();
  const running = new Map<string, Running>();

  r.post("/run", (req, res) => {
    try {
      if (!envFlag("VSCODE_BRIDGE_ALLOW_EXEC", false)) {
        return res.status(403).json({ ok: false, error: "Command execution is disabled" });
      }

      const { cmd, args, cwd = ".", env = {} } = req.body as {
        cmd?: string; args?: unknown; cwd?: string; env?: Record<string, string>;
      };
      if (!cmd) return res.status(400).json({ ok: false, error: "Missing cmd" });
      if (!isCommandAllowed(cmd)) {
        return res.status(403).json({ ok: false, error: "Command is not allowlisted" });
      }

      const resolvedCwd = safeResolveUnderRoot(cwd);
      const safeArgs = assertStringArray(args);
      const requestEnv = envFlag("VSCODE_BRIDGE_ALLOW_REQUEST_ENV", false) && env && typeof env === "object" ? env : {};

      const id = nanoid(10);
      const channelId = wsHub.createChannelId();

      const proc = spawn(cmd, safeArgs, {
        cwd: resolvedCwd,
        env: { ...process.env, ...requestEnv },
        shell: envFlag("VSCODE_BRIDGE_ALLOW_SHELL", false),
      });
      running.set(id, { proc, channelId });

      proc.stdout.on("data", (d) => wsHub.broadcast(channelId, { type: "stdout", id, chunk: d.toString() }));
      proc.stderr.on("data", (d) => wsHub.broadcast(channelId, { type: "stderr", id, chunk: d.toString() }));
      proc.on("error", (err) => wsHub.broadcast(channelId, { type: "error", id, error: err.message }));

      proc.on("close", (code, signal) => {
        wsHub.broadcast(channelId, { type: "close", id, code, signal });
        running.delete(id);
      });

      return res.json({ ok: true, id, channel: channelId });
    } catch (e: any) {
      return res.status(400).json({ ok: false, error: e.message });
    }
  });

  r.post("/kill", (req, res) => {
    const { id } = req.body as { id: string };
    const entry = running.get(id);
    if (!entry) return res.status(404).json({ ok: false, error: "Not found" });
    entry.proc.kill("SIGTERM");
    return res.json({ ok: true });
  });

  return r;
}
