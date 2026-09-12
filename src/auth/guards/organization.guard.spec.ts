import { ExecutionContext } from '@nestjs/common';
import { OrganizationGuard } from './organization.guard';
import { UserRole } from '../enums/user-role.enum';
import { OrganizationRole } from '../enums/user-role.enum';
import { AppForbiddenException } from '../../common/exceptions';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';

describe('OrganizationGuard', () => {
  let guard: OrganizationGuard;
  const memberRepo = { findOne: jest.fn() };

  const makeContext = (
    request: Partial<AuthenticatedRequest> & {
      body?: { organizationId?: string };
    },
  ) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new OrganizationGuard(memberRepo as any);
  });

  it('rejects when there is no authenticated user', async () => {
    const context = makeContext({ params: {} } as any);

    await expect(guard.canActivate(context)).rejects.toThrow(
      AppForbiddenException,
    );
  });

  it('lets a global administrator through without checking membership', async () => {
    const context = makeContext({
      user: { id: 'admin-1', role: UserRole.ADMINISTRATOR },
      params: {},
    } as any);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(memberRepo.findOne).not.toHaveBeenCalled();
  });

  it('rejects a normal user when no organizationId is present in params or body', async () => {
    const context = makeContext({
      user: { id: 'user-1', role: UserRole.USER },
      params: {},
      body: {},
    } as any);

    await expect(guard.canActivate(context)).rejects.toThrow(
      AppForbiddenException,
    );
  });

  it('rejects a normal user who is not a member of the organization', async () => {
    memberRepo.findOne.mockResolvedValue(null);
    const context = makeContext({
      user: { id: 'user-1', role: UserRole.USER },
      params: { organizationId: 'org-a' },
    } as any);

    await expect(guard.canActivate(context)).rejects.toThrow(
      AppForbiddenException,
    );
  });

  it('allows a member and attaches the membership to the request', async () => {
    const membership = {
      id: 'member-1',
      userId: 'user-1',
      organizationId: 'org-a',
      role: OrganizationRole.EMPLOYEE,
    };
    memberRepo.findOne.mockResolvedValue(membership);
    const request: any = {
      user: { id: 'user-1', role: UserRole.USER },
      params: { organizationId: 'org-a' },
    };
    const context = makeContext(request);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.organizationMembership).toBe(membership);
  });

  it('falls back to the organizationId from the request body when absent from params', async () => {
    memberRepo.findOne.mockResolvedValue({
      id: 'member-1',
      role: OrganizationRole.ADMIN,
    });
    const context = makeContext({
      user: { id: 'user-1', role: UserRole.USER },
      params: {},
      body: { organizationId: 'org-b' },
    } as any);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(memberRepo.findOne).toHaveBeenCalledWith({
      where: { userId: 'user-1', organizationId: 'org-b' },
    });
  });
});
