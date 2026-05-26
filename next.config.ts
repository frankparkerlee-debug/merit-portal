import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Render's filesystem is ephemeral; the standalone output makes Render
  // deploys faster + smaller.
  output: "standalone",

  // Strict mode catches React anti-patterns early
  reactStrictMode: true,

  // Allow Shopify CDN images on the patient-facing screens we might render
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.shopify.com" },
      { protocol: "https", hostname: "meritsciences.com" },
    ],
  },

  // Audit/HIPAA: don't leak the X-Powered-By header
  poweredByHeader: false,
};

export default nextConfig;
