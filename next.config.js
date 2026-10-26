const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com', pathname: '/**' },
    ],
  },
  experimental: {
    // Externalize server-only deps so Next.js does NOT try to bundle them
    // through webpack. Especially important for `pdf-parse` + `pdfjs-dist`
    // which use dynamic imports / worker loading that webpack mangles
    // (surfaces as "Object.defineProperty called on non-object" at runtime).
    serverComponentsExternalPackages: ['mongodb', 'pdf-parse', 'pdfjs-dist', 'muhammara', 'archiver', 'pdf-lib', '@pdf-lib/fontkit', '@hyzyla/pdfium', 'sharp'],
    // Files that are read from disk at runtime (via fs.readFile) MUST be
    // whitelisted so `output: 'standalone'` copies them into the deploy
    // bundle. Without this, GET /api/short-lesson-plans/template returns
    // HTTP 500 in production because the HTML asset isn't shipped alongside
    // the compiled server. The glob paths are relative to the app root.
    outputFileTracingIncludes: {
      // Include the short-lesson-plan HTML template + the Odia font TTFs
      // that `lib/lesson-plan-security.js` reads at runtime via
      // `readFileSync`.  Without these entries, `output: 'standalone'`
      // strips them from the production bundle and the embedded @font-face
      // silently falls back to whatever the client browser has installed
      // — which on Android is USUALLY nothing → Odia glyphs render as
      // tofu boxes in the fallback PDF.
      '/api/**/*': [
        './lib/templates/**/*',
        './lib/data/**/*',
        './public/fonts/**/*',
        './lib/assets/**/*',
      ],
    },
  },
  webpack(config, { dev, isServer, webpack }) {
    if (dev) {
      // Reduce CPU/memory from file watching
      config.watchOptions = {
        poll: 2000, // check every 2 seconds
        aggregateTimeout: 300, // wait before rebuilding
        ignored: ['**/node_modules'],
      };
    }
    // `muhammara` pulls in @mapbox/node-pre-gyp which has optional requires for
    // aws-sdk / mock-aws-s3 / nock — these are NEVER needed at runtime and break
    // the webpack build ("can't resolve 'nock'"). Ignore them.
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^(aws-sdk|mock-aws-s3|nock)$/ }));
    if (isServer) {
      // Belt-and-suspenders: keep native/server-only packages OUT of the server
      // bundle so Next require()s them at runtime (fixes archiver "Default
      // condition should be last one" + muhammara native binary bundling).
      const externalize = new Set(['muhammara', 'archiver', '@hyzyla/pdfium']);
      const prev = config.externals || [];
      const prevArr = Array.isArray(prev) ? prev : [prev];
      config.externals = [
        ({ request }, cb) => (request && externalize.has(request) ? cb(null, 'commonjs ' + request) : cb()),
        ...prevArr,
      ];
    }
    return config;
  },
  onDemandEntries: {
    maxInactiveAge: 10000,
    pagesBufferLength: 2,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: "frame-ancestors *;" },
          { key: "Access-Control-Allow-Origin", value: process.env.CORS_ORIGINS || "*" },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, PUT, DELETE, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "*" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
