import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

export interface AuthUser {
  id: string;
  email?: string;
  role: UserRole;
  [key: string]: any;
}

/**
 * Decorator um den aktuellen authentifizierten User zu holen
 * Verwendet in Controllern: @CurrentUser() user: AuthUser
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
