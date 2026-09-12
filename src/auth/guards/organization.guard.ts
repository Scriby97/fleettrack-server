import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../enums/user-role.enum';
import { OrganizationMemberEntity } from '../../organizations/organization-member.entity';
import { AppForbiddenException, ErrorCode } from '../../common/exceptions';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';

/**
 * Guard to ensure users only access organizations they belong to
 * Admins have access to all organizations
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  constructor(
    @InjectRepository(OrganizationMemberEntity)
    private readonly memberRepo: Repository<OrganizationMemberEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Omit<AuthenticatedRequest, 'body'> & {
        body?: { organizationId?: string };
      }
    >();
    const user = request.user;
    const organizationId =
      request.params.organizationId || request.body?.organizationId;

    if (!user) {
      throw new AppForbiddenException(
        ErrorCode.AUTH_FORBIDDEN_GENERIC,
        'User not authenticated',
      );
    }

    // Administrators have access to all organizations
    if (user.role === UserRole.ADMINISTRATOR) {
      return true;
    }

    // Normal users need to be members of the organization
    if (user.role === UserRole.USER) {
      if (!organizationId) {
        throw new AppForbiddenException(
          ErrorCode.VALIDATION_BAD_REQUEST_GENERIC,
          'Organization ID is required',
        );
      }

      const membership = await this.memberRepo.findOne({
        where: {
          userId: user.id,
          organizationId,
        },
      });

      if (!membership) {
        throw new AppForbiddenException(
          ErrorCode.AUTH_FORBIDDEN_GENERIC,
          'User is not a member of this organization',
        );
      }

      // Store membership in request for later use
      request.organizationMembership = membership;
      return true;
    }

    throw new AppForbiddenException(
      ErrorCode.AUTH_FORBIDDEN_GENERIC,
      'Invalid user role',
    );
  }
}
