import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.JARVIS_BACKEND_URL ?? 'http://127.0.0.1:5000';

async function fallbackTextSts(text: string, agentMode: boolean) {
  const chatResponse = await fetch(`${BACKEND_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: text,
      user_id: 'web_user',
      memory_user_id: 'web_user_profile',
      use_memory: true,
      enable_tools: agentMode,
    }),
    cache: 'no-store',
  });

  if (!chatResponse.ok) {
    const details = await chatResponse.text();
    throw new Error(`Text fallback chat failed (${chatResponse.status}): ${details}`);
  }

  const chatData = await chatResponse.json();
  const reply = String(chatData?.response ?? '').trim() || 'No response received.';

  let audio = '';
  const ttsResponse = await fetch(`${BACKEND_URL}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: reply, voice: 'onyx' }),
    cache: 'no-store',
  });

  if (ttsResponse.ok) {
    const ttsBuffer = Buffer.from(await ttsResponse.arrayBuffer());
    audio = ttsBuffer.toString('base64');
  }

  return {
    transcript: text,
    reply,
    audio,
    fallback: true,
  };
}

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/sts/status`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          error: `STS status request failed with ${response.status}.`,
          details: text,
        },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      status: data?.status ?? 'unknown',
      mode: data?.mode ?? 'fallback',
      rtvcReady: Boolean(data?.rtvc_ready),
      modelsLoaded: Boolean(data?.models_loaded),
      reason: data?.reason ?? '',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unable to reach STS backend.',
        details:
          error instanceof Error
            ? error.message
            : 'Set JARVIS_BACKEND_URL to a reachable backend API.',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    let response: Response;
    let fallbackTranscript = '';
    let fallbackAgentMode = false;
    let hasAudio = false;

    if (contentType.includes('multipart/form-data')) {
      const incoming = await req.formData();
      const outbound = new FormData();

      for (const [key, value] of incoming.entries()) {
        outbound.append(key, value);
      }

      hasAudio = incoming.get('source_audio') instanceof File;
      const text = String(incoming.get('text') ?? '').trim();
      fallbackAgentMode = String(incoming.get('agentMode') ?? 'false').toLowerCase() === 'true';
      if (!hasAudio && !text) {
        return NextResponse.json(
          { error: 'Audio or text is required for STS chat.' },
          { status: 400 }
        );
      }

      fallbackTranscript = text;
      response = await fetch(`${BACKEND_URL}/sts/chat`, {
        method: 'POST',
        body: outbound,
        cache: 'no-store',
      });
    } else {
      const body = await req.json();
      const text = String(body?.text ?? '').trim();
      const agentMode = Boolean(body?.agentMode);
      fallbackAgentMode = agentMode;

      if (!text) {
        return NextResponse.json({ error: 'Text is required for STS chat.' }, { status: 400 });
      }

      fallbackTranscript = text;
      response = await fetch(`${BACKEND_URL}/sts/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, agentMode }),
        cache: 'no-store',
      });
    }

    if (!response.ok) {
      const textBody = await response.text();

      if (fallbackTranscript) {
        try {
          const fallbackResult = await fallbackTextSts(fallbackTranscript, fallbackAgentMode);
          return NextResponse.json(fallbackResult);
        } catch (fallbackError) {
          const fallbackDetails =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          return NextResponse.json(
            {
              error: `STS chat request failed with ${response.status}.`,
              details: textBody,
              fallbackError: fallbackDetails,
            },
            { status: 502 }
          );
        }
      }

      if (hasAudio) {
        return NextResponse.json(
          {
            error: `STS chat request failed with ${response.status}.`,
            details: textBody,
            hint: 'Audio transcription is currently unavailable. Try typed STS Speak temporarily.',
          },
          { status: 502 }
        );
      }

      return NextResponse.json(
        {
          error: `STS chat request failed with ${response.status}.`,
          details: textBody,
        },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      transcript: data?.transcript ?? fallbackTranscript,
      reply: data?.reply ?? '',
      audio: data?.audio ?? '',
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unable to reach STS chat endpoint.',
        details:
          error instanceof Error
            ? error.message
            : 'Set JARVIS_BACKEND_URL to a reachable backend API.',
      },
      { status: 500 }
    );
  }
}
