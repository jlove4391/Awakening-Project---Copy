// src/nexora/actions/vscode.ts
// If you already have a class wrapper ("VsCodeBridge"), keep it—but the key is that
// each method posts { action, ...payload } to the backend and returns JSON.
// Below is a direct implementation using your existing bridge class import.

import { VsCodeBridge } from "../../bridge/VsCodeBridge"; // your thin HTTP client
const bridge = new VsCodeBridge(); // should read base URL from env/config

type RunOpts = {
  cwd?: string;
  env?: Record<string, string>;
  onLog?: (line: string, kind: "stdout" | "stderr" | "meta") => void;
};

export const VsCodeActions = {
  // health/status + capabilities
  check: () => bridge.status(), // POST { action: "status" }

  // fs
  listDir: (p = ".") => bridge.list(p), // POST { action: "list", path: p }
  readFile: (p: string) => bridge.read(p), // POST { action: "read", path: p }
  writeFile: (p: string, d: string) => bridge.write(p, d), // POST { action: "write", path: p, data: d }
  mkdir: (p: string) => bridge.mkdir(p), // POST { action: "mkdir", path: p }

  // git (optional)
  gitStatus: (cwd = ".") => bridge.gitStatus(cwd), // POST { action: "gitStatus", cwd }
  gitCommit: (msg: string, cwd = ".") => bridge.gitCommit(msg, cwd), // POST { action: "gitCommit", message: msg, cwd }

  // run a command and stream the result to UI
  async runCmd(cmd: string, args: string[] = [], opts: RunOpts = {}) {
    const { cwd = ".", env = {}, onLog } = opts;
    const r = await bridge.run(cmd, args, { cwd, env }); // POST { action: "run", cmd, args, cwd, env }
    if (r?.stderr) onLog?.(r.stderr.trim(), "stderr");
    if (r?.stdout) onLog?.(r.stdout.trim(), "stdout");
    onLog?.(`exit ${typeof r?.code === "number" ? r.code : "?"}`, "meta");
    return r;
  },
};
