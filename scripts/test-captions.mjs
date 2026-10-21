import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSRT } from '../lib/srtParser.ts';
import { parseCaptionFile } from '../lib/videoAssets.ts';

// Audio mode accepts .vtt files, but its SRT-only parser required the hour field
// and kept Windows line endings, so WebVTT captions silently disappeared.
const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.500\nHello there\n\n00:03.000 --> 00:04.000\n<i>Second</i> line\n';
const crlfSrt = '﻿1\r\n00:00:00,500 --> 00:00:02,000\r\nFirst caption\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\nNext\r\n';

test('audio-mode captions read WebVTT without hours', () => {
  assert.deepEqual(parseSRT(vtt), [
    { start: 1, end: 2.5, text: 'Hello there' },
    { start: 3, end: 4, text: 'Second line' },
  ]);
});

test('audio-mode captions ignore BOM and Windows line endings', () => {
  assert.deepEqual(parseSRT(crlfSrt), [
    { start: 0.5, end: 2, text: 'First caption' },
    { start: 2, end: 3, text: 'Next' },
  ]);
});

test('both workflows share one caption parser', () => {
  for (const input of [vtt, crlfSrt, '', 'not captions']) assert.deepEqual(parseSRT(input), parseCaptionFile(input));
});
