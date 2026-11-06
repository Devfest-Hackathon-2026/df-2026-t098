import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  let frontendOrigin: string | false = false;
  try {
    const url = new URL(process.env.FRONTEND_URL ?? '');
    if (url.protocol === 'http:' || url.protocol === 'https:') frontendOrigin = url.origin;
  } catch { /* Cross-origin requests stay disabled without a valid frontend URL. */ }
  app.enableCors({ origin: frontendOrigin, credentials: true });
  app.use(cookieParser());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
