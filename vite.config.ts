import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createNotificationHandler, notificationOptions } from "./server/notifications.mjs";

export default defineConfig(({ mode }) => {
  // Unprefixed Pushover values stay in the Node middleware closure. Vite only
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
        name: "studio-chat-notifications",
        configureServer(server) {
          server.middlewares.use(createNotificationHandler(notificationOptions(env)));
        },
        configurePreviewServer(server) {
          server.middlewares.use(createNotificationHandler(notificationOptions(env)));
        },
      },
    ],
  };
});
