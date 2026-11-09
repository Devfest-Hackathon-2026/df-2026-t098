import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { webOrigin } from './auth/allowed-origins';
import { frontendDirectory, serveFrontend } from './frontend-static';
import { hardenHttp } from './http-hardening';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  hardenHttp(app);
  // Close the database pool on Cloud Run shutdown.
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  const frontend = frontendDirectory();
  if (frontend) serveFrontend(app, frontend);
  const origin = webOrigin();
  app.enableCors({
    origin: origin ? [origin] : false,
    credentials: true,
  });
  app.use(cookieParser());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
