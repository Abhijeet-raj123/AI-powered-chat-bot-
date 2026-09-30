import { NextRequest, NextResponse } from 'next/server';

/** Default: Rachel (natural English female). Override in .env.local with any voice ID from your ElevenLabs account. */
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

/**
 * POST /api/tts
 * Body: { text: string }
 * Returns: audio/mpeg when ELEVENLABS_API_KEY is set, else 501 (client falls back to browser speech).
 *
 * Env:
 * - ELEVENLABS_API_KEY — required for neural voice (https://elevenlabs.io/)
 * - ELEVENLABS_VOICE_ID — optional; default is a clear female voice (Rachel)
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 501 });
  }

  try {
    const body = await request.json();
    const text = typeof body?.text === 'string' ? body.text : '';
    if (!text.trim()) {
      return NextResponse.json({ error: 'Invalid text' }, { status: 400 });
    }

    const clean = text.trim().slice(0, 4500);

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: clean,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.82,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error('ElevenLabs TTS error:', res.status, err);
      return NextResponse.json({ error: 'tts_failed' }, { status: 502 });
    }

    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (e) {
    console.error('TTS route:', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
