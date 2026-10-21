import test from 'node:test';
import assert from 'node:assert/strict';

async function loadHeaders(nodeEnv) {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = nodeEnv;
  try {
    const { default: config } = await import(`../next.config.mjs?env=${nodeEnv}`);
    const rules = await config.headers();
    assert.equal(rules[0].source, '/:path*');
    return Object.fromEntries(rules[0].headers.map((h) => [h.key, h.value]));
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev;
  }
}

const directives = (csp) => Object.fromEntries(csp.split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

test('production headers include CSP and the hardening headers', async () => {
  const h = await loadHeaders('production');
  assert.equal(h['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.match(h['Permissions-Policy'], /microphone=\(self\)/);
  assert.match(h['Permissions-Policy'], /camera=\(\)/);
  assert.match(h['Permissions-Policy'], /geolocation=\(\)/);
  const csp = directives(h['Content-Security-Policy']);
  assert.ok(!csp['script-src'].includes("'unsafe-eval'"));
  assert.ok(csp['script-src'].includes("'unsafe-inline'"));
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
  assert.ok(csp['media-src'].includes('blob:'));
  assert.ok(csp['connect-src'].includes('https://www.googleapis.com'));
  assert.ok(csp['connect-src'].includes('blob:'));
  assert.ok(csp['img-src'].includes('https://i.scdn.co'));
  assert.ok(csp['font-src'].includes('https://fonts.gstatic.com'));
  assert.ok(csp['style-src'].includes('https://fonts.googleapis.com'));
});

test('unsafe-eval is only allowed in development', async () => {
  const h = await loadHeaders('development');
  assert.ok(directives(h['Content-Security-Policy'])['script-src'].includes("'unsafe-eval'"));
});
