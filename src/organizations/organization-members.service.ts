import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OrganizationMemberEntity } from './organization-member.entity';
import { OrganizationRole } from '../auth/enums/user-role.enum';

@Injectable()
export class OrganizationMembersService {
  constructor(
    @InjectRepository(OrganizationMemberEntity)
    private readonly memberRepository: Repository<OrganizationMemberEntity>,
  ) {}

  /**
   * Alle Mitglieder einer Organisation inkl. User-Daten
   */
  async findByOrganization(
    organizationId: string,
  ): Promise<OrganizationMemberEntity[]> {
    return this.memberRepository.find({
      where: { organizationId },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
    });
  }

  /**
   * Fügt einen User als Owner einer Organisation hinzu (Self-Service-Erstellung)
   */
  async addOwner(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMemberEntity> {
    const member = this.memberRepository.create({
      organizationId,
      userId,
      role: OrganizationRole.OWNER,
    });
    return this.memberRepository.save(member);
  }

  /**
   * Alle Organisationen, in denen ein User Mitglied ist
   */
  async findByUser(userId: string): Promise<OrganizationMemberEntity[]> {
    return this.memberRepository.find({
      where: { userId },
      relations: ['organization'],
      order: { joinedAt: 'ASC' },
    });
  }

  /**
   * IDs aller Organisationen, in denen ein User Mitglied ist.
   * Für Daten-Scoping bei normalen Usern (vehicles/usages) - ein leeres Array
   * bedeutet, der User gehört keiner Organisation an und darf keine Daten sehen.
   */
  async getOrganizationIds(userId: string): Promise<string[]> {
    const memberships = await this.memberRepository.find({
      where: { userId },
      select: ['organizationId'],
    });
    return memberships.map((membership) => membership.organizationId);
  }

  /**
   * IDs aller Organisationen, in denen der User Admin oder Owner ist.
   * Owner hat automatisch auch alle Admin-Rechte (Rollen-Hierarchie owner > admin > employee).
   */
  async getManagedOrganizationIds(userId: string): Promise<string[]> {
    const memberships = await this.memberRepository.find({
      where: {
        userId,
        role: In([OrganizationRole.ADMIN, OrganizationRole.OWNER]),
      },
      select: ['organizationId'],
    });
    return memberships.map((membership) => membership.organizationId);
  }

  /**
   * Die Mitgliedschaft eines Users in einer bestimmten Organisation (oder null)
   */
  async findMembership(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationMemberEntity | null> {
    return this.memberRepository.findOne({ where: { userId, organizationId } });
  }

  async updateRole(
    organizationId: string,
    memberId: string,
    role: OrganizationRole,
  ): Promise<OrganizationMemberEntity> {
    const member = await this.findMemberOrThrow(organizationId, memberId);

    if (
      member.role === OrganizationRole.OWNER &&
      role !== OrganizationRole.OWNER
    ) {
      await this.assertNotLastOwner(organizationId);
    }

    member.role = role;
    return this.memberRepository.save(member);
  }

  async remove(organizationId: string, memberId: string): Promise<void> {
    const member = await this.findMemberOrThrow(organizationId, memberId);

    if (member.role === OrganizationRole.OWNER) {
      await this.assertNotLastOwner(organizationId);
    }

    await this.memberRepository.remove(member);
  }

  private async findMemberOrThrow(
    organizationId: string,
    memberId: string,
  ): Promise<OrganizationMemberEntity> {
    const member = await this.memberRepository.findOne({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('Organization member not found');
    }

    return member;
  }

  private async assertNotLastOwner(organizationId: string): Promise<void> {
    const ownerCount = await this.memberRepository.count({
      where: { organizationId, role: OrganizationRole.OWNER },
    });

    if (ownerCount <= 1) {
      throw new BadRequestException(
        'Cannot remove or demote the last owner of an organization',
      );
    }
  }
}
