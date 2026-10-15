import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.JARVIS_BACKEND_URL ?? 'http://127.0.0.1:5000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = String(body?.text ?? '').trim();
    const voice = String(body?.voice ?? 'en-GB-RyanNeural');
    const pitch = String(body?.pitch ?? '+0Hz');
    const rate = String(body?.rate ?? '+0%');

    if (!text) {
      return NextResponse.json({ error: 'text is required.' }, { status: 400 });
    }

    const upstream = await fetch(`${BACKEND_URL}/tts-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, pitch, rate }),
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `TTS backend returned ${upstream.status}` },
        { status: 502 }
      );
    }

    const audioBuffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get('content-type') ?? 'audio/mpeg';

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unable to reach TTS backend.',
        details: error instanceof Error ? error.message : 'Set JARVIS_BACKEND_URL in Vercel env.',
      },
      { status: 500 }
    );
  }
}
