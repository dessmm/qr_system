import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow any local network IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  allowedDevOrigins: [
    "192.168.1.18",   // your current IP — update this if your IP changes
  ],
};

export default nextConfig;