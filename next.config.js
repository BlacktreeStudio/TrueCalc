/** @type {import('next').NextConfig} */
// Keep basePath a plain string literal: actions/configure-pages rewrites this
// property in CI and produces invalid JS for shorthand (`basePath,`).
const nextConfig = {
    output: 'export',
    basePath: '/TrueCalc',
    env: {
        NEXT_PUBLIC_BASE_PATH: '/TrueCalc',
    },
    images: {
        unoptimized: true,
    },
};

module.exports = nextConfig;
