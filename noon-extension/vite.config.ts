import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function normalizeApiBase(url: string): string {
  return url.trim().replace(/\/$/, "");
}

function apiHostPermission(apiBase: string): string {
  return `${new URL(apiBase).origin}/*`;
}

function extensionEnvPlugin(apiBase: string): Plugin {
  return {
    name: "noon-extension-env",
    buildStart() {
      // Single URL only — no fallback list. Change VITE_API_BASE_URL + rebuild to switch.
      fs.writeFileSync(
        path.resolve(__dirname, "public/apiConfig.js"),
        `const NOON_API_BASE_URL = ${JSON.stringify(apiBase)};\n`,
      );
    },
    closeBundle() {
      const manifestPath = path.resolve(__dirname, "dist/manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
        host_permissions?: string[];
        externally_connectable?: { matches?: string[] };
      };
      const origin = new URL(apiBase).origin;
      const permissions = new Set(manifest.host_permissions || []);
      permissions.add("<all_urls>");
      permissions.add(`${origin}/*`);
      manifest.host_permissions = Array.from(permissions);

      manifest.externally_connectable = { matches: [`${origin}/*`] };

      manifest.content_scripts = manifest.content_scripts?.map((script) => {
        if (!script.js?.includes("dashboardBridge.js")) return script;
        return { ...script, matches: [`${origin}/*`] };
      });

      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const apiBase = normalizeApiBase(env.VITE_API_BASE_URL || "");

  if (!apiBase) {
    throw new Error(
      "VITE_API_BASE_URL is required. Copy noon-extension/.env.example to .env and set your backend URL.",
    );
  }

  try {
    new URL(apiBase);
  } catch {
    throw new Error("VITE_API_BASE_URL must be a valid URL in noon-extension/.env");
  }

  return {
    plugins: [react(), extensionEnvPlugin(apiBase)],
    root: __dirname,
    base: "./",
    build: {
      outDir: "dist",
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: path.resolve(__dirname, "popup.html"),
        } as Record<string, string>,
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name].[ext]",
        },
      },
    },
    publicDir: "public",
  };
});
