export type LearningLanguage = 'ja' | 'en';
export type LearningDifficulty = 'beginner' | 'intermediate' | 'advanced';
export type QuizFormat =
  'choice' | 'true_false' | 'predict_output' | 'spot_bug';
export const QUIZ_FORMATS: QuizFormat[] = [
  'choice',
  'true_false',
  'predict_output',
  'spot_bug',
];

export interface GenerationPreferences {
  interests: string[];
  technologies: string[];
  difficulty: string;
  strongTopics?: string[];
}

export interface GeneratedQuestion {
  title: string;
  prompt: string;
  code: string | null;
  codeLanguage: string | null;
  topics: string[];
  difficulty: LearningDifficulty;
  language: LearningLanguage;
  referenceAnswer: string;
  rubric: string[];
  format: QuizFormat | null;
  options: string[] | null;
  correctOption: number | null;
  quickExplanation: string | null;
  concept: string | null;
}

export interface QuestionSubmission {
  title: string;
  prompt: string;
  code?: string | null;
  codeLanguage?: string | null;
  topics: string[];
  difficulty: string;
  language: LearningLanguage;
  referenceAnswer: string;
  format?: QuizFormat | null;
  options?: string[] | null;
  correctOption?: number | null;
}

export interface AnswerAssessment {
  score: number;
  feedback: string;
  improvements: string[];
  explanation: string;
}

export interface QuestionReview {
  approved: boolean;
  referenceAnswer: string;
  rubric: string[];
  reason: string;
  correctOption: number | null;
  quickExplanation: string | null;
  concept: string | null;
}

export interface FollowUpAnswer {
  answer: string;
}
