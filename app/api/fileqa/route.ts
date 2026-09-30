import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';

export const runtime = 'nodejs';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = process.env.GROQ_MODEL || 'qwen/qwen3.8-27b';

function chunkText(text: string, maxChunkSize = 1200): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += maxChunkSize) {
    chunks.push(clean.slice(i, i + maxChunkSize));
  }
  return chunks;
}

function scoreChunk(chunk: string, question: string): number {
  const q = question.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const text = chunk.toLowerCase();
  return q.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
}

async function extractTextFromFile(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileType = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();

  if (fileType.includes('pdf') || name.endsWith('.pdf')) {
    const parsed = await pdfParse(buffer);
    return parsed.text || '';
  }

  if (
    fileType.includes('officedocument.wordprocessingml.document') ||
    name.endsWith('.docx')
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  if (fileType.startsWith('text/') || name.endsWith('.txt') || name.endsWith('.md')) {
    return buffer.toString('utf-8');
  }

  if (fileType.startsWith('image/')) {
    const worker = await createWorker('eng');
    try {
      const {
        data: { text },
      } = await worker.recognize(buffer);
      return text || '';
    } finally {
      await worker.terminate();
    }
  }

  return '';
}

export async function POST(request: NextRequest) {
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return NextResponse.json({ error: 'Missing GROQ_API_KEY' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const question = String(formData.get('question') || '').trim();

    if (
      !file ||
      typeof file !== 'object' ||
      typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== 'function'
    ) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!question) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    const extractedText = await extractTextFromFile(file as File);
    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: 'Could not extract readable content from this file type.' },
        { status: 400 }
      );
    }

    const chunks = chunkText(extractedText);
    const topChunks = chunks
      .map((chunk) => ({ chunk, score: scoreChunk(chunk, question) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((item) => item.chunk);

    const context = topChunks.join('\n\n');
    const prompt = `You are a document assistant. Use ONLY the provided file context to answer the question accurately.

Question:
${question}

File Context:
${context}`;

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 1200,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('File QA Groq error:', errorText);
      return NextResponse.json({ error: 'Failed to answer question' }, { status: 500 });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() || 'No answer generated.';
    return NextResponse.json({ answer, extractedLength: extractedText.length });
  } catch (error) {
    console.error('File QA route error:', error);
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
  }
}
