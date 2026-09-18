// Build identity, resolved once at startup.
//
// The version is injected at build/run time rather than imported from
// package.json: the backend runs from source via tsx in development and from a
// bundle in production, and a JSON import would need resolveJsonModule plus a
// different relative path in each. The deploy workflow sets these.
export const APP_VERSION = process.env.APP_VERSION || process.env.npm_package_version || '0.1.0';

// Short commit SHA of the running build, when the deploy provides one. Render
// exposes RENDER_GIT_COMMIT; GitHub Actions exposes GITHUB_SHA.
export const BUILD_COMMIT =
  (process.env.BUILD_COMMIT || process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || 'unknown').slice(0, 7);
