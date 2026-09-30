/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * In dev, `next dev` uses webpack and splits code into numbered chunks (e.g. 948.js).
   * Hot reload or a second `next dev` on the same app can leave a stale manifest →
   * "Cannot find module './948.js'". Prefer `npm run dev` (Turbopack) or `npm run dev:clean`.
   */
};

module.exports = nextConfig;
