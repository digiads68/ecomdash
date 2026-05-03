import { Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "./auth/auth.module";
import { MetricsModule } from "./metrics/metrics.module";
import { AlertsModule } from "./alerts/alerts.module";
import { TeamModule } from "./team/team.module";
import { CampaignsModule } from "./campaigns/campaigns.module";
import { BillingModule } from "./billing/billing.module";
import { TiktokModule } from "./tiktok/tiktok.module";
import { ExportModule } from "./export/export.module";
import { TenantMiddleware } from "./common/tenant.middleware";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    AuthModule,
    MetricsModule,
    AlertsModule,
    TeamModule,
    CampaignsModule,
    BillingModule,
    TiktokModule,
    ExportModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
