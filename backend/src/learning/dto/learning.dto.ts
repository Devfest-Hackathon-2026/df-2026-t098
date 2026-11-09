import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { INTERESTS } from '../learning.catalog';
import type { Difficulty, LearningLanguage } from '../learning.types';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimItems = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item.trim() : item))
    : value;

export class PreferencesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsIn(INTERESTS.map((item) => item.id), { each: true })
  interests!: string[];

  @Transform(trimItems)
  @IsArray()
  @ArrayMaxSize(40)
  @ArrayUnique((item) => (typeof item === 'string' ? item.toLowerCase() : item))
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  technologies!: string[];

  @IsIn(['beginner', 'intermediate', 'advanced'])
  difficulty!: Difficulty;

  @ValidateIf((_object, value) => value !== undefined)
  @IsIn(['ja', 'en'])
  language?: LearningLanguage;
}

export class LanguageDto {
  @IsIn(['ja', 'en'])
  language!: LearningLanguage;
}

export class FeedBatchDto {
  @IsUUID('4')
  requestId!: string;

  @IsIn(['ja', 'en'])
  language!: LearningLanguage;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  excludeQuestionIds?: string[];
}

export class AttemptDto {
  @IsUUID('4')
  requestId!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 6000)
  answer!: string;
}

export class QuestionDto {
  @IsUUID('4')
  requestId!: string;

  @Transform(trim)
  @IsString()
  @Length(3, 160)
  title!: string;

  @Transform(trim)
  @IsString()
  @Length(10, 3000)
  prompt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  code?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 60)
  codeLanguage?: string;

  @Transform(trimItems)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsString({ each: true })
  @Length(1, 60, { each: true })
  topics!: string[];

  @IsIn(['beginner', 'intermediate', 'advanced'])
  difficulty!: Difficulty;

  @IsIn(['ja', 'en'])
  language!: LearningLanguage;

  @Transform(trim)
  @IsString()
  @Length(10, 6000)
  referenceAnswer!: string;

  @IsOptional()
  @IsIn(['choice', 'true_false', 'predict_output', 'spot_bug'])
  format?: 'choice' | 'true_false' | 'predict_output' | 'spot_bug';

  @IsOptional()
  @Transform(trimItems)
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  correctOption?: number;
}

export class TapDto {
  @IsInt()
  @Min(0)
  @Max(3)
  choice!: number;
}

export class GuestAnswerDto extends TapDto {
  @IsUUID()
  questionId!: string;
}

export class GuestAnswersDto {
  @IsUUID()
  accountId!: string;

  @IsUUID('4')
  requestId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => GuestAnswerDto)
  answers!: GuestAnswerDto[];
}

export class FollowUpDto {
  @IsUUID('4')
  requestId!: string;

  @Transform(trim)
  @IsString()
  @Length(1, 500)
  question!: string;
}

export class LikeDto {
  @IsBoolean()
  liked!: boolean;
}

export class SaveDto {
  @IsBoolean()
  saved!: boolean;
}

export class CommentDto {
  @Transform(trim)
  @IsString()
  @Length(1, 5000)
  text!: string;

  @IsOptional()
  @IsIn(['comment', 'explanation', 'question', 'correction'])
  kind?: 'comment' | 'explanation' | 'question' | 'correction';

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID('4')
  requestId?: string;
}

export class HelpfulDto {
  @IsBoolean()
  helpful!: boolean;
}

export class ReportDto {
  @IsIn(['incorrect', 'unclear', 'outdated', 'inappropriate'])
  reason!: 'incorrect' | 'unclear' | 'outdated' | 'inappropriate';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  details?: string;
}

export class CommentReportDto {
  @IsIn(['spam', 'harassment', 'inappropriate', 'other'])
  reason!: 'spam' | 'harassment' | 'inappropriate' | 'other';

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000)
  details?: string;
}
