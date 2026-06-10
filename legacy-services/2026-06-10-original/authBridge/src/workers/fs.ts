// src/workers/fs.ts
import fs from "fs/promises";
import path from "path";
import { Task } from "../../shared/types";

const ROOT = path.resolve(__dirname, "../../"); // adjust if you want a different root

function withinRoot(target: string, root: string) {
  const normalizedRoot = path.resolve(root) + path.sep;
  const resolvedTarget = path.resolve(target);
  return resolvedTarget.startsWith(normalizedRoot);
}

export async function writeFile(task: Task<"fs.write">) {
  const rel = task.payload.path;
  const target = path.resolve(ROOT, rel);
  if (!withinRoot(target, ROOT)) throw new Error("Path escapes ROOT");

  await fs.mkdir(path.dirname(target), { recursive: true });

  const exists = await fs.access(target).then(() => true).catch(() => false);
  if (exists && task.payload.overwrite === false) {
    throw new Error("File exists and overwrite=false");
  }

  await fs.writeFile(target, task.payload.content, "utf8");
  return { ok: true, path: target };
}

export async function readFile(task: Task<"fs.read">) {
  const rel = task.payload.path;
  const target = path.resolve(ROOT, rel);
  if (!withinRoot(target, ROOT)) throw new Error("Path escapes ROOT");

  const data = await fs.readFile(target, "utf8");
  return { ok: true, path: target, content: data };
}
