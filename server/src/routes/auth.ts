import { Router } from "express";
import { signSiteToken, verifySiteToken } from "../lib/auth.js";
import { rateLimit } from "../lib/rateLimit.js";
import {
  authenticateUser,
  createUser,
  findUserById,
  publicUser,
} from "../lib/users.js";
import {
  getContinueWatching,
  putContinueWatching,
  removeContinueWatchingEntry,
  upsertContinueWatchingEntry,
} from "../lib/continueWatchingStore.js";
import {
  requireSiteUser,
  type AuthedRequest,
} from "../middleware/requireSiteUser.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many auth attempts. Try again in a few minutes.",
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many signups from this network. Try again later.",
});

authRouter.post("/signup", authLimiter, signupLimiter, async (req, res) => {
  const { userId, password } = req.body as {
    userId?: string;
    password?: string;
  };
  try {
    const user = await createUser(String(userId ?? ""), String(password ?? ""));
    const token = await signSiteToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Signup failed";
    // Soften enumeration for "taken" while keeping validation errors useful
    if (msg.includes("already taken")) {
      res.status(400).json({ error: "Unable to create account with that user ID." });
      return;
    }
    res.status(400).json({ error: msg });
  }
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const { userId, password } = req.body as {
    userId?: string;
    password?: string;
  };
  if (!userId || !password) {
    res.status(400).json({ error: "User ID and password are required." });
    return;
  }
  const user = await authenticateUser(String(userId), String(password));
  if (!user) {
    res.status(401).json({ error: "Invalid user ID or password." });
    return;
  }
  const token = await signSiteToken(user);
  res.json({ token, user: publicUser(user) });
});

authRouter.get("/me", async (req, res) => {
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
    res.json({ user: publicUser(user) });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});

const continueLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: "Too many continue-watching updates. Try again shortly.",
});

authRouter.get(
  "/continue-watching",
  requireSiteUser,
  async (req: AuthedRequest, res) => {
    const entries = await getContinueWatching(req.siteUserId!);
    res.json({ entries });
  },
);

authRouter.put(
  "/continue-watching",
  requireSiteUser,
  continueLimiter,
  async (req: AuthedRequest, res) => {
    const body = req.body as { entries?: unknown };
    const entries = await putContinueWatching(
      req.siteUserId!,
      Array.isArray(body.entries) ? body.entries : [],
    );
    res.json({ entries });
  },
);

authRouter.post(
  "/continue-watching",
  requireSiteUser,
  continueLimiter,
  async (req: AuthedRequest, res) => {
    const entries = await upsertContinueWatchingEntry(
      req.siteUserId!,
      req.body || {},
    );
    res.json({ entries });
  },
);

authRouter.delete(
  "/continue-watching/:id",
  requireSiteUser,
  continueLimiter,
  async (req: AuthedRequest, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) {
      res.status(400).json({ error: "Missing id" });
      return;
    }
    const entries = await removeContinueWatchingEntry(req.siteUserId!, id);
    res.json({ entries });
  },
);
