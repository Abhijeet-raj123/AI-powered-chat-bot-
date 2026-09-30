import { NextRequest, NextResponse } from 'next/server';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';
const FALLBACK_MODELS = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

const SYSTEM_PROMPT = `You are a helpful, friendly chatbot. Respond in a natural, conversational way. Keep replies simple and smart. Understand normal language and provide human-like responses. You can chat in English, Hindi, or Bhojpuri when the user uses those languages.`;

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error('GROQ_API_KEY is not set');
      return NextResponse.json(
        { error: 'Server misconfiguration: missing GROQ_API_KEY' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { messages, preferredLanguage } = body as {
      messages: unknown;
      preferredLanguage?: 'en' | 'hi' | 'bho';
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Invalid messages' }, { status: 400 });
    }

    const languageHint =
      preferredLanguage === 'bho'
        ? ' For this session the user selected Bhojpuri: when they write or ask in Bhojpuri, reply in natural Bhojpuri using Devanagari. If they switch to English or Hindi, follow their lead.'
        : preferredLanguage === 'hi'
          ? ' For this session the user selected Hindi: when they write in Hindi or ask for Hindi, reply in Hindi (Devanagari) where appropriate.'
          : preferredLanguage === 'en'
            ? ' For this session prefer clear English unless the user clearly uses another language.'
            : '';

    const chatMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT + languageHint },
      ...messages.map((msg: { sender: string; text: string }) => ({
        role: msg.sender === 'user' ? ('user' as const) : ('assistant' as const),
        content: msg.text,
      })),
    ];

    const models = [...new Set([DEFAULT_MODEL, ...FALLBACK_MODELS])];
    let lastError = 'Unknown Groq error';

    for (const model of models) {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: chatMessages,
          temperature: 0.7,
          max_tokens: 2048,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content?.trim();
        if (reply) return NextResponse.json({ reply });
        lastError = `Groq returned no reply for ${model}`;
        continue;
      }

      lastError = await res.text();
      console.error(`Groq API error for ${model}:`, res.status, lastError);
    }

    return NextResponse.json(
      { error: 'Groq could not generate a response. Check your API key, model access, or rate limit.', details: lastError },
      { status: 502 }
    );
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 });
  }
}
