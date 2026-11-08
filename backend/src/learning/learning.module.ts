import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { GeminiService } from './gemini/gemini.service';
import { AssessmentService } from './assessment.service';
import { LearningOperationsService } from './learning-operations.service';
import { LearningController } from './learning.controller';
import {
  LearningThrottleGuard,
  OptionalLearningAuthGuard,
} from './learning.guards';
import { LearningService } from './learning.service';
import { CommunityService } from './community.service';
import { QuestionsService } from './questions.service';
import { PracticeService } from './practice.service';
import { QuestionPoolSeeder } from './question-pool.seeder';

@Module({
  imports: [AuthModule],
  controllers: [LearningController],
  providers: [
    GeminiService,
    LearningService,
    QuestionsService,
    CommunityService,
    AssessmentService,
    LearningOperationsService,
    PracticeService,
    QuestionPoolSeeder,
    OptionalLearningAuthGuard,
    LearningThrottleGuard,
  ],
})
export class LearningModule {}
