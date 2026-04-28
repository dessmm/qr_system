import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow any local network IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  allowedDevOrigins: [
    "192.168.100.199",   // your current IP
    /^192\.168\.\d+\.\d+$/,   // entire 192.168.x.x subnet
    /^10\.\d+\.\d+\.\d+$/,    // 10.x.x.x subnet
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/, // 172.16-31.x.x subnet
  ] as any,
};

export default nextConfig;