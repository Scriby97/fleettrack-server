import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrganizationMembersService } from './organization-members.service';
import { OrganizationMemberEntity } from './organization-member.entity';
import { OrganizationRole } from '../auth/enums/user-role.enum';
import {
  AppNotFoundException,
  AppBadRequestException,
} from '../common/exceptions';

describe('OrganizationMembersService', () => {
  let service: OrganizationMembersService;

  const memberRepository = {
    findOne: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationMembersService,
        {
          provide: getRepositoryToken(OrganizationMemberEntity),
          useValue: memberRepository,
        },
      ],
    }).compile();

    service = module.get<OrganizationMembersService>(
      OrganizationMembersService,
    );
  });

  describe('remove', () => {
    it('throws MEMBER_NOT_FOUND when the member does not exist', async () => {
      memberRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('org-1', 'member-1')).rejects.toThrow(
        AppNotFoundException,
      );
      expect(memberRepository.remove).not.toHaveBeenCalled();
    });

    it('removes a non-owner member without checking the owner count', async () => {
      memberRepository.findOne.mockResolvedValue({
        id: 'member-1',
        role: OrganizationRole.EMPLOYEE,
      });

      await service.remove('org-1', 'member-1');

      expect(memberRepository.count).not.toHaveBeenCalled();
      expect(memberRepository.remove).toHaveBeenCalledWith({
        id: 'member-1',
        role: OrganizationRole.EMPLOYEE,
      });
    });

    it('refuses to remove the last owner', async () => {
      memberRepository.findOne.mockResolvedValue({
        id: 'member-1',
        role: OrganizationRole.OWNER,
      });
      memberRepository.count.mockResolvedValue(1);

      await expect(service.remove('org-1', 'member-1')).rejects.toThrow(
        AppBadRequestException,
      );
      expect(memberRepository.remove).not.toHaveBeenCalled();
    });

    it('removes an owner when at least one other owner remains', async () => {
      memberRepository.findOne.mockResolvedValue({
        id: 'member-1',
        role: OrganizationRole.OWNER,
      });
      memberRepository.count.mockResolvedValue(2);

      await service.remove('org-1', 'member-1');

      expect(memberRepository.remove).toHaveBeenCalled();
    });
  });
});
