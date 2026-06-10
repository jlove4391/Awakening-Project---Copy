import { Router } from "express";
import { getAllowedCommands, getAllowedOrigins, getBridgeRoot, getRequiredToken, envFlag, isDevAuthAllowed } from "../security.js";

export function statusRouter() {
  const r = Router();
  r.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "vscode-bridge",
      version: "1.0.0",
      cwd: process.cwd(),
      root: getBridgeRoot(),
      auth: isDevAuthAllowed() ? "dev" : getRequiredToken() ? "token" : "missing_token",
      allowedOrigins: getAllowedOrigins(),
      execEnabled: envFlag("VSCODE_BRIDGE_ALLOW_EXEC", false),
      allowedCommands: Array.from(getAllowedCommands()),
      gitWritesEnabled: envFlag("VSCODE_BRIDGE_ALLOW_GIT_WRITE", false),
    });
  });
  return r;
}
