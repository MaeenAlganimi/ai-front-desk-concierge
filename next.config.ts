import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "ws", "pg", "@neondatabase/serverless"],
};
export default nextConfig;
