import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WHISPER_DAILY_MINUTES, billableSeconds, clientIdentifier, getDailyCapMinutes, getWhisperUsage,
  hitFixedWindow, limitsMode, parseDailyMinutes, recordWhisperUsage, utcDay, whisperUsageKey,
} from '../lib/rateLimit.ts';
import { formatSRT, parseSRT } from '../lib/srtParser.ts';

function memoryStore() {
  const data = new Map();
  return {
    data,
    async incrBy(key, amount, ttlSeconds) {
      const entry = data.get(key) ?? { value: 0, ttlSeconds };
      entry.value += amount;
      data.set(key, entry);
      return entry.value;
    },
    async get(key) { return data.get(key)?.value ?? 0; },
  };
}
const unavailableStore = { async incrBy() { return null; }, async get() { return null; } };

test('fixed window allows up to the limit, then refuses until the next window', async () => {
  const store = memoryStore();
  const t0 = Date.UTC(2026, 9, 21, 12, 0, 10);
  for (let i = 1; i <= 3; i++) {
    const r = await hitFixedWindow(store, 'b', 'id', 3, 60, t0);
    assert.equal(r.allowed, true);
    assert.equal(r.count, i);
  }
  const blocked = await hitFixedWindow(store, 'b', 'id', 3, 60, t0);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 50);
  const nextWindow = await hitFixedWindow(store, 'b', 'id', 3, 60, t0 + 50_000);
  assert.equal(nextWindow.allowed, true);
  assert.equal(nextWindow.count, 1);
  assert.equal([...store.data.values()][0].ttlSeconds, 60);
});

test('windows are separate per bucket and per identifier', async () => {
  const store = memoryStore();
  const t = Date.UTC(2026, 9, 21);
  assert.equal((await hitFixedWindow(store, 'a', 'x', 1, 60, t)).allowed, true);
  assert.equal((await hitFixedWindow(store, 'a', 'y', 1, 60, t)).allowed, true);
  assert.equal((await hitFixedWindow(store, 'b', 'x', 1, 60, t)).allowed, true);
  assert.equal((await hitFixedWindow(store, 'a', 'x', 1, 60, t)).allowed, false);
});

test('unavailable storage is reported as null, not as allowed', async () => {
  assert.equal(await hitFixedWindow(unavailableStore, 'b', 'id', 3, 60), null);
  assert.equal(await getWhisperUsage(unavailableStore, 'id', 60), null);
});

test('identifier prefers a verified session (hashed), then first forwarded IP, then real IP', () => {
  const s = clientIdentifier({ verifiedSessionId: 'secret-session', forwardedFor: '1.1.1.1' });
  assert.match(s, /^s:[0-9a-f]{32}$/);
  assert.ok(!s.includes('secret-session'));
  assert.equal(clientIdentifier({ verifiedSessionId: null, forwardedFor: ' 203.0.113.5 , 10.0.0.1', realIp: '9.9.9.9' }), 'ip:203.0.113.5');
  assert.equal(clientIdentifier({ realIp: '9.9.9.9' }), 'ip:9.9.9.9');
  assert.equal(clientIdentifier({}), 'ip:unknown');
});

test('limits are enforced with KV, refused in production without KV, skipped in development', () => {
  assert.equal(limitsMode(true, 'production'), 'enforce');
  assert.equal(limitsMode(true, 'development'), 'enforce');
  assert.equal(limitsMode(false, 'production'), 'refuse');
  assert.equal(limitsMode(false, 'development'), 'skip');
  assert.equal(limitsMode(false, undefined), 'skip');
});

test('daily cap defaults to 60 minutes and honours WHISPER_DAILY_MINUTES', async () => {
  assert.equal(DEFAULT_WHISPER_DAILY_MINUTES, 60);
  assert.equal(parseDailyMinutes(undefined), 60);
  assert.equal(parseDailyMinutes(''), 60);
  assert.equal(parseDailyMinutes('abc'), 60);
  assert.equal(parseDailyMinutes('-5'), 60);
  assert.equal(parseDailyMinutes('15'), 15);
  assert.equal(parseDailyMinutes('0'), 0);
  const prev = process.env.WHISPER_DAILY_MINUTES;
  try {
    process.env.WHISPER_DAILY_MINUTES = '5';
    assert.equal(await getDailyCapMinutes('ip:1.2.3.4'), 5);
    delete process.env.WHISPER_DAILY_MINUTES;
    assert.equal(await getDailyCapMinutes('ip:1.2.3.4'), 60);
  } finally {
    if (prev === undefined) delete process.env.WHISPER_DAILY_MINUTES; else process.env.WHISPER_DAILY_MINUTES = prev;
  }
});

test('whisper usage accumulates per identifier per UTC day', async () => {
  const store = memoryStore();
  const day1 = Date.UTC(2026, 9, 21, 23, 59, 0);
  const day2 = Date.UTC(2026, 9, 22, 0, 1, 0);
  assert.equal(utcDay(day1), '2026-10-21');
  assert.notEqual(whisperUsageKey('id', day1), whisperUsageKey('id', day2));

  assert.deepEqual(await getWhisperUsage(store, 'id', 1, day1), { usedSeconds: 0, capSeconds: 60, remainingSeconds: 60 });
  await recordWhisperUsage(store, 'id', billableSeconds(45.2), day1);
  assert.deepEqual(await getWhisperUsage(store, 'id', 1, day1), { usedSeconds: 46, capSeconds: 60, remainingSeconds: 14 });
  await recordWhisperUsage(store, 'id', 30, day1);
  assert.equal((await getWhisperUsage(store, 'id', 1, day1)).remainingSeconds, 0);
  assert.equal((await getWhisperUsage(store, 'other', 1, day1)).remainingSeconds, 60);
  assert.equal((await getWhisperUsage(store, 'id', 1, day2)).remainingSeconds, 60);
});

test('billable seconds round up and ignore missing durations', () => {
  assert.equal(billableSeconds(0.1), 1);
  assert.equal(billableSeconds(60), 60);
  assert.equal(billableSeconds(undefined), 0);
  assert.equal(billableSeconds(Number.NaN), 0);
});

test('formatSRT produces SRT that parseSRT reads back unchanged', () => {
  const segments = [
    { start: 0, end: 2.5, text: ' Hello there ' },
    { start: 2.5, end: 3661.007, text: 'Second line' },
    { start: 4, end: 5, text: '   ' },
  ];
  const srt = formatSRT(segments);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:02,500\nHello there\n\n2\n00:00:02,500 --> 01:01:01,007\nSecond line\n$/);
  assert.deepEqual(parseSRT(srt), [
    { start: 0, end: 2.5, text: 'Hello there' },
    { start: 2.5, end: 3661.007, text: 'Second line' },
  ]);
  assert.equal(formatSRT([]), '');
});
