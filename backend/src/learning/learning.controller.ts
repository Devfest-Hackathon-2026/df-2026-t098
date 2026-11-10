import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseFilters,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthOriginGuard } from '../auth/guards/origin.guard';
import { TapOriginGuard } from './tap-origin.guard';
import { JsonBodyGuard } from '../auth/guards/json-body.guard';
import { DatabaseErrorFilter } from '../auth/filters/database-error.filter';
import { JwtGuard } from '../auth/jwt/jwt.guard';
import type { AuthenticatedRequest } from '../auth/jwt/jwt.dto';
import { AssessmentService } from './assessment.service';
import { CommunityService } from './community.service';
import {
  AttemptDto,
  CommentDto,
  CommentReportDto,
  HelpfulDto,
  ReportDto,
  FeedBatchDto,
  FollowUpDto,
  GuestAnswersDto,
  LikeDto,
  LanguageDto,
  PreferencesDto,
  QuestionDto,
  SaveDto,
  TapDto,
} from './dto/learning.dto';
import { INTERESTS, TECHNOLOGIES } from './learning.catalog';
import {
  LearningThrottleGuard,
  OptionalLearningAuthGuard,
} from './learning.guards';
import { LearningService } from './learning.service';
import { QuestionsService } from './questions.service';
import { PracticeService } from './practice.service';
import type { Difficulty, LearningLanguage } from './learning.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function language(value: unknown): LearningLanguage {
  if (value !== 'ja' && value !== 'en')
    throw new BadRequestException('Unsupported language');
  return value;
}

function list(value: unknown, maximum: number): string[] {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string') throw new BadRequestException('Invalid list');
  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length > maximum || items.some((item) => item.length > 60))
    throw new BadRequestException('Invalid list');
  return items;
}

const validation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
const authenticatedWrite = [
  JwtGuard,
  AuthOriginGuard,
  JsonBodyGuard,
  LearningThrottleGuard,
];

@Controller('learning')
@UseFilters(DatabaseErrorFilter)
@UsePipes(validation)
export class LearningController {
  constructor(
    private readonly learning: LearningService,
    private readonly questions: QuestionsService,
    private readonly assessment: AssessmentService,
    private readonly practice: PracticeService,
    private readonly contributions: CommunityService,
  ) {}

  @Get('catalog')
  @UseGuards(LearningThrottleGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  catalog() {
    return { interests: INTERESTS, technologies: TECHNOLOGIES };
  }

  @Get('preferences')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  preferences(@Req() request: AuthenticatedRequest) {
    return this.learning.preferences(request.user!.sub);
  }

  @Put('preferences')
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  savePreferences(
    @Req() request: AuthenticatedRequest,
    @Body() body: PreferencesDto,
  ) {
    return this.learning.savePreferences(request.user!.sub, body);
  }

  @Patch('preferences/language')
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  setLanguage(@Req() request: AuthenticatedRequest, @Body() body: LanguageDto) {
    return this.learning.setLanguage(request.user!.sub, body.language);
  }

  @Post('feed/batches')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  batch(@Req() request: AuthenticatedRequest, @Body() body: FeedBatchDto) {
    return this.learning.batch(request.user!.sub, body);
  }

  @Get('feed/pool')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OptionalLearningAuthGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  pool(
    @Req() request: AuthenticatedRequest,
    @Query('language') lang = 'ja',
    @Query('topics') topics?: string,
    @Query('difficulty') difficulty?: string,
    @Query('exclude') exclude?: string,
  ) {
    if (
      difficulty &&
      !['beginner', 'intermediate', 'advanced'].includes(difficulty)
    )
      throw new BadRequestException('Unsupported difficulty');
    const excluded = list(exclude, 300);
    if (excluded.some((id) => !UUID.test(id)))
      throw new BadRequestException('Invalid exclude list');
    return this.learning.pool(
      {
        language: language(lang),
        topics: list(topics, 50),
        difficulty: (difficulty as Difficulty) || null,
        exclude: excluded,
      },
      request.user?.sub ?? null,
    );
  }

  @Get('daily')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OptionalLearningAuthGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  daily(@Req() request: AuthenticatedRequest, @Query('language') lang = 'ja') {
    return this.practice.daily(language(lang), request.user?.sub ?? null);
  }

  @Post('questions/:id/taps')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(
    OptionalLearningAuthGuard,
    TapOriginGuard,
    JsonBodyGuard,
    LearningThrottleGuard,
  )
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  tap(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TapDto,
  ) {
    return this.practice.tap(request.user?.sub ?? null, id, body.choice);
  }

  @Post('guest-answers')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  importGuestAnswers(@Req() request: AuthenticatedRequest, @Body() body: GuestAnswersDto) {
    return this.practice.importGuestAnswers(request.user!.sub, body);
  }

  @Post('questions/:id/follow-ups')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  followUp(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: FollowUpDto,
  ) {
    return this.practice.followUp(request.user!.sub, id, body);
  }

  @Get('community')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OptionalLearningAuthGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  community(
    @Query('language') language = 'ja',
    @Req() request: AuthenticatedRequest,
  ) {
    if (language !== 'ja' && language !== 'en')
      throw new BadRequestException('Unsupported language');
    return this.questions.community(
      language as LearningLanguage,
      request.user?.sub ?? null,
    );
  }

  @Get('questions/:id')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OptionalLearningAuthGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  async question(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return {
      question: await this.questions.question(id, request.user?.sub ?? null),
    };
  }

  @Post('questions')
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  publish(@Req() request: AuthenticatedRequest, @Body() body: QuestionDto) {
    return this.questions.publish(request.user!.sub, body);
  }

  @Post('questions/:id/attempts')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  attempt(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: AttemptDto,
  ) {
    return this.assessment.assess(request.user!.sub, id, body);
  }

  @Get('reviews')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  reviews(@Req() request: AuthenticatedRequest) {
    return this.questions.reviews(request.user!.sub);
  }

  @Get('saved')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  saved(@Req() request: AuthenticatedRequest) {
    return this.questions.saved(request.user!.sub);
  }

  @Get('progress')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  progress(@Req() request: AuthenticatedRequest) {
    return this.assessment.progress(request.user!.sub);
  }

  @Get('leaderboard')
  @Header('Cache-Control', 'no-store')
  @UseGuards(LearningThrottleGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  leaderboard() {
    return this.assessment.leaderboard();
  }

  @Put('questions/:id/like')
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  like(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: LikeDto,
  ) {
    return this.questions.like(request.user!.sub, id, body.liked);
  }

  @Put('questions/:id/save')
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  save(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SaveDto,
  ) {
    return this.questions.save(request.user!.sub, id, body.saved);
  }

  @Get('questions/:id/comments')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OptionalLearningAuthGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  comments(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contributions.comments(id, request.user?.sub ?? null);
  }

  @Post('questions/:id/comments')
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  comment(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CommentDto,
  ) {
    return this.contributions.comment(request.user!.sub, id, body);
  }

  @Delete('questions/:id/comments/:commentId')
  @HttpCode(204)
  @UseGuards(JwtGuard, AuthOriginGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  deleteComment(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
  ) {
    return this.contributions.deleteComment(request.user!.sub, id, commentId);
  }

  @Put('questions/:id/comments/:commentId/helpful')
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  helpful(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Body() body: HelpfulDto,
  ) {
    return this.contributions.helpful(
      request.user!.sub,
      id,
      commentId,
      body.helpful,
    );
  }

  @Get('creators/:userId')
  @Header('Cache-Control', 'no-store')
  @UseGuards(OptionalLearningAuthGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  creator(
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.contributions.creator(userId, request.user?.sub ?? null);
  }

  @Post('questions/:id/reports')
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  report(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ReportDto,
  ) {
    return this.contributions.report(request.user!.sub, id, body);
  }

  @Post('questions/:id/comments/:commentId/reports')
  @Header('Cache-Control', 'no-store')
  @UseGuards(...authenticatedWrite)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  reportComment(
    @Req() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('commentId', new ParseUUIDPipe()) commentId: string,
    @Body() body: CommentReportDto,
  ) {
    return this.contributions.reportComment(
      request.user!.sub,
      id,
      commentId,
      body,
    );
  }

  @Get('blocks')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  blocks(@Req() request: AuthenticatedRequest) {
    return this.contributions.blocks(request.user!.sub);
  }

  // Blocking has no body, so it skips the JSON content-type guard. Cookie
  // sessions are still protected by the origin check.
  @Put('blocks/:userId')
  @Header('Cache-Control', 'no-store')
  @UseGuards(JwtGuard, AuthOriginGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  block(
    @Req() request: AuthenticatedRequest,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.contributions.block(request.user!.sub, userId);
  }

  @Delete('blocks/:userId')
  @HttpCode(204)
  @UseGuards(JwtGuard, AuthOriginGuard, LearningThrottleGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  unblock(
    @Req() request: AuthenticatedRequest,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.contributions.unblock(request.user!.sub, userId);
  }
}
