import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createNotificationHandler, notificationOptions } from "./server/notifications.mjs";
import { attachRoomServer, roomOptions, clientAddress } from "./server/room.mjs";
import { createAssistantHandler, assistantOptions } from "./server/assistant.mjs";

export default defineConfig(({ mode }) => {
  // Unprefixed server secrets stay in the Node middleware closure. Vite only
  // exposes VITE_ variables to the browser application.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      tailwindcss(),
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler"]],
        },
      }),
      {
        name: "studio-chat-services",
        configureServer(server) {
          if (!server.httpServer) throw new Error("Studio multiplayer requires an HTTP server");
          const options = roomOptions(env);
          const room = attachRoomServer(server.httpServer, { ...options, allowOtherUpgrades: true });
          server.middlewares.use(createNotificationHandler({ ...notificationOptions(env),
            authorize: (message, request) => room.authorize({ type: "message", roomId: "carters-studio",
              player: { id: message.playerId, name: message.name }, token: message.token,
              message: { id: message.id, text: message.text } }, request),
          }));
          server.middlewares.use(createAssistantHandler({ ...assistantOptions(env),
            authorize: room.authorize, getVisitors: room.visitors,
            getClientAddress: request => clientAddress(request, options.trustedProxyHops),
          }));
        },
        configurePreviewServer(server) {
          if (!server.httpServer) throw new Error("Studio multiplayer requires an HTTP server");
          const options = roomOptions(env);
          const room = attachRoomServer(server.httpServer, { ...options, allowOtherUpgrades: true });
          server.middlewares.use(createNotificationHandler({ ...notificationOptions(env),
            authorize: (message, request) => room.authorize({ type: "message", roomId: "carters-studio",
              player: { id: message.playerId, name: message.name }, token: message.token,
              message: { id: message.id, text: message.text } }, request),
          }));
          server.middlewares.use(createAssistantHandler({ ...assistantOptions(env),
            authorize: room.authorize, getVisitors: room.visitors,
            getClientAddress: request => clientAddress(request, options.trustedProxyHops),
          }));
        },
      },
    ],
  };
});
