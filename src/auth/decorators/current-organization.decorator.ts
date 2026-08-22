import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { OrganizationMemberEntity } from '../../organizations/organization-member.entity';

/**
 * Decorator to get current organization info
 * Returns the organization ID from request params or the membership info if available
 */
export const CurrentOrganization = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    
    // If membership was set by OrganizationGuard, return organization ID from it
    if (request.organizationMembership) {
      return request.organizationMembership.organizationId;
    }

    // Otherwise try to get from params
    return request.params?.organizationId;
  },
);

/**
 * Decorator to get current organization membership info
 * Returns the full membership object with role
 */
export const CurrentOrganizationMembership = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): OrganizationMemberEntity | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.organizationMembership;
  },
);
