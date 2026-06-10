import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { getRequiredToken, isDevAuthAllowed } from "./security.js";

function extractBearerToken(req: Request): string | null {
  const header = req.header("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function sameToken(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function requireToken(req: Request, res: Response, next: NextFunction) {
  if (isDevAuthAllowed()) return next();

  const expected = getRequiredToken();
  if (!expected) {
    return res.status(503).json({
      ok: false,
      error: "vscodeBridge token is required. Set VSCODE_BRIDGE_TOKEN or ALLOW_DEV=1 for local-only development.",
    });
  }

  const actual = extractBearerToken(req);
  if (!actual || !sameToken(actual, expected)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  return next();
}
