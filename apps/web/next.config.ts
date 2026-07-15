import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Les packages internes sont consommés en source TypeScript (pattern "just-in-time").
  transpilePackages: ['@atelier/shared'],
};

export default nextConfig;
