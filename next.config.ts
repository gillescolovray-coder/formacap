import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 15 Mo — couvre les uploads PDF (10 Mo) + marge de sérialisation
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
