import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Source-level guard: there is no React render harness here. The theme script in
// <head> toggles the `dark` class on <html> before hydration, so React must be told
// to ignore that attribute difference on <html>, or it logs a hydration mismatch.
test('root <html> suppresses hydration warnings caused by the pre-hydration theme script', async () => {
  const source = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  assert.match(source, /documentElement\.classList/);
  assert.match(source, /<html\b[^>]*\bsuppressHydrationWarning\b[^>]*>/);
});
