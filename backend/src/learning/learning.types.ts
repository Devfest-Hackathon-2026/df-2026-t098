import type { LearningReference } from './learning.references';
import type { QuestionNovelty } from './question-novelty';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type LearningLanguage = 'ja' | 'en';
export type QuestionFormat =
  'explain' | 'choice' | 'true_false' | 'predict_output' | 'spot_bug';

export interface LearningPreferences {
  interests: string[];
  technologies: string[];
  difficulty: Difficulty;
  language?: LearningLanguage;
}

export interface PublicAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PublicTap {
  choice: number;
  correct: boolean;
  correctOption: number;
  quickExplanation: string;
}

export interface CardReason {
  kind:
    | 'weak'
    | 'interest'
    | 'general'
    | 'challenge'
    | 'community'
    | 'review'
    | 'pool';
  topic: string | null;
}

export interface ReviewInfo {
  box: number;
  missedAt: string | null;
}

export interface PublicQuestion {
  id: string;
  title: string;
  prompt: string;
  code: string | null;
  codeLanguage: string | null;
  topics: string[];
  difficulty: Difficulty;
  language: LearningLanguage;
  source: 'ai' | 'community';
  author: PublicAuthor | null;
  likes: number;
  liked: boolean;
  saved: boolean;
  createdAt: string;
  format: QuestionFormat;
  concept: string | null;
  options: string[] | null;
  tap: PublicTap | null;
  references: LearningReference[];
  novelty: QuestionNovelty;
  reason?: CardReason;
  review?: ReviewInfo;
}

export interface AssessmentResult {
  id: string;
  questionId: string;
  score: number;
  passed: boolean;
  feedback: string;
  improvements: string[];
  explanation: string;
  xpAwarded: number;
  createdAt: string;
}
