import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Les packages internes sont consommés en source TypeScript (pattern "just-in-time").
  transpilePackages: [
    '@atelier/config',
    '@atelier/core',
    '@atelier/db',
    '@atelier/integrations',
    '@atelier/shared',
  ],
  // Driver pg côté serveur uniquement, hors bundling.
  serverExternalPackages: ['pg'],
};

export default nextConfig;
