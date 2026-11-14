import { defineConfig } from 'vitest/config'

export default defineConfig({
  // three.js in its own long-cached chunk; the app chunk stays small and changes independently.
  build: {
    rolldownOptions: {
      output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }] } },
    },
  },
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] },
})
