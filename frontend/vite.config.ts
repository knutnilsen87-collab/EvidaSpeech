import { defineConfig } from "vitest/config";
import { readBuildStamp } from "./buildStamp";

const stamp = readBuildStamp();
// start.ps1 setter adressen fra evidaspeech.local.json. Standard: saksrom-api på 8080.
const apiUrl = process.env.EVIDASPEECH_API_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(stamp.commit),
    __BUILD_DIRTY__: JSON.stringify(stamp.dirty),
    __BUILD_TIME__: JSON.stringify(stamp.time)
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": apiUrl
    }
  },
  preview: { host: "127.0.0.1", port: 4174, strictPort: true },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"]
  }
});
