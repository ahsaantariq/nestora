import http from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.env.PORT || 8090);
const appBase = (process.env.APP_BASE_URL || "").replace(/\/$/, "");
const bridge = process.env.VOICE_BRIDGE_SECRET || "";

if (!appBase || !bridge) {
  console.error("Set APP_BASE_URL and VOICE_BRIDGE_SECRET before starting the voice relay.");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const sockets = new WebSocketServer({ server, path: "/relay" });

sockets.on("connection", (socket) => {
  let callSid = "";
  let from = "";
  let to = "";
  let busy = false;

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (message.type === "setup") {
      callSid = String(message.callSid || "");
      from = String(message.from || "");
      to = String(message.to || "");
      return;
    }
    if (message.type !== "prompt" || message.last === false || busy) return;
    busy = true;
    void turn(socket, { callSid, from, to, text: String(message.voicePrompt || "") }).finally(() => {
      busy = false;
    });
  });
});

async function turn(socket, input) {
  try {
    const response = await fetch(`${appBase}/api/assistant/voice-turn`, {
      method: "POST",
      headers: { authorization: `Bearer ${bridge}`, "content-type": "application/json" },
      body: JSON.stringify({ ...input, final: true }),
    });
    const data = await response.json();
    const say = typeof data.say === "string" ? data.say : "";
    if (say) socket.send(JSON.stringify({ type: "text", token: say, last: true }));
    if (data.handoff) socket.send(JSON.stringify({ type: "end", handoffData: JSON.stringify({ reason: "human" }) }));
  } catch {
    socket.send(JSON.stringify({ type: "text", token: "I lost the connection for a moment. I'll try to reach a teammate.", last: true }));
    socket.send(JSON.stringify({ type: "end", handoffData: JSON.stringify({ reason: "error" }) }));
  }
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Nestora voice relay listening on ${port}`);
});
