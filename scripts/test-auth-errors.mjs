import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AUTH_ERROR_CODES, authErrorFromProviderParam, authErrorMessage } from '../lib/authErrors.ts';

const callbacks = ['../app/api/auth/google/callback/route.ts', '../app/api/auth/tiktok/callback/route.ts'];

test('auth callbacks only redirect with fixed auth_error codes, never raw upstream text', async () => {
  for (const path of callbacks) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    // Every reject(...) call must pass a string literal from the fixed code list.
    const calls = [...source.matchAll(/\breject\(([^)]*)\)/g)].map((m) => m[1].trim());
    assert.ok(calls.length > 0, `${path} has reject() calls`);
    for (const arg of calls) {
      if (arg === 'authErrorFromProviderParam(providerError') continue; // regex stops at the inner ')'; helper returns a fixed code
      const literal = arg.match(/^'([a-z_]+)'$/);
      assert.ok(literal, `${path}: reject(${arg}) must use a fixed code literal`);
      assert.ok(AUTH_ERROR_CODES.includes(literal[1]), `${path}: unknown auth_error code ${literal[1]}`);
    }
    assert.doesNotMatch(source, /auth_error=\$\{encodeURIComponent\((?!code\b)/);
  }
});

test('every code has a plain-language message; unknown codes get a generic one', () => {
  for (const code of AUTH_ERROR_CODES) {
    const msg = authErrorMessage(code);
    assert.ok(msg && msg.length > 10 && !msg.includes('_'), `message for ${code}`);
  }
  assert.equal(authErrorMessage(null), null);
  assert.equal(authErrorMessage('Invalid grant: token <script>'), authErrorMessage('provider_error'));
});

test('provider error query params map to denied or provider_error', () => {
  assert.equal(authErrorFromProviderParam('access_denied'), 'denied');
  assert.equal(authErrorFromProviderParam('server_error'), 'provider_error');
  assert.equal(authErrorFromProviderParam(null), 'missing_code');
});

test('API routes do not echo raw upstream or exception text in JSON errors', async () => {
  const { readdir } = await import('node:fs/promises');
  const root = new URL('../app/api/', import.meta.url);
  const entries = await readdir(root, { recursive: true });
  const routes = entries.filter((p) => p.endsWith('route.ts'));
  assert.ok(routes.length >= 10);
  for (const rel of routes) {
    const source = await readFile(new URL(rel, root), 'utf8');
    for (const m of source.matchAll(/NextResponse\.json\(\s*\{\s*error:\s*([^,}]+)/g)) {
      const expr = m[1].trim();
      assert.ok(!/\b(msg|message)\b|\.message\b/.test(expr), `${rel}: error field must not use raw text (${expr})`);
    }
  }
});

test('readAuthRedirect extracts the callback result and strips it from the URL', async () => {
  const { readAuthRedirect } = await import('../lib/authErrors.ts');
  assert.deepEqual(readAuthRedirect('?auth_error=denied'), { errorCode: 'denied', connected: null, cleanedSearch: '' });
  assert.deepEqual(readAuthRedirect('?connected=google&x=1'), { errorCode: null, connected: 'google', cleanedSearch: '?x=1' });
  assert.deepEqual(readAuthRedirect('?connected=evil'), { errorCode: null, connected: null, cleanedSearch: '' });
  assert.deepEqual(readAuthRedirect(''), { errorCode: null, connected: null, cleanedSearch: '' });
  assert.equal(authErrorMessage(readAuthRedirect('?auth_error=<script>').errorCode), authErrorMessage('provider_error'));
});
