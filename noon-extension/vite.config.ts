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
      const permission = apiHostPermission(apiBase);
      const permissions = new Set(manifest.host_permissions || []);
      permissions.add("<all_urls>");
      permissions.delete("http://127.0.0.1:8000/*");
      permissions.delete("http://localhost:8000/*");
      permissions.add(permission);
      manifest.host_permissions = Array.from(permissions);

      const origin = new URL(apiBase).origin;
      const matches = new Set(manifest.externally_connectable?.matches || []);
      matches.add(`${origin}/*`);
      matches.add("http://127.0.0.1:8000/*");
      matches.add("http://localhost:8000/*");
      manifest.externally_connectable = { matches: Array.from(matches) };

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
