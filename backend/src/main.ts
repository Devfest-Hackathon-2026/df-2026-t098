import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { corsOrigins, parseNativeAppOrigins } from './auth/allowed-origins';
import { frontendDirectory, serveFrontend } from './frontend-static';
import { hardenHttp } from './http-hardening';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  hardenHttp(app);
  // Cloud Run sends SIGTERM before stopping an instance; close the server and database cleanly.
  app.enableShutdownHooks();
  app.setGlobalPrefix('api/v1');
  const frontend = frontendDirectory();
  if (frontend) serveFrontend(app, frontend);
  const invalidNativeOrigins = parseNativeAppOrigins(
    process.env.NATIVE_APP_ORIGINS,
  ).invalid;
  if (invalidNativeOrigins.length)
    throw new Error(
      `NATIVE_APP_ORIGINS has ${invalidNativeOrigins.length} invalid entr${invalidNativeOrigins.length === 1 ? 'y' : 'ies'}; ` +
        'use bare origins such as capacitor://localhost or https://localhost',
    );
  // The web origin plus any native app origins. Cross-origin requests stay disabled when neither is set.
  const allowedOrigins = corsOrigins();
  app.enableCors({
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: true,
  });
  app.use(cookieParser());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
