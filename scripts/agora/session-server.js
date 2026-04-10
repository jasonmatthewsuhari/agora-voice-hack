const fs = require("fs");
const http = require("http");
const path = require("path");
const {
  createJsonResponse,
  parseJsonBody,
  startSession,
  stopSession,
} = require("./agora-service");
const { loadEnvFile } = require("./load-env");

loadEnvFile();

const port = Number(process.env.AGORA_SESSION_SERVER_PORT || 8080);

const VOICE_HTML = path.join(__dirname, "talk", "agora_voice.html");
const AGORA_WEB_SDK = path.join(
  __dirname,
  "..",
  "..",
  "node_modules",
  "agora-rtc-sdk-ng",
  "AgoraRTC_N-production.js"
);

function pathnameOnly(url) {
  if (!url) {
    return "/";
  }
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function sendBinary(res, status, contentType, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Missing file: ${filePath}`);
    return;
  }
  res.writeHead(status, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(res);
}

function send(res, response) {
  res.writeHead(response.statusCode, response.headers);
  res.end(response.body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const route = pathnameOnly(req.url);

    if (req.method === "GET" && route === "/health") {
      send(
        res,
        createJsonResponse(200, { ok: true, service: "agora-session-server" })
      );
      return;
    }

    if (req.method === "GET" && (route === "/" || route === "/agora-voice")) {
      sendBinary(res, 200, "text/html; charset=utf-8", VOICE_HTML);
      return;
    }

    if (req.method === "GET" && route === "/static/agora-rtc.js") {
      sendBinary(res, 200, "application/javascript; charset=utf-8", AGORA_WEB_SDK);
      return;
    }

    if (req.method === "POST" && route === "/api/agora/session/start") {
      const result = await startSession(await readRequestBody(req));
      send(res, createJsonResponse(200, result));
      return;
    }

    if (req.method === "POST" && route === "/api/agora/session/stop") {
      const body = parseJsonBody(await readRequestBody(req));
      const result = await stopSession({
        agentId: body.agentId,
        channel: body.channel,
        agentUid: body.agentUid,
        agentTokenExpirySeconds: body.agentTokenExpirySeconds,
      });
      send(res, createJsonResponse(200, result));
      return;
    }

    send(
      res,
      createJsonResponse(404, {
        error: "Not found",
        routes: [
          "GET /health",
          "GET /agora-voice",
          "GET /static/agora-rtc.js",
          "POST /api/agora/session/start",
          "POST /api/agora/session/stop",
        ],
      })
    );
  } catch (error) {
    send(
      res,
      createJsonResponse(400, {
        error: error.message,
      })
    );
  }
});

server.listen(port, () => {
  console.log(`Agora session server listening on http://localhost:${port}`);
  console.log(`In-Godot voice page: http://localhost:${port}/agora-voice`);
});
