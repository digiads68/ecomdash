import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ClerkGuard } from "./clerk.guard";
import { AuthController } from "./auth.controller";

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ClerkGuard,
    },
  ],
})
export class AuthModule {}
