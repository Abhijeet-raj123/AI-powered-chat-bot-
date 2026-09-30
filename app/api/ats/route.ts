import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';

export const runtime = 'nodejs';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'that', 'this', 'from', 'are', 'was', 'were', 'have',
  'has', 'had', 'will', 'would', 'can', 'could', 'our', 'their', 'they', 'them', 'job', 'role', 'work',
  'years', 'year', 'using', 'use', 'required', 'preferred', 'ability', 'experience', 'skills',
]);

const DEFAULT_RESUME_KEYWORDS = [
  'leadership', 'teamwork', 'communication', 'problem', 'analysis', 'project', 'strategy',
  'customer', 'product', 'sales', 'marketing', 'data', 'analytics', 'python', 'sql', 'java',
  'javascript', 'react', 'node', 'agile', 'automation', 'testing', 'deployment', 'business',
  'management', 'stakeholder', 'optimization', 'execution', 'delivery', 'research', 'design',
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+\-#\.\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function uniqueTopKeywords(text: string, limit = 40): string[] {
  const freq = new Map<string, number>();
  for (const token of tokenize(text)) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

async function extractTextFromFile(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileType = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();

  if (fileType.includes('pdf') || name.endsWith('.pdf')) {
    const parsed = await pdfParse(buffer);
    return parsed.text || '';
  }

  if (fileType.includes('officedocument.wordprocessingml.document') || name.endsWith('.docx')) {
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

function analyzeResumeOnly(resumeText: string) {
  const resumeLower = resumeText.toLowerCase();
  const keywords = DEFAULT_RESUME_KEYWORDS.filter((word) => resumeLower.includes(word));
  const missingKeywords = DEFAULT_RESUME_KEYWORDS.filter((word) => !resumeLower.includes(word));

  const hasSections = ['experience', 'education', 'skills', 'projects', 'summary'].filter((section) =>
    resumeLower.includes(section)
  ).length;
  const formatScore = Math.min(100, hasSections * 22 + (resumeLower.includes('achievements') ? 10 : 0));

  const wordCount = resumeText.trim().split(/\s+/).length;
  const lengthScore =
    wordCount < 180 ? 55 : wordCount < 350 ? 75 : wordCount < 900 ? 100 : 80;

  const keywordCoverage = Math.min(100, Math.round((keywords.length / DEFAULT_RESUME_KEYWORDS.length) * 100));
  const score = Math.round(keywordCoverage * 0.7 + formatScore * 0.2 + lengthScore * 0.1);

  const suggestions: string[] = [];
  if (missingKeywords.length > 0) {
    suggestions.push(`Add stronger resume keywords such as: ${missingKeywords.slice(0, 8).join(', ')}.`);
  }
  if (!resumeLower.includes('experience')) {
    suggestions.push('Add an Experience section with job responsibilities and outcomes.');
  }
  if (!resumeLower.includes('skills')) {
    suggestions.push('Add a dedicated Skills section to improve ATS readability.');
  }
  if (!resumeLower.includes('projects')) {
    suggestions.push('Add a Projects section with measurable results.');
  }
  if (wordCount > 950) {
    suggestions.push('Resume is too long; keep it concise and impact-focused.');
  } else if (wordCount < 170) {
    suggestions.push('Resume is too short; add more measurable achievements.');
  }
  if (suggestions.length === 0) {
    suggestions.push('Strong structure. Keep the resume concise and quantify your achievements.');
  }

  return {
    score,
    matchedKeywords: keywords.slice(0, 20),
    missingKeywords: missingKeywords.slice(0, 20),
    suggestions,
    details: {
      keywordCoverage,
      formatScore,
      lengthScore,
    },
  };
}

function analyzeResumeAgainstJobDescription(resumeText: string, jobDescription: string) {
  const resumeLower = resumeText.toLowerCase();
  const jdKeywords = uniqueTopKeywords(jobDescription, 45);
  const matchedKeywords = jdKeywords.filter((word) => resumeLower.includes(word));
  const missingKeywords = jdKeywords.filter((word) => !resumeLower.includes(word));

  const keywordCoverage = jdKeywords.length
    ? Math.round((matchedKeywords.length / jdKeywords.length) * 100)
    : 0;

  const hasSections = ['experience', 'education', 'skills', 'projects'].filter((section) =>
    resumeLower.includes(section)
  ).length;
  const formatScore = Math.min(100, hasSections * 25);

  const wordCount = resumeText.trim().split(/\s+/).length;
  const lengthScore =
    wordCount < 180 ? 55 : wordCount < 350 ? 75 : wordCount < 900 ? 100 : 80;

  const score = Math.round(keywordCoverage * 0.7 + formatScore * 0.2 + lengthScore * 0.1);

  const suggestions: string[] = [];
  if (missingKeywords.length > 0) {
    suggestions.push(`Add important missing terms: ${missingKeywords.slice(0, 8).join(', ')}.`);
  }
  if (!resumeLower.includes('projects')) {
    suggestions.push('Add a Projects section with measurable outcomes.');
  }
  if (!resumeLower.includes('skills')) {
    suggestions.push('Add a clear Skills section aligned to the job description.');
  }
  if (wordCount > 950) {
    suggestions.push('Resume is too long; keep it concise and impact-focused.');
  } else if (wordCount < 170) {
    suggestions.push('Resume is too short; add more impact bullets and achievements.');
  }
  if (suggestions.length === 0) {
    suggestions.push('Strong alignment. Tailor bullet points with quantifiable achievements.');
  }

  return {
    score,
    matchedKeywords: matchedKeywords.slice(0, 20),
    missingKeywords: missingKeywords.slice(0, 20),
    suggestions,
    details: {
      keywordCoverage,
      formatScore,
      lengthScore,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let resumeText = '';
    let jobDescription = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('resumeFile');
      const customResumeText = String(formData.get('resumeText') || '').trim();

      if (file && typeof file !== 'string' && 'arrayBuffer' in file) {
        resumeText = await extractTextFromFile(file as File);
      } else if (customResumeText) {
        resumeText = customResumeText;
      }
    } else {
      const body = (await request.json()) as {
        resumeText?: string;
        jobDescription?: string;
      };
      resumeText = (body.resumeText || '').trim();
      jobDescription = (body.jobDescription || '').trim();
    }

    if (!resumeText.trim()) {
      return NextResponse.json(
        { error: 'resumeText or resumeFile is required' },
        { status: 400 }
      );
    }

    const result = jobDescription.trim()
      ? analyzeResumeAgainstJobDescription(resumeText, jobDescription)
      : analyzeResumeOnly(resumeText);

    return NextResponse.json(result);
  } catch (error) {
    console.error('ATS route error:', error);
    return NextResponse.json({ error: 'Failed to process ATS check' }, { status: 500 });
  }
}
