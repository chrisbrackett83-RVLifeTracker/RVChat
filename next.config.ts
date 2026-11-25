import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cursor agent previews often hit 127.0.0.1 while Next binds localhost.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Cursor identity helper imports ./identity.dev.js (TS ESM); resolve to .ts
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
