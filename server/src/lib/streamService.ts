import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import path from "node:path";
import type { RequestHandler } from "express";

const STREAM_HOST = "127.0.0.1";

/** Paths that belong to the hotlinking embed/player service. */
export function isStreamPath(pathname: string): boolean {
  return (
    pathname.startsWith("/embed") ||
    pathname.startsWith("/proxy") ||
    pathname.startsWith("/bingr") ||
    pathname.startsWith("/js/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/ads") ||
    pathname.startsWith("/adblocker") ||
    pathname.startsWith("/api/embed") ||
    pathname.startsWith("/api/backup") ||
    pathname.startsWith("/api/vast") ||
    pathname.startsWith("/api/extract") ||
    pathname.startsWith("/api/source-pref") ||
    pathname.startsWith("/api/cache")
  );
}

export function createStreamProxy(port: number): RequestHandler {
  return (req, res) => {
    const headers = { ...req.headers, host: `${STREAM_HOST}:${port}` };
    delete headers["accept-encoding"];

    const preq = http.request(
      {
        hostname: STREAM_HOST,
        port,
        path: req.originalUrl,
        method: req.method,
        headers,
      },
      (pres) => {
        res.writeHead(pres.statusCode ?? 502, pres.headers);
        pres.pipe(res);
      },
    );

    preq.on("error", () => {
      if (!res.headersSent) {
        res
          .status(502)
          .type("text/plain")
          .send("Stream player unavailable");
      } else {
        res.end();
      }
    });

    req.pipe(preq);
  };
}

async function waitForStream(port: number, attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(
          `http://${STREAM_HOST}:${port}/api/health`,
          (res) => {
            res.resume();
            if ((res.statusCode ?? 500) < 500) resolve();
            else reject(new Error(`status ${res.statusCode}`));
          },
        );
        req.on("error", reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error("timeout"));
        });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error(`Stream player did not become ready on port ${port}`);
}

/**
 * Start the hotlinking player as a sibling process (same Render service).
 * Returns the local port it listens on.
 */
export async function startStreamService(
  repoRoot: string,
  port = Number(process.env.HOTLINK_PORT) || 3847,
): Promise<{ port: number; child: ChildProcess }> {
  const cwd = path.join(repoRoot, "hotlinking");
  const child = spawn(process.execPath, ["server.js"], {
    cwd,
    env: {
      ...process.env,
      HOTLINK_PORT: String(port),
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  child.on("exit", (code, signal) => {
    console.error(
      `Stream player exited (code=${code}, signal=${signal})`,
    );
  });

  await waitForStream(port);
  console.log(`Stream player ready on http://${STREAM_HOST}:${port}`);
  return { port, child };
}
