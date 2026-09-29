import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { OrganizationInviteEntity } from './entities/organization-invite.entity';
import { OrganizationEntity } from './organization.entity';
import { OrganizationMemberEntity } from './organization-member.entity';
import { UserRole } from '../auth/enums/user-role.enum';
import {
  AppForbiddenException,
  AppNotFoundException,
} from '../common/exceptions';

describe('OrganizationsInvitesService', () => {
  let service: OrganizationsInvitesService;

  const inviteRepository = {
    delete: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsInvitesService,
        {
          provide: getRepositoryToken(OrganizationInviteEntity),
          useValue: inviteRepository,
        },
        { provide: getRepositoryToken(OrganizationEntity), useValue: {} },
        { provide: getRepositoryToken(OrganizationMemberEntity), useValue: {} },
      ],
    }).compile();

    service = module.get<OrganizationsInvitesService>(
      OrganizationsInvitesService,
    );
  });

  describe('deleteAllForOrganization', () => {
    it('deletes every invite belonging to the organization', async () => {
      await service.deleteAllForOrganization('org-1');

      expect(inviteRepository.delete).toHaveBeenCalledWith({
        organizationId: 'org-1',
      });
    });
  });

  describe('renewInvite', () => {
    const existingInvite = {
      id: 'invite-1',
      organizationId: 'org-1',
      token: 'old-token',
      expiresAt: new Date('2020-01-01T00:00:00.000Z'),
    };

    it('generates a fresh token and pushes the expiry 7 days out, in place', async () => {
      inviteRepository.findOne.mockResolvedValue({ ...existingInvite });
      inviteRepository.save.mockImplementation((invite) =>
        Promise.resolve(invite),
      );

      const before = Date.now();
      const result = await service.renewInvite(
        'invite-1',
        UserRole.ADMINISTRATOR,
        [],
      );
      const after = Date.now();

      expect(inviteRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'invite-1' },
      });
      expect(result.token).not.toBe('old-token');
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(0);

      const expectedMin = before + 7 * 24 * 60 * 60 * 1000;
      const expectedMax = after + 7 * 24 * 60 * 60 * 1000;
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
      expect(inviteRepository.save).toHaveBeenCalledWith(result);
    });

    it('throws not-found when the invite does not exist', async () => {
      inviteRepository.findOne.mockResolvedValue(null);

      await expect(
        service.renewInvite('missing', UserRole.ADMINISTRATOR, []),
      ).rejects.toThrow(AppNotFoundException);
      expect(inviteRepository.save).not.toHaveBeenCalled();
    });

    it("allows a global administrator to renew any organization's invite", async () => {
      inviteRepository.findOne.mockResolvedValue({ ...existingInvite });
      inviteRepository.save.mockImplementation((invite) =>
        Promise.resolve(invite),
      );

      await expect(
        service.renewInvite('invite-1', UserRole.ADMINISTRATOR, []),
      ).resolves.toBeDefined();
    });

    it('allows an org admin/owner managing that organization to renew it', async () => {
      inviteRepository.findOne.mockResolvedValue({ ...existingInvite });
      inviteRepository.save.mockImplementation((invite) =>
        Promise.resolve(invite),
      );

      await expect(
        service.renewInvite('invite-1', UserRole.USER, ['org-1']),
      ).resolves.toBeDefined();
    });

    it("rejects a user who does not manage the invite's organization", async () => {
      inviteRepository.findOne.mockResolvedValue({ ...existingInvite });

      await expect(
        service.renewInvite('invite-1', UserRole.USER, ['org-2']),
      ).rejects.toThrow(AppForbiddenException);
      expect(inviteRepository.save).not.toHaveBeenCalled();
    });
  });
});
