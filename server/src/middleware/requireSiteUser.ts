import type { Request, Response, NextFunction } from "express";
import { verifySiteToken } from "../lib/auth.js";
import { findUserById } from "../lib/users.js";

export type AuthedRequest = Request & {
  siteUserId?: string;
};

export async function requireSiteUser(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const payload = await verifySiteToken(header.slice(7));
    const user = await findUserById(payload.sub);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    const ver = typeof payload.ver === "number" ? payload.ver : 0;
    if (ver !== (user.tokenVersion ?? 0)) {
      res.status(401).json({ error: "Session expired" });
      return;
    }
    req.siteUserId = user.id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
