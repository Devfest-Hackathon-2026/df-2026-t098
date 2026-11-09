import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { PublicConfigController } from './public-config';
import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppDataSource } from './datasource';
import { UsersModule } from './users/users.module';
import { LearningModule } from './learning/learning.module';

@Module({
  imports: [AuthModule, TypeOrmModule.forRoot(AppDataSource.options), UsersModule, LearningModule],
  controllers: [AppController, HealthController, PublicConfigController],
  providers: [AppService],
})
export class AppModule {}
