/** @type {import('next').NextConfig} */
const basePath = '/TrueCalc';

const nextConfig = {
    output: 'export',
    basePath,
    env: {
        NEXT_PUBLIC_BASE_PATH: basePath,
    },
    images: {
        unoptimized: true,
    },
};

module.exports = nextConfig;
