import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { SyncModule } from "./sync/sync.module";
import { ConnectionsModule } from "./connections/connections.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { PnlModule } from "./pnl/pnl.module";
import { CostsModule } from "./costs/costs.module";
import { ShopsModule } from "./shops/shops.module";
import { OrdersModule } from "./orders/orders.module";
import { ProductsModule } from "./products/products.module";
import { AdsModule } from "./ads/ads.module";
import { ReturnsModule } from "./returns/returns.module";
import { FinanceModule } from "./finance/finance.module";
import { CustomersModule } from "./customers/customers.module";
import { AlertsModule } from "./alerts/alerts.module";
import { ReportsModule } from "./reports/reports.module";
import { MembersModule } from "./orgs/members.module";
import { AdminModule } from "./admin/admin.module";
import { BillingModule } from "./billing/billing.module";

@Module({
  imports: [
    AuthModule, SyncModule, ConnectionsModule, WebhooksModule, PnlModule, CostsModule, ShopsModule, OrdersModule, ProductsModule,
    AdsModule, ReturnsModule, FinanceModule, CustomersModule, AlertsModule, ReportsModule, MembersModule, AdminModule, BillingModule,
  ],
})
export class AppModule {}
