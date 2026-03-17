import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: path.resolve(__dirname, ".."),
    resolveAlias: {
      "@engine": path.resolve(__dirname, "../engine"),
      "@engine-wasm": path.resolve(__dirname, "../engine-wasm"),
    },
  },
};

export default nextConfig;
