import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import type { CommentDto, ReportDto } from './dto/learning.dto';
import { QuestionsService } from './questions.service';
import type { PublicAuthor } from './learning.types';

interface CommentRow {
  id: string;
  question_id: string;
  text: string;
  kind: 'comment' | 'explanation' | 'question' | 'correction';
  parent_id: string | null;
  deleted_at: Date | null;
  created_at: Date;
  user_id: string;
  username: string | null;
  name: string | null;
  avatar_url: string | null;
  helpful_count: number;
  helpful: boolean;
  question_title?: string;
}

const COMMENT_SELECT = `SELECT c.id,c.question_id,c.text,c.kind,c.parent_id,c.deleted_at,c.created_at,
  u.id AS user_id,u.username,u.name,u.avatar_url,
  CASE WHEN c.deleted_at IS NULL THEN
    (SELECT count(*)::int FROM learning_comment_helpful h WHERE h.comment_id = c.id)
    ELSE 0 END AS helpful_count,
  (c.deleted_at IS NULL AND EXISTS (SELECT 1 FROM learning_comment_helpful h
    WHERE h.comment_id = c.id AND h.user_id = $2::uuid)) AS helpful`;

@Injectable()
export class CommunityService {
  constructor(
    private readonly database: DataSource,
    private readonly questions: QuestionsService,
  ) {}

  async comments(questionId: string, viewerId: string | null) {
    await this.questions.question(questionId);
    const rows: CommentRow[] = await this.database.query(
      `WITH recent AS (
        SELECT id,parent_id FROM learning_comments WHERE question_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC,id DESC LIMIT 50
      ), visible AS (
        SELECT id FROM recent UNION SELECT parent_id FROM recent WHERE parent_id IS NOT NULL
      )
      ${COMMENT_SELECT} FROM learning_comments c JOIN users u ON u.id = c.user_id
      WHERE c.id IN (SELECT id FROM visible) ORDER BY c.created_at,c.id`,
      [questionId, viewerId],
    );
    return { comments: rows.map(commentView) };
  }

  async comment(userId: string, questionId: string, input: CommentDto) {
    const kind = input.kind ?? 'comment';
    const parentId = input.parentId ?? null;
    if (kind !== 'explanation' && input.text.length > 1000)
      throw new BadRequestException(
        'This contribution must contain at most 1000 characters',
      );
    await this.questions.question(questionId);
    const id = await this.database.transaction(async (manager) => {
      // Serialize retries by writer without blocking independent contributors.
      await manager.query('SELECT pg_advisory_xact_lock(1104,hashtext($1))', [
        userId,
      ]);
      if (input.requestId) {
        const [existing] = await manager.query(
          `SELECT id,question_id,text,kind,parent_id,deleted_at FROM learning_comments
          WHERE user_id = $1 AND client_request_id = $2`,
          [userId, input.requestId],
        );
        if (existing) {
          if (existing.deleted_at)
            throw new NotFoundException('Contribution was deleted');
          if (
            existing.question_id !== questionId ||
            existing.text !== input.text ||
            existing.kind !== kind ||
            existing.parent_id !== parentId
          ) {
            throw new ConflictException({
              code: 'REQUEST_MISMATCH',
              message: 'This request was used for another contribution',
            });
          }
          return existing.id as string;
        }
      }
      if (parentId) {
        const [parent] = await manager.query(
          'SELECT question_id,parent_id,deleted_at FROM learning_comments WHERE id = $1 FOR UPDATE',
          [parentId],
        );
        if (
          !parent ||
          parent.question_id !== questionId ||
          parent.parent_id ||
          parent.deleted_at
        )
          throw new BadRequestException(
            'Replies require an existing root contribution on this question',
          );
      }
      const id = randomUUID();
      await manager.query(
        `INSERT INTO learning_comments (id,user_id,question_id,text,kind,parent_id,client_request_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          id,
          userId,
          questionId,
          input.text,
          kind,
          parentId,
          input.requestId ?? null,
        ],
      );
      return id;
    });
    return this.commentById(id, userId);
  }

  async helpful(
    userId: string,
    questionId: string,
    commentId: string,
    helpful: boolean,
  ) {
    return this.database.transaction(async (manager) => {
      const [comment] = await manager.query(
        `SELECT user_id,deleted_at FROM learning_comments
        WHERE id = $1 AND question_id = $2 FOR UPDATE`,
        [commentId, questionId],
      );
      if (!comment || comment.deleted_at)
        throw new NotFoundException('Contribution not found');
      if (comment.user_id === userId)
        throw new BadRequestException(
          'You cannot mark your own contribution helpful',
        );
      if (helpful) {
        await manager.query(
          `INSERT INTO learning_comment_helpful (user_id,comment_id) VALUES ($1,$2)
          ON CONFLICT (user_id,comment_id) DO NOTHING`,
          [userId, commentId],
        );
      } else {
        await manager.query(
          'DELETE FROM learning_comment_helpful WHERE user_id = $1 AND comment_id = $2',
          [userId, commentId],
        );
      }
      const [count] = await manager.query(
        'SELECT count(*)::int AS count FROM learning_comment_helpful WHERE comment_id = $1',
        [commentId],
      );
      return { helpful, helpfulCount: count.count as number };
    });
  }

  async deleteComment(
    userId: string,
    questionId: string,
    commentId: string,
  ): Promise<void> {
    await this.database.transaction(async (manager) => {
      const rows = await manager.query(
        `UPDATE learning_comments SET text = '',deleted_at = coalesce(deleted_at,now())
        WHERE id = $1 AND question_id = $2 AND user_id = $3 RETURNING id`,
        [commentId, questionId, userId],
      );
      if (!rows[0]?.length)
        throw new NotFoundException('Contribution not found');
      await manager.query(
        'DELETE FROM learning_comment_helpful WHERE comment_id = $1',
        [commentId],
      );
    });
  }

  async creator(userId: string, viewerId: string | null) {
    const [user] = await this.database.query(
      'SELECT id,username,name,avatar_url FROM users WHERE id = $1',
      [userId],
    );
    if (!user) throw new NotFoundException('Creator not found');
    const questions = await this.questions.list(
      `WHERE q.author_id = $1 AND q.source = 'community' ORDER BY q.created_at DESC,q.id DESC LIMIT 20`,
      [userId],
      null,
    );
    const explanations: CommentRow[] = await this.database.query(
      `${COMMENT_SELECT},q.title AS question_title
      FROM learning_comments c JOIN users u ON u.id = c.user_id
      JOIN learning_questions q ON q.id = c.question_id
      WHERE c.user_id = $1 AND c.kind = 'explanation' AND c.parent_id IS NULL
        AND c.deleted_at IS NULL ORDER BY c.created_at DESC,c.id DESC LIMIT 20`,
      [userId, viewerId],
    );
    const [counts] = await this.database.query(
      `SELECT
        (SELECT count(*)::int FROM learning_questions WHERE author_id = $1 AND source = 'community') AS questions,
        (SELECT count(*)::int FROM learning_comments WHERE user_id = $1 AND kind = 'explanation'
          AND parent_id IS NULL AND deleted_at IS NULL) AS explanations,
        (SELECT count(*)::int FROM learning_comment_helpful h JOIN learning_comments c ON c.id = h.comment_id
          WHERE c.user_id = $1 AND c.deleted_at IS NULL) AS helpful`,
      [userId],
    );
    return {
      creator: publicAuthor(user, user.id),
      counts,
      questions,
      explanations: explanations.map((row) => ({
        ...commentView(row),
        questionId: row.question_id,
        questionTitle: row.question_title!,
      })),
    };
  }

  async report(userId: string, questionId: string, input: ReportDto) {
    await this.questions.question(questionId);
    const [row] = await this.database.query(
      `INSERT INTO learning_question_reports (user_id,question_id,reason,details)
      VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,question_id,reason) WHERE status = 'open'
      DO UPDATE SET details = EXCLUDED.details,updated_at = now() RETURNING id,status`,
      [userId, questionId, input.reason, input.details ?? ''],
    );
    return { id: row.id as string, status: 'open' as const };
  }

  private async commentById(
    id: string,
    viewerId: string,
    manager: EntityManager = this.database.manager,
  ) {
    const [row]: CommentRow[] = await manager.query(
      `${COMMENT_SELECT} FROM learning_comments c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
      [id, viewerId],
    );
    if (!row) throw new NotFoundException('Contribution not found');
    return commentView(row);
  }
}

function publicAuthor(
  row: {
    username: string | null;
    name: string | null;
    avatar_url: string | null;
  },
  id: string,
): PublicAuthor {
  return {
    id,
    displayName: row.username || row.name || 'Learner',
    avatarUrl: row.avatar_url ?? null,
  };
}

function commentView(row: CommentRow) {
  return {
    id: row.id,
    text: row.deleted_at ? '' : row.text,
    kind: row.kind,
    parentId: row.parent_id,
    deleted: row.deleted_at !== null,
    helpful: row.helpful,
    helpfulCount: row.helpful_count,
    author: publicAuthor(row, row.user_id),
    createdAt: new Date(row.created_at).toISOString(),
  };
}
