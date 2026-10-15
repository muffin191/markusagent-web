import { NextRequest, NextResponse } from 'next/server';

function getBackendCandidates() {
  const envUrl = (process.env.JARVIS_BACKEND_URL ?? '').trim();
  const candidates = [envUrl, 'http://127.0.0.1:5000', 'http://localhost:5000'].filter(Boolean);

  return [...new Set(candidates)];
}

type BackendHealth = {
  status?: string;
  provider?: string;
  model?: string;
  active_model?: string;
  gemini_client_ready?: boolean;
};

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('mode');

  if (mode === 'history') {
    try {
      const userId = String(req.nextUrl.searchParams.get('userId') ?? 'web_user').trim();
      let response: Response | null = null;
      let lastStatus = 0;
      let lastText = '';

      for (const baseUrl of getBackendCandidates()) {
        try {
          const candidate = await fetch(
            `${baseUrl}/history?user_id=${encodeURIComponent(userId)}`,
            { cache: 'no-store' }
          );
          if (candidate.ok) {
            response = candidate;
            break;
          }
          lastStatus = candidate.status;
          lastText = await candidate.text();
        } catch (error) {
          lastText = error instanceof Error ? error.message : 'Unknown error';
        }
      }

      if (!response) {
        return NextResponse.json(
          {
            error: `Backend history request failed with ${lastStatus || 502}.`,
            details: lastText || 'Set JARVIS_BACKEND_URL to a reachable backend API.',
          },
          { status: 502 }
        );
      }

      const data = await response.json();
      return NextResponse.json({
        userId,
        history: Array.isArray(data?.history) ? data.history : [],
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Unable to load chat history.',
          details:
            error instanceof Error
              ? error.message
              : 'Set JARVIS_BACKEND_URL to a reachable backend API.',
        },
        { status: 500 }
      );
    }
  }

  try {
    const candidates = getBackendCandidates();
    let data: BackendHealth | null = null;
    let lastStatus = 500;
    let lastText = '';

    for (const baseUrl of candidates) {
      const endpoints = [`${baseUrl}/status`, `${baseUrl}/health`];
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, { cache: 'no-store' });
          lastStatus = response.status;
          if (!response.ok) {
            lastText = await response.text();
            continue;
          }
          data = await response.json();
          break;
        } catch (error) {
          lastText = error instanceof Error ? error.message : 'Unknown error';
        }
      }
      if (data) break;
    }

    if (!data) {
      return NextResponse.json(
        {
          status: 'degraded',
          backendReachable: false,
          error: `Backend health check failed with ${lastStatus}.`,
          details: lastText,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      status: data?.status ?? 'unknown',
      provider: data?.provider ?? 'unknown',
      model: data?.model ?? data?.active_model ?? 'unknown',
      backendReachable: true,
      geminiClientReady: data?.gemini_client_ready ?? undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'offline',
        backendReachable: false,
        error: 'Unable to reach AI backend.',
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
    const body = await req.json();
    const message = String(body?.message ?? '').trim();
    const userId = String(body?.userId ?? 'web_user').trim();
    const memoryUserId = String(body?.memoryUserId ?? 'web_user_profile').trim();

    if (!message) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    }

    let lastErrorText = '';
    let lastStatus = 0;
    let response: Response | null = null;

    for (const backendUrl of getBackendCandidates()) {
      try {
        response = await fetch(`${backendUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            user_id: userId,
            memory_user_id: memoryUserId,
            use_memory: true,
            enable_tools: true,
          }),
          cache: 'no-store',
        });
        lastStatus = response.status;
        if (response.ok) break;
        lastErrorText = await response.text();
      } catch (error) {
        lastErrorText = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    if (!response || !response.ok) {
      return NextResponse.json(
        {
          error: `Backend request failed with ${lastStatus || 502}.`,
          details: lastErrorText || 'Set JARVIS_BACKEND_URL to a reachable backend API.',
        },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      response: data?.response ?? data?.reply ?? data?.message ?? 'No response received.',
      model: data?.model ?? 'unknown',
      timestamp: data?.timestamp,
      memoryUserId: data?.memory_user_id ?? memoryUserId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unable to reach AI backend.',
        details:
          error instanceof Error
            ? error.message
            : 'Set JARVIS_BACKEND_URL to a reachable backend API.',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const userId = String(body?.userId ?? 'web_user').trim();

    let response: Response | null = null;
    let lastStatus = 0;
    let lastText = '';

    for (const backendUrl of getBackendCandidates()) {
      try {
        response = await fetch(`${backendUrl}/clear-history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
          cache: 'no-store',
        });
        lastStatus = response.status;
        if (response.ok) break;
        lastText = await response.text();
      } catch (error) {
        lastText = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    if (!response || !response.ok) {
      return NextResponse.json(
        {
          error: `Backend clear-history request failed with ${lastStatus || 502}.`,
          details: lastText || 'Set JARVIS_BACKEND_URL to a reachable backend API.',
        },
        { status: 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json({
      status: data?.status ?? 'cleared',
      userId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unable to delete chat history.',
        details:
          error instanceof Error
            ? error.message
            : 'Set JARVIS_BACKEND_URL to a reachable backend API.',
      },
      { status: 500 }
    );
  }
}
