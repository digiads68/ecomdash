import "reflect-metadata";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { config } from "./config";
import { AppModule } from "./app.module";

async function bootstrap() {
  const c = config();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix("api");
  app.enableCors({ origin: c.APP_URL, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.enableShutdownHooks();
  await app.listen(c.PORT);
  new Logger("Bootstrap").log(`API on http://localhost:${c.PORT}/api (AUTH_MODE=${c.AUTH_MODE}, worker=${c.SYNC_WORKER})`);
}

bootstrap();
