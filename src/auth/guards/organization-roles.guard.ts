import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationRole } from '../enums/user-role.enum';
import { AppForbiddenException, ErrorCode } from '../../common/exceptions';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';

/**
 * Guard to check if user has required role within an organization
 * Used with @OrganizationRoles(OrganizationRole.ADMIN) decorator
 */
@Injectable()
export class OrganizationRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<OrganizationRole[]>(
      'organizationRoles',
      context.getHandler(),
    );

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const membership = request.organizationMembership;

    if (!membership) {
      throw new AppForbiddenException(
        ErrorCode.AUTH_FORBIDDEN_GENERIC,
        'Organization membership not found in request',
      );
    }

    // Check role hierarchy: owner > admin > employee
    const roleHierarchy = {
      [OrganizationRole.OWNER]: 3,
      [OrganizationRole.ADMIN]: 2,
      [OrganizationRole.EMPLOYEE]: 1,
    };

    const userRoleLevel = roleHierarchy[membership.role];
    const minRequiredLevel = Math.min(
      ...requiredRoles.map((role) => roleHierarchy[role]),
    );

    if (!userRoleLevel || userRoleLevel < minRequiredLevel) {
      throw new AppForbiddenException(
        ErrorCode.AUTH_FORBIDDEN_GENERIC,
        `Requires one of roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
