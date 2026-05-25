import Anthropic from '@anthropic-ai/sdk';
import { log } from '../utils/logger.js';

// Default model — override with AI_QUIZ_MODEL (e.g. claude-haiku-4-5 for cheapest,
// claude-opus-4-7 for top quality).
const MODEL = process.env.AI_QUIZ_MODEL || 'claude-sonnet-4-6';

export interface GeneratedQuestion {
  question: string;
  choices: string[];
  correct_index: number;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          correct_index: { type: 'integer' },
        },
        required: ['question', 'choices', 'correct_index'],
      },
    },
  },
  required: ['questions'],
};

export async function generateQuizQuestions(
  topic: string,
  count: number,
  language = 'English',
): Promise<GeneratedQuestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('NO_API_KEY');

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content:
        `Generate ${count} factually accurate multiple-choice quiz questions about "${topic}". ` +
        `Write everything in ${language}. ` +
        `Each question must have exactly 4 answer options and exactly one correct answer. ` +
        `Vary which option is correct across questions. Keep each option under 80 characters. ` +
        `Avoid trick or ambiguous questions; the correct answer must be clearly right.`,
    }],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  const raw = textBlock?.text ?? '';

  let parsed: { questions?: GeneratedQuestion[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    log('ERROR', 'AI quiz: model returned non-JSON', raw.slice(0, 200));
    throw new Error('BAD_JSON');
  }

  return (parsed.questions ?? []).filter(q =>
    q
    && typeof q.question === 'string' && q.question.trim().length > 0
    && Array.isArray(q.choices) && q.choices.length === 4
    && q.choices.every(c => typeof c === 'string' && c.trim().length > 0)
    && Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index < 4
  );
}
