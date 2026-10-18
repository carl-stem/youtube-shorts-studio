import { NextRequest, NextResponse } from 'next/server';
import OpenAI, { toFile } from 'openai';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 503 });

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

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      response_format: 'srt',
    });

    return NextResponse.json({ srt: transcription });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
