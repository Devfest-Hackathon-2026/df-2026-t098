import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppDataSource } from './datasource';
import { UsersModule } from './users/users.module';

@Module({
  imports: [AuthModule, TypeOrmModule.forRoot(AppDataSource.options), UsersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
