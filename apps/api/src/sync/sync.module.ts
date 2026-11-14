import { Global, Module } from "@nestjs/common";
import { PnlComputeService } from "../pnl/pnl-compute.service";
import { AlertsModule } from "../alerts/alerts.module";
import { ReportsModule } from "../reports/reports.module";
import { AdsSyncService } from "./ads-sync.service";
import { ProcessorService } from "./processor.service";
import { QueueService } from "./queue.service";
import { SchedulerService } from "./scheduler.service";
import { ShopSyncService } from "./shop-sync.service";
import { SyncController } from "./sync.controller";
import { SyncStateService } from "./sync-state.service";

@Global()
@Module({
  imports: [AlertsModule, ReportsModule],
  controllers: [SyncController],
  providers: [QueueService, SyncStateService, ShopSyncService, AdsSyncService, PnlComputeService, ProcessorService, SchedulerService],
  exports: [QueueService, PnlComputeService, SchedulerService, ShopSyncService, AdsSyncService],
})
export class SyncModule {}
