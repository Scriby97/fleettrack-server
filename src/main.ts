import dns from 'node:dns';
import { ValidationPipe, Logger, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getVersionInfo } from './version';

// Some hosts (e.g. Render) resolve outbound hostnames to IPv6 addresses that
// are unroutable/very slow from there, while IPv4 works fine. This affects
// Node's global fetch (undici) - used by @supabase/supabase-js and jose for
// calls to Supabase - not just the pg connection. Must run before any DNS
// lookups happen, so it's the very first thing in the entrypoint.
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const logger = new Logger('Bootstrap');

  const { version, gitCommit, gitBranch } = getVersionInfo();
  logger.log(
    `Version: ${version} | Commit: ${gitCommit} | Branch: ${gitBranch}`,
  );

  app.setGlobalPrefix('api', {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'https://fleettrack-frontend.vercel.app'];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`Application is running on: ${await app.getUrl()}`);
}
void bootstrap();
