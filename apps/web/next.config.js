/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@propflow/shared'],
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
};

module.exports = nextConfig;
