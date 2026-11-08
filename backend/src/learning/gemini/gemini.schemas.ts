const text = { type: 'string' };
const nullableText = { type: ['string', 'null'] };
const stringList = { type: 'array', items: text };

const questionProperties = {
  title: text,
  prompt: text,
  code: nullableText,
  codeLanguage: nullableText,
  topics: stringList,
  difficulty: {
    type: 'string',
    enum: ['beginner', 'intermediate', 'advanced'],
  },
  language: { type: 'string', enum: ['ja', 'en'] },
  format: {
    type: 'string',
    enum: ['choice', 'true_false', 'predict_output', 'spot_bug'],
  },
  options: { type: 'array', items: text, minItems: 2, maxItems: 4 },
  correctOption: { type: 'integer', minimum: 0, maximum: 3 },
  quickExplanation: text,
  concept: text,
  referenceAnswer: text,
  rubric: stringList,
};

export function questionGenerationSchema(difficulty: string) {
  return {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 5,
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            ...questionProperties,
            difficulty: { type: 'string', enum: [difficulty] },
          },
          required: Object.keys(questionProperties),
          additionalProperties: false,
        },
      },
    },
    required: ['questions'],
    additionalProperties: false,
  };
}

export const ASSESSMENT_SCHEMA = {
  type: 'object',
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 10 },
    feedback: text,
    improvements: stringList,
    explanation: text,
  },
  required: ['score', 'feedback', 'improvements', 'explanation'],
  additionalProperties: false,
};

export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    referenceAnswer: text,
    rubric: stringList,
    reason: text,
    correctOption: { type: ['integer', 'null'], minimum: 0, maximum: 3 },
    quickExplanation: nullableText,
    concept: nullableText,
  },
  required: [
    'approved',
    'referenceAnswer',
    'rubric',
    'reason',
    'correctOption',
    'quickExplanation',
    'concept',
  ],
  additionalProperties: false,
};

export const FOLLOW_UP_SCHEMA = {
  type: 'object',
  properties: { answer: text },
  required: ['answer'],
  additionalProperties: false,
};
