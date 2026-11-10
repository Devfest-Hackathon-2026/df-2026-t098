import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import { AuthOriginGuard } from '../auth/guards/origin.guard';
import { DatabaseErrorFilter } from '../auth/filters/database-error.filter';
import { JwtGuard } from '../auth/jwt/jwt.guard';
import { AdminGuard } from './admin.guard';

@Controller('admin/reports')
@UseFilters(DatabaseErrorFilter)
@UseGuards(JwtGuard, AdminGuard, ThrottlerGuard)
export class AdminController {
  constructor(private readonly database: DataSource) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  async list(@Query('status') status = 'open', @Query('offset') offset = '0') {
    if (!['open', 'resolved'].includes(status) || !/^\d{1,6}$/.test(offset))
      throw new BadRequestException('Invalid report filter');

    const rows = await this.database.query(
      `SELECT * FROM (
        SELECT 'question' AS type,r.id,r.reason,r.details,r.status,r.created_at,r.updated_at,
          q.id AS question_id,q.title AS question_title,q.prompt AS question_prompt,
          NULL::text AS comment_text,u.username AS reporter
        FROM learning_question_reports r
        JOIN learning_questions q ON q.id = r.question_id
        LEFT JOIN users u ON u.id = r.user_id WHERE r.status = $1
        UNION ALL
        SELECT 'comment' AS type,r.id,r.reason,r.details,r.status,r.created_at,r.updated_at,
          q.id AS question_id,q.title AS question_title,q.prompt AS question_prompt,
          c.text AS comment_text,u.username AS reporter
        FROM learning_comment_reports r
        JOIN learning_comments c ON c.id = r.comment_id
        JOIN learning_questions q ON q.id = c.question_id
        LEFT JOIN users u ON u.id = r.user_id WHERE r.status = $1
      ) reports ORDER BY created_at DESC,id DESC LIMIT 51 OFFSET $2`,
      [status, Number(offset)],
    );
    return { reports: rows.slice(0, 50), hasMore: rows.length > 50 };
  }

  @Patch(':type/:id/:action')
  @Header('Cache-Control', 'no-store')
  @UseGuards(AuthOriginGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async updateStatus(
    @Param('type') type: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('action') action: string,
  ) {
    const table =
      type === 'question'
        ? 'learning_question_reports'
        : type === 'comment'
          ? 'learning_comment_reports'
          : null;
    if (!table) throw new BadRequestException('Invalid report type');
    if (action !== 'resolve' && action !== 'reopen')
      throw new BadRequestException('Invalid report action');
    const status = action === 'resolve' ? 'resolved' : 'open';
    try {
      const [row] = await this.database.query(
        `UPDATE ${table} SET status = $2::varchar,
          updated_at = CASE WHEN status <> $2::varchar THEN now() ELSE updated_at END
          WHERE id = $1 RETURNING id,status`,
        [id, status],
      );
      if (!row) throw new NotFoundException('Report not found');
      return row;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505')
        throw new ConflictException('A newer open report already exists');
      throw error;
    }
  }
}
