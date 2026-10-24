/**
 * Static server for the Vite build, intended for Deno Deploy.
 * Serves ./dist and falls back to index.html so client-side routes work on refresh.
 * Holds no secrets and makes no outbound calls.
 */
import { serveDir, serveFile } from "@std/http/file-server";

const DIST = "./dist";

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const response = await serveDir(req, {
    fsRoot: DIST,
    quiet: true,
    showDirListing: false,
    enableCors: false,
  });

  if (response.status !== 404) return response;

  // Client-side route (no file extension): hand off to the SPA shell.
  const { pathname } = new URL(req.url);
  if (!pathname.split("/").pop()?.includes(".")) {
    return serveFile(req, `${DIST}/index.html`);
  }

  return response;
});
