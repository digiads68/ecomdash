import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Access } from "../access/access";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Permissions of the signed-in user (set by AuthGuard). */
export const Acc = createParamDecorator((_: unknown, ctx: ExecutionContext): Access => ctx.switchToHttp().getRequest().access);
export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => ctx.switchToHttp().getRequest().access?.userId);
