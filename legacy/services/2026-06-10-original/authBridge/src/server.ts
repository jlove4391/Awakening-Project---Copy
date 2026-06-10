// src/server.ts
import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";

import { Jobs } from "./queue/JobQueue";
import { PayloadMap, Task, TaskKind } from "../shared/types";

// ---- validators ----
type FsWrite = { path: string; content: string; overwrite?: boolean };
type FsRead = { path: string };
type FsAppend = { path: string; content: string };
type FsDelete = { path: string };
type SystemEcho = { message: string };
type ValidatedPayload = PayloadMap[TaskKind];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function isFsWrite(v: unknown): v is FsWrite {
  return (
    isRecord(v) &&
    typeof v.path === "string" &&
    typeof v.content === "string" &&
    (typeof v.overwrite === "boolean" || typeof v.overwrite === "undefined")
  );
}
function isFsRead(v: unknown): v is FsRead {
  return isRecord(v) && typeof v.path === "string";
}
function isFsAppend(v: unknown): v is FsAppend {
  return isRecord(v) && typeof v.path === "string" && typeof v.content === "string";
}
function isFsDelete(v: unknown): v is FsDelete {
  return isRecord(v) && typeof v.path === "string";
}
function isSystemEcho(v: unknown): v is SystemEcho {
  return isRecord(v) && typeof v.message === "string";
}
function expectedPayloadShape(kind: unknown) {
  switch (kind) {
    case "fs.write":
      return "Expected fs.write payload: { path: string; content: string; overwrite?: boolean }";
    case "fs.read":
      return "Expected fs.read payload: { path: string }";
    case "fs.append":
      return "Expected fs.append payload: { path: string; content: string }";
    case "fs.delete":
      return "Expected fs.delete payload: { path: string }";
    case "system.echo":
      return "Expected system.echo payload: { message: string }";
    default:
      return "Unsupported task kind. Supported kinds: fs.write, fs.read, fs.append, fs.delete, system.echo";
  }
}
function validatePayload(kind: TaskKind, payload: unknown): ValidatedPayload | null {
  switch (kind) {
    case "fs.write":
      return isFsWrite(payload) ? payload : null;
    case "fs.read":
      return isFsRead(payload) ? payload : null;
    case "fs.append":
      return isFsAppend(payload) ? payload : null;
    case "fs.delete":
      return isFsDelete(payload) ? payload : null;
    case "system.echo":
      return isSystemEcho(payload) ? payload : null;
    default:
      return null;
  }
}

const app = express();
app.use(express.json());

// Allow localhost ports and *.tailscale.net by default; override via ALLOWED_ORIGINS
const defaultOrigins = [/^https?:\/\/localhost:\d+$/, /\.tailscale\.net$/];
const allowed =
  process.env.ALLOWED_ORIGINS?.split(",").map(s => s.trim()).filter(Boolean) ?? defaultOrigins;

app.use(
  cors({
    origin: allowed as (string | RegExp)[],
    credentials: false,
  })
);

// Health/Status
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/status", (_req, res) => {
  res.json({
    ok: true,
    queueDepth: Jobs.snapshot().length,
    allowedOrigins: allowed,
  });
});

// Create task
app.post("/tasks", (req, res) => {
  const body = req.body as { kind?: TaskKind; payload?: unknown };
  if (!body?.kind) return res.status(400).json({ ok: false, error: "missing_kind" });

  const validated = validatePayload(body.kind, body.payload);
  if (!validated) {
    return res.status(400).json({
      ok: false,
      error: "invalid_payload",
      details: expectedPayloadShape(body.kind),
    });
  }

  const id = randomUUID();
  const now = Date.now();

  const task: Task = {
    id,
    kind: body.kind,
    owner: "Nexora",
    createdBy: "Elora",
    status: "queued",
    payload: validated,
    timestamps: { created: now },
    logs: [`Created ${new Date(now).toISOString()}`]
  };

  Jobs.enqueue(task);
  res.status(202).json({ ok: true, id, status: task.status });
});

// Get task by id
app.get("/tasks/:id", (req, res) => {
  const t = Jobs.snapshot().find(x => x.id === req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: "not_found" });
  res.json({ ok: true, task: t });
});

// SSE stream
app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeat = setInterval(() => send("heartbeat", { t: Date.now() }), 25000);

  const onUpdate = (task: Task) =>
    send("task.update", { id: task.id, status: task.status, logs: task.logs });

  const onFinish = (task: Task) =>
    send("task.finished", {
      id: task.id,
      status: task.status,
      result: task.result,
      error: task.error,
      audit: task.audit,
      receipt: task.receipt,
    });

  Jobs.events.on("task.update", onUpdate);
  Jobs.events.on("task.finished", onFinish);

  req.on("close", () => {
    clearInterval(heartbeat);
    Jobs.events.off("task.update", onUpdate);
    Jobs.events.off("task.finished", onFinish);
    res.end();
  });
});

const PORT = Number(process.env.PORT || 4317);
const HOST = process.env.HOST || "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on http://${HOST}:${PORT}`);
});
