// authBridge/ai/handlers/vscodeHandler.js
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----- Workspace root (edit if needed) -----
// By default we treat the process working dir as the root that Nex can touch.
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT
  ? path.resolve(process.env.WORKSPACE_ROOT)
  : process.cwd();

// Normalize & guard against traversal
function safePath(p) {
  const abs = path.resolve(WORKSPACE_ROOT, p || ".");
  if (!abs.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Path escapes workspace root");
  }
  return abs;
}

async function readFileSafe(p) {
  const full = safePath(p);
  return fs.promises.readFile(full, "utf-8");
}

async function writeFileSafe(p, data) {
  const full = safePath(p);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, data ?? "", "utf-8");
  return full;
}

async function listDirSafe(p = ".") {
  const full = safePath(p);
  const items = await fs.promises.readdir(full, { withFileTypes: true });
  return items.map((d) => ({
    name: d.name,
    type: d.isDirectory() ? "dir" : "file",
  }));
}

async function mkdirSafe(p) {
  const full = safePath(p);
  await fs.promises.mkdir(full, { recursive: true });
  return full;
}

function runCommand({ cmd, args = [], cwd = ".", env = {} }) {
  const cwdSafe = safePath(cwd);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: cwdSafe,
      shell: false,
      env: { ...process.env, ...env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => reject(err));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

// ----- Minimal git helpers (optional) -----
async function gitStatus(cwd = ".") {
  return runCommand({ cmd: "git", args: ["status", "--porcelain", "-b"], cwd });
}

async function gitCommit(message, cwd = ".") {
  // stage all + commit (basic helper; expand as needed)
  await runCommand({ cmd: "git", args: ["add", "-A"], cwd });
  return runCommand({ cmd: "git", args: ["commit", "-m", message], cwd });
}

// ---------------------------------------------------------------------------

export default async function vscodeHandler(req, res) {
  const { action, path: p, data, filename, content, cwd, cmd, args, env, message } =
    req.body || {};

  try {
    switch (action) {
      case "status": {
        // Bridge status + workspace info
        const repo = fs.existsSync(safePath(".git"));
        return res.json({
          ok: true,
          workspaceRoot: WORKSPACE_ROOT,
          repo: { linked: repo },
          fs: { read: true, write: true, sandbox: true },
        });
      }

      case "list": {
        const list = await listDirSafe(p ?? cwd ?? ".");
        return res.json({ ok: true, cwd: p ?? cwd ?? ".", list });
      }

      case "read": {
        const out = await readFileSafe(p || filename);
        return res.json({ ok: true, path: p || filename, data: out });
      }

      case "write": {
        const full = await writeFileSafe(p || filename, data ?? content ?? "");
        return res.json({ ok: true, path: path.relative(WORKSPACE_ROOT, full) });
      }

      case "mkdir": {
        const full = await mkdirSafe(p);
        return res.json({ ok: true, path: path.relative(WORKSPACE_ROOT, full) });
      }

      case "run": {
        if (!cmd) return res.status(400).json({ ok: false, error: "Missing cmd" });
        const result = await runCommand({ cmd, args, cwd, env });
        return res.json({ ok: true, ...result });
      }

      case "gitStatus": {
        const result = await gitStatus(cwd || ".");
        return res.json({ ok: true, ...result });
      }

      case "gitCommit": {
        if (!message) return res.status(400).json({ ok: false, error: "Missing message" });
        const result = await gitCommit(message, cwd || ".");
        return res.json({ ok: true, ...result });
      }

      default:
        return res.status(400).json({ ok: false, error: "Invalid VS Code action" });
    }
  } catch (error) {
    console.error("VSCodeHandler Error:", error);
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}
