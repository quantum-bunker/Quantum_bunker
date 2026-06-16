import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    env: {
      RELAY_CONN_PER_IP_LIMIT: '2000',
      REST_SESSION_CREATE_LIMIT: '100000',
      REST_GENERAL_LIMIT: '100000',
    },
    coverage: {
      provider: 'v8',
      // json-summary produces coverage/coverage-summary.json, which the
      // CI pipeline reads to enforce per-metric thresholds.
      reporter: ['text', 'json', 'json-summary', 'html'],
      exclude: [
        // RTCPeerConnection / RTCDataChannel are browser-only APIs; this file
        // cannot execute in Node.js. The two pure utility functions it exports
        // (isOfferer, shouldUseP2P) are covered by webrtc-mesh.test.ts.
        'src/transport/webrtc-mesh.ts',
        // Entry-point wiring: Express + Vite middleware + WS scheduler.
        // Branches here are exercised by smoke and integration tests, not
        // by the unit-test runner that collects coverage.
        'server.ts',
      ],
      // No hard thresholds here on purpose. The CI pipeline reads
      // coverage/coverage-summary.json and reports each metric against its
      // 70% target as a PR comment, but coverage never blocks the merge
      // (see .github/workflows/ci-pipeline.yml). Enforcing thresholds here
      // would make `npm run test -- --coverage` exit non-zero on low
      // coverage, silently re-introducing a merge block the pipeline is
      // explicitly designed not to impose. Failing tests still fail the run.
    },
  },
});
