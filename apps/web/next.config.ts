import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dynamic by default: a page opts into caching with 'use cache'. See
  // context/epic-lebowski/rendering-strategies.md.
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  experimental: {
    // No anonymous feedback from `next dev` about how agents use Next.
    agentFeedback: false,
  },
};

export default nextConfig;
