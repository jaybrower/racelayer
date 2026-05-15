import { describe, it, expect } from 'vitest'

// Smoke test — proves the Vitest framework is wired up and runs.
// Real test coverage lives alongside this file in `tests/<area>.test.ts`.
describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
