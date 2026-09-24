import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom here is a TEST-TOOLING choice, not a runtime dependency: the
    // package's own source touches neither DOM nor a native bridge (that's
    // the whole point of it), but exercising a React hook through
    // `@testing-library/react`'s `renderHook` needs *some* host environment
    // to render into, and jsdom is the lightweight standard one — nothing
    // in `use-throttled-commit.ts` itself reads `document` or `window`.
    environment: 'jsdom',
    globals: false,
    server: { deps: { external: [/@sudobility\//] } },
  },
});
