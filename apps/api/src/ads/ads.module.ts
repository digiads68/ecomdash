import { Module } from "@nestjs/common";
import { AdsController } from "./ads.controller";
import { AdsService } from "./ads.service";
import { MetricsModule } from "../metrics/metrics.module";

@Module({
  imports: [MetricsModule],
  controllers: [AdsController],
  providers: [AdsService],
})
export class AdsModule {}
