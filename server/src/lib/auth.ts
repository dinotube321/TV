import { SignJWT, jwtVerify } from "jose";
import { config } from "./config.js";

const encoder = new TextEncoder();

function adminKey() {
  return encoder.encode(config.adminJwtSecret);
}

function siteKey() {
  return encoder.encode(config.siteJwtSecret);
}

export async function signAdminToken() {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("pulse-admin")
    .setAudience("pulse-admin")
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(adminKey());
}

export async function verifyAdminToken(token: string) {
  const { payload } = await jwtVerify(token, adminKey(), {
    issuer: "pulse-admin",
    audience: "pulse-admin",
  });
  if (payload.role !== "admin") throw new Error("Not an admin token");
  return payload;
}

export async function signSiteToken(user: {
  id: string;
  userId: string;
  tokenVersion?: number;
}) {
  return new SignJWT({
    role: "user",
    sub: user.id,
    userId: user.userId,
    ver: user.tokenVersion ?? 0,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("pulse-site")
    .setAudience("pulse-site")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(siteKey());
}

export async function verifySiteToken(token: string) {
  const { payload } = await jwtVerify(token, siteKey(), {
    issuer: "pulse-site",
    audience: "pulse-site",
  });
  if (payload.role !== "user" || typeof payload.sub !== "string") {
    throw new Error("Not a user token");
  }
  return payload as typeof payload & {
    sub: string;
    userId?: string;
    ver?: number;
  };
}
