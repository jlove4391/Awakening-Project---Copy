// src/index.ts
import "dotenv/config";
import express from "express";
import http from "http";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";

import { requireToken } from "./auth.js";
import { statusRouter } from "./routes/status.js";
import { fsRouter } from "./routes/fs.js";
import { execRouter } from "./routes/exec.js";
import { gitRouter } from "./routes/git.js";
import { initWS } from "./ws.js";
import { getAllowedOrigins, getBridgeRoot, getRequiredToken, isDevAuthAllowed, isOriginAllowed } from "./security.js";

const app = express();

app.use(cors({
  origin(origin, callback) {
    if (isOriginAllowed(origin)) return callback(null, true);
    return callback(new Error(`Origin not allowed: ${origin}`));
  },
  credentials: false,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));

app.use(requireToken);

app.use("/status", statusRouter());
app.use("/fs", fsRouter());
app.use("/git", gitRouter());

const server = http.createServer(app);
const hub = initWS(server);
app.use("/exec", execRouter(hub));

app.use((_req, res) => res.status(404).json({ ok: false, error: "Not found" }));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err?.message || "Internal error";
  if (message.startsWith("Origin not allowed:")) {
    return res.status(403).json({ ok: false, error: message });
  }
  console.error(err);
  return res.status(500).json({ ok: false, error: message });
});

const port = Number(process.env.PORT || 4317);
server.listen(port, () => {
  const authMode = isDevAuthAllowed() ? "dev bypass" : getRequiredToken() ? "token required" : "token missing";
  console.log(`[vscodeBridge] listening on http://localhost:${port}`);
  console.log(`[vscodeBridge] auth: ${authMode}`);
  console.log(`[vscodeBridge] root: ${getBridgeRoot()}`);
  console.log(`[vscodeBridge] allowed origins: ${getAllowedOrigins().join(", ")}`);
});
