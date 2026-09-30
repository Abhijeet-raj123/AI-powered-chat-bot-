import { NextRequest, NextResponse } from 'next/server';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing GROQ_API_KEY' }, { status: 500 });
    }

    const { mode, language, code, prompt } = (await request.json()) as {
      mode?: 'explain' | 'fix' | 'optimize' | 'generate';
      language?: string;
      code?: string;
      prompt?: string;
    };

    const action = mode || 'explain';
    const lang = language || 'text';
    const userCode = (code || '').trim();
    const userPrompt = (prompt || '').trim();

    if (!userCode && !userPrompt) {
      return NextResponse.json(
        { error: 'Provide code or prompt for coding assistance' },
        { status: 400 }
      );
    }

    const instructionMap: Record<string, string> = {
      explain: 'Explain the code/error clearly and simply, then provide improvements.',
      fix: 'Find the issue and provide corrected code with short explanation.',
      optimize: 'Suggest performance/readability improvements and provide improved code.',
      generate: 'Generate code based on the request and explain key logic briefly.',
    };

    const content = `Task: ${action}
Language: ${lang}
Instruction: ${instructionMap[action]}

Prompt:
${userPrompt || '(none)'}

Code/Error Input:
${userCode || '(none)'}`;

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a coding assistant. Give concise, practical help. Use markdown code blocks for code.',
          },
          { role: 'user', content },
        ],
        temperature: 0.3,
        max_tokens: 1800,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Code assistant Groq error:', err);
      return NextResponse.json({ error: 'Failed to generate coding help' }, { status: 500 });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || 'No response generated.';
    return NextResponse.json({ answer });
  } catch (error) {
    console.error('Code assistant route error:', error);
    return NextResponse.json({ error: 'Failed to process coding request' }, { status: 500 });
  }
}
