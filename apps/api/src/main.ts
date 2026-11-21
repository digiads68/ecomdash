import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { config } from "./config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const c = config();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.setGlobalPrefix("api");
  app.enableCors({ origin: c.APP_URL, credentials: true });
  app.set("trust proxy", true);
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.enableShutdownHooks();
  await app.listen(c.PORT);
  new Logger("Bootstrap").log(`API on http://localhost:${c.PORT}/api (demo=${c.DEMO_MODE}, worker=${c.SYNC_WORKER})`);
}

bootstrap();
