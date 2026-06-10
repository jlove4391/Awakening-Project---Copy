import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import { safeResolveUnderRoot } from "../security.js";

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${name}`);
  return value;
}

export function fsRouter() {
  const r = Router();

  r.get("/list", async (req, res) => {
    try {
      const dir = safeResolveUnderRoot(String(req.query.path || "."));
      const entries = await fs.readdir(dir, { withFileTypes: true });
      res.json({
        ok: true,
        items: entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? "dir" : "file"
        }))
      });
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  r.get("/read", async (req, res) => {
    try {
      const requestedPath = requireString(req.query.path, "path");
      const file = safeResolveUnderRoot(requestedPath);
      const data = await fs.readFile(file, "utf8");
      res.json({ ok: true, path: requestedPath, data });
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  r.post("/write", async (req, res) => {
    try {
      const { path: requestedPath, data } = req.body as { path?: string; data?: string };
      const p = requireString(requestedPath, "path");
      if (typeof data !== "string") throw new Error("Missing data");

      const file = safeResolveUnderRoot(p);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, data, "utf8");
      res.json({ ok: true, path: p });
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  r.post("/mkdir", async (req, res) => {
    try {
      const { path: requestedPath } = req.body as { path?: string };
      const p = requireString(requestedPath, "path");
      await fs.mkdir(safeResolveUnderRoot(p), { recursive: true });
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ ok: false, error: e.message });
    }
  });

  return r;
}
