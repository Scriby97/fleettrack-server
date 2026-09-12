import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '../enums/user-role.enum';
import type { OrganizationMemberEntity } from '../../organizations/organization-member.entity';

export interface AuthUser {
  id: string;
  email?: string;
  role: UserRole;
  [key: string]: any;
}

/**
 * Express-Request, wie er nach SupabaseAuthGuard (und ggf. OrganizationGuard)
 * aussieht - vermeidet `any`-Zugriffe auf request.user/organizationMembership
 * in Guards und Decorators.
 */
export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  organizationMembership?: OrganizationMemberEntity;
}

/**
 * Decorator um den aktuellen authentifizierten User zu holen
 * Verwendet in Controllern: @CurrentUser() user: AuthUser
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user!;
  },
);
