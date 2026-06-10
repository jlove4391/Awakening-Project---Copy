import { WebSocketServer, WebSocket } from "ws";
import { nanoid } from "nanoid";
import http from "http";
import { getRequiredToken, isDevAuthAllowed } from "./security.js";

type Channel = {
  id: string;
  sockets: Set<WebSocket>;
};

const channels = new Map<string, Channel>();

export function initWS(server: http.Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    const expected = getRequiredToken();

    if (!isDevAuthAllowed() && (!expected || token !== expected)) {
      ws.close(1008, "Unauthorized");
      return;
    }

    let joined: Channel | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === "join" && typeof msg.channel === "string") {
          const id = msg.channel;
          if (!channels.has(id)) channels.set(id, { id, sockets: new Set() });
          joined = channels.get(id)!;
          joined.sockets.add(ws);
          ws.send(JSON.stringify({ type: "joined", channel: id }));
        }
      } catch {}
    });

    ws.on("close", () => {
      if (joined) joined.sockets.delete(ws);
    });
  });

  return {
    broadcast(channelId: string, data: any) {
      const channel = channels.get(channelId);
      if (!channel) return;
      const payload = JSON.stringify(data);
      for (const s of channel.sockets) {
        if (s.readyState === s.OPEN) s.send(payload);
      }
    },
    createChannelId() {
      return nanoid(12);
    }
  };
}
