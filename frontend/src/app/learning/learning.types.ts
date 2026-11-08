export type Language = 'ja' | 'en';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export interface Preferences {
  interests: string[];
  technologies: string[];
  difficulty: Difficulty;
  language?: Language;
}
export interface Author {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}
export type QuestionFormat = 'explain' | 'choice' | 'true_false' | 'predict_output' | 'spot_bug';
export interface QuestionTap {
  choice: number;
  correct: boolean;
  correctOption: number;
  quickExplanation: string;
}
export interface CardReason {
  kind: 'weak' | 'interest' | 'general' | 'challenge' | 'community' | 'review' | 'pool';
  topic: string | null;
}
export interface ReviewInfo {
  box: number;
  missedAt: string | null;
}
export interface QuestionNovelty {
  version: 1;
  exact: string;
  tokens: string[];
  codeKey: string | null;
  /** Canonical key for the idea tested; a shared concept means a repeat. */
  concept?: string;
}
export interface Question {
  id: string;
  title: string;
  prompt: string;
  code: string | null;
  codeLanguage: string | null;
  topics: string[];
  difficulty: Difficulty;
  language: Language;
  source: 'ai' | 'community';
  author: Author | null;
  likes: number;
  liked: boolean;
  saved: boolean;
  createdAt: string;
  format: QuestionFormat;
  options: string[] | null;
  tap: QuestionTap | null;
  reason?: CardReason;
  review?: ReviewInfo;
  references?: { title: string; url: string }[];
  novelty?: QuestionNovelty;
  concept?: string | null;
}
export interface TapResult extends QuestionTap {
  questionId: string;
  xpAwarded: number;
  review: boolean;
  combo: number | null;
  progress: Progress | null;
}
export interface FollowUp {
  id: string;
  questionId: string;
  question: string;
  answer: string;
  createdAt: string;
}
export interface TopicMastery {
  topic: string;
  answered: number;
  correct: number;
  mastery: number;
}
export interface Assessment {
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
export interface Progress {
  totalXp: number;
  level: number;
  streak: number;
  passedQuestions: number;
  correctTaps: number;
  answeredTaps: number;
  combo: number;
  bestCombo: number;
  dailyGoal: number;
  dailyCompleted: number;
  timezone: string;
  topics: TopicMastery[];
  interests: TopicMastery[];
  weeklyHighlight: { topic: string; correct: number } | null;
  achievements: { id: string; earned: boolean }[];
}
export interface Adaptation {
  difficulty: Difficulty;
  previous: Difficulty;
  change: 'up' | 'down' | null;
  weakTopics: string[];
  strongTopics: string[];
}
export interface PoolResult {
  questions: Question[];
  reviewQuestions: Question[];
}
export interface DailyChallenge {
  day: string;
  question: Question | null;
  answered: number;
  solved: number;
  solvers: { rank: number; user: Author; answeredAt: string }[];
  you: { correct: boolean; rank: number | null } | null;
}
export type ContributionKind = 'comment' | 'explanation' | 'question' | 'correction';
export interface QuestionComment {
  id: string;
  text: string;
  author: Author;
  createdAt: string;
  kind?: ContributionKind;
  parentId?: string | null;
  helpful?: boolean;
  helpfulCount?: number;
  deleted?: boolean;
}
export interface CreatorExplanation extends QuestionComment {
  questionId: string;
  questionTitle: string;
}
export interface CreatorProfile {
  creator: Author;
  counts: { questions: number; explanations: number; helpful: number };
  questions: Question[];
  explanations: CreatorExplanation[];
}
export interface Leaderboard {
  weekStart: string;
  timezone: string;
  entries: { rank: number; user: Author; xp: number }[];
}
export interface FeedBatch {
  requestId: string;
  questions: Question[];
  communityQuestion: Question | null;
  reviewQuestions?: Question[];
  adaptation?: Adaptation;
}
export interface Catalog {
  interests: { id: string; label: { ja: string; en: string } }[];
  technologies: string[];
}
export interface NewQuestion {
  requestId: string;
  title: string;
  prompt: string;
  code?: string;
  codeLanguage?: string;
  topics: string[];
  difficulty: Difficulty;
  language: Language;
  referenceAnswer: string;
  format?: Exclude<QuestionFormat, 'explain'>;
  options?: string[];
  correctOption?: number;
}
