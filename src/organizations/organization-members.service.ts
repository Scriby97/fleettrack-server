import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OrganizationMemberEntity } from './organization-member.entity';
import { OrganizationRole } from '../auth/enums/user-role.enum';
import {
  AppBadRequestException,
  AppForbiddenException,
  AppNotFoundException,
  ErrorCode,
} from '../common/exceptions';

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
   * Anzahl Mitglieder einer Organisation - für die Durchsetzung des
   * maxMembers-Tarif-Limits (zusammen mit den offenen Invites gezählt, siehe
   * OrganizationsInvitesService.countPendingByOrganization).
   */
  async countByOrganization(organizationId: string): Promise<number> {
    return this.memberRepository.count({ where: { organizationId } });
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

  /**
   * Ändert die Rolle eines Mitglieds - ausser der Owner-Rolle, die nur über
   * transferOwnership() geändert werden kann (siehe dort). Zusätzlich zur
   * Mindestrolle "Admin" (bereits von OrganizationRolesGuard geprüft) gilt:
   * Nur der Owner darf einen Admin zurück zu Employee degradieren.
   */
  async updateRole(
    organizationId: string,
    memberId: string,
    role: OrganizationRole,
    callerRole: OrganizationRole,
  ): Promise<OrganizationMemberEntity> {
    const member = await this.findMemberOrThrow(organizationId, memberId);

    if (
      member.role === OrganizationRole.OWNER ||
      role === OrganizationRole.OWNER
    ) {
      throw new AppBadRequestException(
        ErrorCode.MEMBER_ROLE_OWNER_VIA_TRANSFER_ONLY,
        'Die Owner-Rolle kann nur über die Rollen-Übergabe geändert werden',
      );
    }

    if (
      member.role === OrganizationRole.ADMIN &&
      role === OrganizationRole.EMPLOYEE &&
      callerRole !== OrganizationRole.OWNER
    ) {
      throw new AppForbiddenException(
        ErrorCode.MEMBER_DEMOTE_FORBIDDEN,
        'Nur der Owner kann einen Admin zum Mitarbeiter zurückstufen',
      );
    }

    member.role = role;
    return this.memberRepository.save(member);
  }

  /**
   * Übergibt die Owner-Rolle atomar an ein anderes Mitglied - der bisherige
   * Owner wird dabei Admin. Läuft in einer Transaktion, damit nie 0 oder 2
   * Owner gleichzeitig existieren können.
   */
  async transferOwnership(
    organizationId: string,
    currentOwnerMembershipId: string,
    newOwnerMemberId: string,
  ): Promise<{
    previousOwner: OrganizationMemberEntity;
    newOwner: OrganizationMemberEntity;
  }> {
    if (newOwnerMemberId === currentOwnerMembershipId) {
      throw new AppBadRequestException(
        ErrorCode.MEMBER_ALREADY_OWNER,
        'Du bist bereits Owner dieser Organisation',
      );
    }

    return this.memberRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(OrganizationMemberEntity);

      const [currentOwner, newOwner] = await Promise.all([
        repo.findOne({
          where: { id: currentOwnerMembershipId, organizationId },
        }),
        repo.findOne({ where: { id: newOwnerMemberId, organizationId } }),
      ]);

      if (!currentOwner || currentOwner.role !== OrganizationRole.OWNER) {
        throw new AppBadRequestException(
          ErrorCode.MEMBER_CURRENT_OWNER_NOT_FOUND,
          'Aktueller Owner konnte nicht ermittelt werden',
        );
      }
      if (!newOwner) {
        throw new AppNotFoundException(
          ErrorCode.MEMBER_TARGET_NOT_FOUND,
          'Ziel-Mitglied nicht gefunden',
        );
      }

      currentOwner.role = OrganizationRole.ADMIN;
      newOwner.role = OrganizationRole.OWNER;
      await repo.save([currentOwner, newOwner]);

      return { previousOwner: currentOwner, newOwner };
    });
  }

  async remove(organizationId: string, memberId: string): Promise<void> {
    const member = await this.findMemberOrThrow(organizationId, memberId);

    if (member.role === OrganizationRole.OWNER) {
      await this.assertNotLastOwner(organizationId);
    }

    await this.memberRepository.remove(member);
  }

  /**
   * Trennt ALLE Mitgliedschaften einer Organisation auf einmal (inkl. Owner) -
   * für den Fall, dass eine Organisation über dem kostenlosen Lieutenant-Limit
   * (Fahrzeuge oder Mitarbeiter) liegt und ihr bezahltes Abo endet (siehe
   * OrganizationSubscriptionsService.downgradeToFree). Löscht bewusst NUR die
   * organization_members-Zeilen (die Verbindung User<->Organisation) - keine
   * Fahrzeuge, Nutzungen oder die Organisation selbst. Alle Daten bleiben
   * erhalten, nur der Zugriff der User geht verloren. Umgeht bewusst
   * assertNotLastOwner(), da hier explizit ALLE Mitglieder getrennt werden sollen.
   */
  async removeAllMembers(organizationId: string): Promise<void> {
    await this.memberRepository.delete({ organizationId });
  }

  private async findMemberOrThrow(
    organizationId: string,
    memberId: string,
  ): Promise<OrganizationMemberEntity> {
    const member = await this.memberRepository.findOne({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new AppNotFoundException(
        ErrorCode.MEMBER_NOT_FOUND,
        'Organization member not found',
      );
    }

    return member;
  }

  private async assertNotLastOwner(organizationId: string): Promise<void> {
    const ownerCount = await this.memberRepository.count({
      where: { organizationId, role: OrganizationRole.OWNER },
    });

    if (ownerCount <= 1) {
      throw new AppBadRequestException(
        ErrorCode.MEMBER_LAST_OWNER,
        'Cannot remove or demote the last owner of an organization',
      );
    }
  }
}
