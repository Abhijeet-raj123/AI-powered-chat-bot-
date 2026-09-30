import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_RAPIDAPI_BASE_URL = 'https://judge0-ce.p.rapidapi.com/submissions';
const DEFAULT_PUBLIC_BASE_URL = 'https://ce.judge0.com/submissions';

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.JUDGE0_API_KEY;
    const host = process.env.JUDGE0_HOST || 'judge0-ce.p.rapidapi.com';
    const useRapidApi = Boolean(apiKey);
    const baseUrl =
      process.env.JUDGE0_BASE_URL ||
      (useRapidApi ? DEFAULT_RAPIDAPI_BASE_URL : DEFAULT_PUBLIC_BASE_URL);

    const { sourceCode, languageId, stdin } = (await request.json()) as {
      sourceCode?: string;
      languageId?: number;
      stdin?: string;
    };

    if (!sourceCode?.trim() || !languageId) {
      return NextResponse.json(
        { error: 'sourceCode and languageId are required' },
        { status: 400 }
      );
    }

    const createHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (useRapidApi && apiKey) {
      createHeaders['x-rapidapi-key'] = apiKey;
      createHeaders['x-rapidapi-host'] = host;
    }

    const createRes = await fetch(`${baseUrl}?base64_encoded=false&wait=false`, {
      method: 'POST',
      headers: createHeaders,
      body: JSON.stringify({
        source_code: sourceCode,
        language_id: languageId,
        stdin: stdin || '',
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.text();
      console.error('Judge0 create error:', err);
      return NextResponse.json({ error: 'Failed to submit code' }, { status: 500 });
    }

    const createData = await createRes.json();
    const token = createData.token;
    if (!token) {
      return NextResponse.json({ error: 'No execution token returned' }, { status: 500 });
    }

    for (let i = 0; i < 12; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const statusHeaders: Record<string, string> = {};
      if (useRapidApi && apiKey) {
        statusHeaders['x-rapidapi-key'] = apiKey;
        statusHeaders['x-rapidapi-host'] = host;
      }
      const statusRes = await fetch(`${baseUrl}/${token}?base64_encoded=false`, {
        headers: statusHeaders,
      });

      if (!statusRes.ok) continue;
      const result = await statusRes.json();
      const statusId = result.status?.id;
      if (statusId && statusId > 2) {
        return NextResponse.json({
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          compileOutput: result.compile_output || '',
          status: result.status?.description || 'Unknown',
          time: result.time,
          memory: result.memory,
        });
      }
    }

    return NextResponse.json({ error: 'Execution timed out' }, { status: 504 });
  } catch (error) {
    console.error('Code run route error:', error);
    const hasKey = Boolean(process.env.JUDGE0_API_KEY);
    return NextResponse.json(
      {
        error: hasKey
          ? 'Failed to run code. Please verify your Judge0 credentials and network.'
          : 'Public compiler endpoint is unreachable from this network. Add JUDGE0_API_KEY to use RapidAPI Judge0 reliably.',
      },
      { status: 500 }
    );
  }
}
