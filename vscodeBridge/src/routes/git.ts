import { Router } from "express";
import { spawnSync } from "child_process";
import { envFlag, safeResolveUnderRoot } from "../security.js";

function runGit(args: string[], cwd?: string) {
  const safeCwd = safeResolveUnderRoot(cwd || ".");
  const out = spawnSync("git", args, { cwd: safeCwd, encoding: "utf8", shell: false });
  if (out.status !== 0) throw new Error(out.stderr || "git failed");
  return out.stdout;
}

export function gitRouter() {
  const r = Router();
  r.get("/status", (req, res) => {
    try {
      const cwd = String(req.query.cwd || ".");
      const status = runGit(["status", "--porcelain=v1", "-b"], cwd);
      res.json({ ok: true, status });
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });
  r.post("/commit", (req, res) => {
    try {
      if (!envFlag("VSCODE_BRIDGE_ALLOW_GIT_WRITE", false)) {
        return res.status(403).json({ ok: false, error: "Git writes are disabled" });
      }

      const { cwd, message } = req.body as { cwd?: string; message: string };
      if (!message) throw new Error("Missing commit message");
      runGit(["add", "-A"], cwd);
      const out = runGit(["commit", "-m", message], cwd);
      return res.json({ ok: true, out });
    } catch (e: any) {
      return res.status(400).json({ ok: false, error: e.message });
    }
  });
  return r;
}
