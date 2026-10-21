import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';
import { applyRateLimit, kvCounterStore, limitsUnavailable, rejectCrossOrigin } from '../../../lib/apiGuard';
import { billableSeconds, getDailyCapMinutes, getWhisperUsage, recordWhisperUsage } from '../../../lib/rateLimit';
import { formatSRT } from '../../../lib/srtParser';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req);
  if (crossOrigin) return crossOrigin;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 503 });

  const limited = await applyRateLimit(req, 'whisper', 10, 60);
  if ('response' in limited) return limited.response;
  const callerId = limited.id;

  // Duration is only known after transcription, so the cap is checked up front
  // (any remaining time admits one more file) and usage is recorded afterwards.
  if (callerId) {
    const capMinutes = await getDailyCapMinutes(callerId);
    const usage = await getWhisperUsage(kvCounterStore, callerId, capMinutes);
    if (!usage) return limitsUnavailable();
    if (usage.remainingSeconds <= 0) {
      return NextResponse.json(
        { error: `Daily auto-caption limit reached (${capMinutes} minutes). It resets at midnight UTC.`, code: 'whisper_daily_cap_reached' },
        { status: 429 },
      );
    }
  }

  try {
    const form = await req.formData();
    const audioFile = form.get('audio') as File | null;
    if (!audioFile) return NextResponse.json({ error: 'No audio file' }, { status: 400 });

    if (audioFile.size > 24 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File too large (max 24 MB). Trim the audio before captioning.' },
        { status: 413 },
      );
    }

    const openai = new OpenAI({ apiKey: key });
    const arrayBuffer = await audioFile.arrayBuffer();
    const file = await toFile(Buffer.from(arrayBuffer), audioFile.name || 'audio.wav', { type: audioFile.type });

    // verbose_json reports the billed audio duration; segments are re-serialized to
    // SRT so the `{ srt }` response the client parses is unchanged.
    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'verbose_json',
    });

    if (callerId) {
      const recorded = await recordWhisperUsage(kvCounterStore, callerId, billableSeconds(transcription.duration));
      if (recorded === null) console.error('[whisper] failed to record usage for', callerId);
    }

    return NextResponse.json({ srt: formatSRT(transcription.segments ?? []) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
