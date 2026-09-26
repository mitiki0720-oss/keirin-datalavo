import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  fetchWithRetry,
  isRetryableHttpStatus,
} from "./lib/fetch-with-retry.mjs";

const requestCounts = new Map();
const server = createServer((request, response) => {
  const path = request.url ?? "/";
  requestCounts.set(path, (requestCounts.get(path) ?? 0) + 1);

  if (path === "/transient" && requestCounts.get(path) < 3) {
    request.socket.destroy();
    return;
  }
  if (path === "/not-found") {
    response.writeHead(404).end("missing");
    return;
  }
  if (path === "/forbidden") {
    response.writeHead(403).end("forbidden");
    return;
  }
  if (path === "/timeout") return;
  if (path === "/server-error" && requestCounts.get(path) < 2) {
    response.writeHead(503).end("retry");
    return;
  }
  response.writeHead(200, { "content-type": "text/plain" }).end("ok");
});

server.listen(0, "127.0.0.1");
await once(server, "listening");

try {
  const address = server.address();
  assert(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const options = { attempts: 3, timeoutMs: 1_000, retryDelayMs: 1 };

  const transient = await fetchWithRetry(`${baseUrl}/transient`, {}, options);
  assert.equal(transient.status, 200);
  assert.equal(requestCounts.get("/transient"), 3);

  const serverError = await fetchWithRetry(`${baseUrl}/server-error`, {}, options);
  assert.equal(serverError.status, 200);
  assert.equal(requestCounts.get("/server-error"), 2);

  const notFound = await fetchWithRetry(`${baseUrl}/not-found`, {}, options);
  assert.equal(notFound.status, 404);
  assert.equal(requestCounts.get("/not-found"), 1);

  const forbidden = await fetchWithRetry(`${baseUrl}/forbidden`, {}, options);
  assert.equal(forbidden.status, 403);
  assert.equal(requestCounts.get("/forbidden"), 1);

  await assert.rejects(
    fetchWithRetry(`${baseUrl}/timeout`, {}, {
      attempts: 2,
      timeoutMs: 25,
      retryDelayMs: 1,
    }),
  );
  assert.equal(requestCounts.get("/timeout"), 2);

  assert.equal(isRetryableHttpStatus(408), true);
  assert.equal(isRetryableHttpStatus(429), true);
  assert.equal(isRetryableHttpStatus(503), true);
  assert.equal(isRetryableHttpStatus(403), false);
  assert.equal(isRetryableHttpStatus(404), false);

  console.log(JSON.stringify({
    status: "PASS",
    transientAttempts: requestCounts.get("/transient"),
    serverErrorAttempts: requestCounts.get("/server-error"),
    notFoundAttempts: requestCounts.get("/not-found"),
    forbiddenAttempts: requestCounts.get("/forbidden"),
    timeoutAttempts: requestCounts.get("/timeout"),
  }, null, 2));
} finally {
  server.close();
  await once(server, "close");
}
