/* eslint-env node */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const moduleExports = {
  experimental: {
    // Add the "@sentry/profiling-node" to serverComponentsExternalPackages.
    serverComponentsExternalPackages: ["@sentry/profiling-node"],
  },
  transpilePackages: ["@bleu/gql"],
  reactStrictMode: true,
  swcMinify: true,
  /**
   * This configuration is following Rainbowkit Migration Guide to Viem
   * 3. Ensure bundler and polyfill compatibility
   * https://www.rainbowkit.com/docs/migration-guide
   */
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push("pino-pretty", "lokijs", "encoding", {
      "@sentry/profiling-node": "commonjs @sentry/profiling-node",
    });
    return config;
  },
  sentry: {
    hideSourceMaps: true,
  },
  images: {
    domains: [
      "assets.coingecko.com",
      "raw.githubusercontent.com",
      "assets-cdn.trustwallet.com",
      "beethoven-assets.s3.eu-central-1.amazonaws.com",
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.coingecko.com",
        port: "",
        pathname: "/coins/images/**",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        port: "",
        pathname: "/balancer/frontend-v2/**",
      },
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        port: "",
        pathname:
          "/images/r2mka0oi/production/bf37b9c7fb36c7d3c96d3d05b45c76d89072b777-1800x1800.png",
      },
    ],
  },
};

module.exports = withSentryConfig(
  moduleExports,
  {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    // Suppresses source map uploading logs during build
    silent: true,
    org: "bleu",
    project: "balancer-tools",
  },
  {
    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Transpiles SDK to be compatible with IE11 (increases bundle size)
    transpileClientSDK: true,

    // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers (increases server load)
    tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,
  },
);
