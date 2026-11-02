/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone only when explicitly requested (e.g. custom Docker builds)
  output: process.env.NEXT_OUTPUT_STANDALONE === 'true' ? 'standalone' : undefined,
};

export default nextConfig;
