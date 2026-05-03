import { Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { ClickHouseService } from "./clickhouse.service";

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, ClickHouseService],
  exports: [ClickHouseService],
})
export class MetricsModule {}
