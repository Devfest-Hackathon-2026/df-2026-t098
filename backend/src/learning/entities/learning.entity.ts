import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import type {
  Difficulty,
  LearningLanguage,
  LearningPreferences,
} from '../learning.types';

@Entity('learning_preferences')
export class LearningPreferenceEntity {
  @PrimaryColumn('uuid') user_id!: string;
  @Column('jsonb') preferences!: LearningPreferences;
  @Column('timestamptz') updated_at!: Date;
}

@Entity('learning_questions')
export class LearningQuestionEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('varchar') title!: string;
  @Column('text') prompt!: string;
  @Column('text', { nullable: true }) code!: string | null;
  @Column('varchar', { nullable: true }) code_language!: string | null;
  @Column('text', { array: true }) topics!: string[];
  @Column('varchar') difficulty!: Difficulty;
  @Column('varchar') language!: LearningLanguage;
  @Column('varchar') source!: 'ai' | 'community';
  @Column('uuid', { nullable: true }) author_id!: string | null;
  @Column('uuid', { nullable: true }) generated_for!: string | null;
  @Column('text', { select: false }) reference_answer!: string;
  @Column('jsonb', { select: false }) rubric!: string[];
  @Column('varchar') format!:
    'explain' | 'choice' | 'true_false' | 'predict_output' | 'spot_bug';
  @Column('jsonb', { nullable: true }) options!: string[] | null;
  @Column('smallint', { nullable: true, select: false }) correct_option!:
    number | null;
  @Column('text', { nullable: true, select: false }) quick_explanation!:
    string | null;
  @Column('varchar', { nullable: true }) concept!: string | null;
  @Column('timestamptz') created_at!: Date;
}

@Entity('learning_operations')
export class LearningOperationEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid') user_id!: string;
  @Column('varchar') kind!: 'feed' | 'attempt' | 'publish' | 'followup';
  @Column('uuid', { nullable: true }) scope_id!: string | null;
  @Column('varchar') fingerprint!: string;
  @Column('varchar') status!: 'pending' | 'complete' | 'failed';
  @Column('uuid') lease!: string;
  @Column('timestamptz') expires_at!: Date;
  @Column('timestamptz') called_at!: Date;
  @Column('integer') call_count!: number;
  @Column('jsonb', { nullable: true }) result!: unknown;
  @Column('timestamptz') created_at!: Date;
}

@Entity('learning_attempts')
export class LearningAttemptEntity {
  @PrimaryColumn('uuid') id!: string;
  @Column('uuid') user_id!: string;
  @Column('uuid') question_id!: string;
  @Column('text', { select: false }) answer!: string;
  @Column('integer') score!: number;
  @Column('text') feedback!: string;
  @Column('jsonb') improvements!: string[];
  @Column('text') explanation!: string;
  @Column('integer') xp_awarded!: number;
  @Column('date') day!: string;
  @Column('timestamptz') created_at!: Date;
}

@Entity('learning_question_progress')
export class LearningQuestionProgressEntity {
  @PrimaryColumn('uuid') user_id!: string;
  @PrimaryColumn('uuid') question_id!: string;
  @Column('integer') attempt_count!: number;
  @Column('integer') last_score!: number;
  @Column('boolean') passed!: boolean;
  @Column('boolean') needs_review!: boolean;
  @Column('integer') xp_earned!: number;
  @Column('smallint') box!: number;
  @Column('timestamptz', { nullable: true }) due_at!: Date | null;
  @Column('timestamptz', { nullable: true }) last_missed_at!: Date | null;
  @Column('timestamptz') updated_at!: Date;
}

@Entity('learning_taps')
export class LearningTapEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') user_id!: string;
  @Column('uuid') question_id!: string;
  @Column('smallint') choice!: number;
  @Column('boolean') correct!: boolean;
  @Column('boolean') review!: boolean;
  @Column('integer') xp_awarded!: number;
  @Column('date') day!: string;
  @Column('timestamptz') created_at!: Date;
}

@Entity('learning_daily_challenges')
export class LearningDailyChallengeEntity {
  @PrimaryColumn('date') day!: string;
  @PrimaryColumn('varchar') language!: LearningLanguage;
  @Column('uuid') question_id!: string;
}

@Entity('learning_reactions')
export class LearningReactionEntity {
  @PrimaryColumn('uuid') user_id!: string;
  @PrimaryColumn('uuid') question_id!: string;
  @Column('boolean') liked!: boolean;
  @Column('boolean') saved!: boolean;
  @Column('timestamptz') updated_at!: Date;
}

@Entity('learning_comments')
export class LearningCommentEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') user_id!: string;
  @Column('uuid') question_id!: string;
  @Column('text') text!: string;
  @Column('varchar') kind!:
    'comment' | 'explanation' | 'question' | 'correction';
  @Column('uuid', { nullable: true }) parent_id!: string | null;
  @Column('uuid', { nullable: true }) client_request_id!: string | null;
  @Column('timestamptz', { nullable: true }) deleted_at!: Date | null;
  @Column('timestamptz') created_at!: Date;
}

@Entity('learning_comment_helpful')
export class LearningCommentHelpfulEntity {
  @PrimaryColumn('uuid') user_id!: string;
  @PrimaryColumn('uuid') comment_id!: string;
  @Column('timestamptz') created_at!: Date;
}

@Entity('learning_question_reports')
export class LearningQuestionReportEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') user_id!: string;
  @Column('uuid') question_id!: string;
  @Column('varchar') reason!:
    'incorrect' | 'unclear' | 'outdated' | 'inappropriate';
  @Column('text') details!: string;
  @Column('varchar') status!: 'open' | 'resolved';
  @Column('timestamptz') created_at!: Date;
  @Column('timestamptz') updated_at!: Date;
}

@Entity('learning_comment_reports')
export class LearningCommentReportEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') user_id!: string;
  @Column('uuid') comment_id!: string;
  @Column('varchar') reason!: 'spam' | 'harassment' | 'inappropriate' | 'other';
  @Column('text') details!: string;
  @Column('varchar') status!: 'open' | 'resolved';
  @Column('timestamptz') created_at!: Date;
  @Column('timestamptz') updated_at!: Date;
}

@Entity('learning_user_blocks')
export class LearningUserBlockEntity {
  @PrimaryColumn('uuid') blocker_id!: string;
  @PrimaryColumn('uuid') blocked_id!: string;
  @Column('timestamptz') created_at!: Date;
}

export const LEARNING_ENTITIES = [
  LearningPreferenceEntity,
  LearningQuestionEntity,
  LearningOperationEntity,
  LearningAttemptEntity,
  LearningQuestionProgressEntity,
  LearningReactionEntity,
  LearningCommentEntity,
  LearningTapEntity,
  LearningDailyChallengeEntity,
  LearningCommentHelpfulEntity,
  LearningQuestionReportEntity,
  LearningCommentReportEntity,
  LearningUserBlockEntity,
];
