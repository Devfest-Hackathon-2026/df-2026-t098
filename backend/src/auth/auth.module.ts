import 'dotenv/config';
import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DatabaseErrorFilter } from './filters/database-error.filter';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SessionEntity } from './sessions/session.entity';
import { UsersModule } from '../users/users.module';
import { AuthOriginGuard } from './guards/origin.guard';
import { JsonBodyGuard } from './guards/json-body.guard';
import { JwtGuard } from './jwt/jwt.guard';
import { SessionsService } from './sessions/sessions.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32) {
          throw new Error('JWT_SECRET must be at least 32 characters');
        }
        return { secret, signOptions: { expiresIn: '7d' as const, algorithm: 'HS256' as const } };
      },
    }),
    TypeOrmModule.forFeature([SessionEntity]),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    UsersModule,
  ],
  providers: [AuthService, SessionsService, JwtGuard, AuthOriginGuard, JsonBodyGuard, DatabaseErrorFilter, ThrottlerGuard],
  controllers: [AuthController],
})
export class AuthModule {}
