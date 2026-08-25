import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, IsNull, MoreThan, Repository } from 'typeorm';
import { OrganizationInviteEntity } from './entities/organization-invite.entity';
import { OrganizationEntity } from './organization.entity';
import { OrganizationMemberEntity } from './organization-member.entity';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UserRole, OrganizationRole } from '../auth/enums/user-role.enum';
import { randomBytes } from 'crypto';

@Injectable()
export class OrganizationsInvitesService {
  private readonly logger = new Logger(OrganizationsInvitesService.name);

  constructor(
    @InjectRepository(OrganizationInviteEntity)
    private readonly inviteRepository: Repository<OrganizationInviteEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly organizationRepository: Repository<OrganizationEntity>,
    @InjectRepository(OrganizationMemberEntity)
    private readonly memberRepository: Repository<OrganizationMemberEntity>,
  ) {}

  /**
   * Erstellt einen neuen Invite-Link für eine Organisation
   * Die role ist die OrganizationRole (employee/admin/owner) - nicht die UserRole
   */
  async createInvite(
    organizationId: string,
    createInviteDto: CreateInviteDto,
    invitedBy?: string,
  ): Promise<OrganizationInviteEntity> {
    this.logger.log(
      `createInvite start organizationId=${organizationId} email=${createInviteDto.email} invitedBy=${invitedBy || 'none'}`,
    );

    // Prüfe ob Organisation existiert
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (!organization.isActive) {
      throw new BadRequestException('Organization is not active');
    }

    // Prüfe ob bereits ein aktiver Invite für diese Email existiert
    const existingInvite = await this.inviteRepository.findOne({
      where: {
        organizationId,
        email: createInviteDto.email,
        usedAt: null as any,
      },
    });

    if (existingInvite && existingInvite.expiresAt > new Date()) {
      throw new ConflictException(
        'An active invite for this email already exists',
      );
    }

    // Generiere einzigartigen Token
    const token = this.generateInviteToken();

    // Invite läuft in 7 Tagen ab
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = this.inviteRepository.create({
      token,
      organizationId,
      email: createInviteDto.email,
      role: createInviteDto.role || OrganizationRole.EMPLOYEE,
      invitedBy,
      expiresAt,
    });

    this.logger.log(
      `createInvite prepared invite organizationId=${invite.organizationId} tokenPrefix=${invite.token.substring(0, 10)}`,
    );

    const savedInvite = await this.inviteRepository.save(invite);

    this.logger.log(
      `createInvite saved inviteId=${savedInvite.id} organizationId=${savedInvite.organizationId} tokenPrefix=${savedInvite.token.substring(0, 10)}`,
    );

    return savedInvite;
  }

  /**
   * Validiert einen Invite-Token
   */
  async validateInvite(token: string): Promise<OrganizationInviteEntity> {
    const invite = await this.inviteRepository.findOne({
      where: { token },
      relations: ['organization'],
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.usedAt) {
      throw new BadRequestException('This invite has already been used');
    }

    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('This invite has expired');
    }

    if (!invite.organization.isActive) {
      throw new BadRequestException('Organization is not active');
    }

    return invite;
  }

  /**
   * Markiert einen Invite als verwendet
   */
  async markInviteAsUsed(
    token: string,
    userId: string,
  ): Promise<OrganizationInviteEntity> {
    this.logger.debug(
      `markInviteAsUsed called with token=${token.substring(0, 20)}...`,
    );

    const invite = await this.validateInvite(token);
    this.logger.debug(`Invite before update: id=${invite.id}`);

    invite.usedAt = new Date();
    invite.usedBy = userId;

    const saved = await this.inviteRepository.save(invite);
    this.logger.debug(
      `Invite after save: id=${saved.id}, usedAt=${saved.usedAt}`,
    );

    return saved;
  }

  /**
   * Erstellt eine Organization-Membership für einen User
   * Wird nach erfolgreichem Accept eines Invites aufgerufen
   */
  async createMembership(
    userId: string,
    organizationId: string,
    role: string = OrganizationRole.EMPLOYEE,
  ): Promise<OrganizationMemberEntity> {
    this.logger.log(
      `createMembership userId=${userId} organizationId=${organizationId} role=${role}`,
    );

    // Prüfe ob Membership bereits existiert
    const existingMembership = await this.memberRepository.findOne({
      where: { userId, organizationId },
    });

    if (existingMembership) {
      this.logger.warn(
        `Membership already exists for userId=${userId} organizationId=${organizationId}`,
      );
      return existingMembership;
    }

    const membership = this.memberRepository.create({
      userId,
      organizationId,
      role,
    });

    const saved = await this.memberRepository.save(membership);
    this.logger.log(`Membership created: id=${saved.id}`);

    return saved;
  }

  /**
   * Holt alle offenen (nicht verwendeten, nicht abgelaufenen) Invites für eine Email
   * Für "Meine Einladungen" im Frontend
   */
  async getInvitesByEmail(email: string): Promise<OrganizationInviteEntity[]> {
    return await this.inviteRepository.find({
      where: {
        email: ILike(email),
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: ['organization'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Akzeptiert einen Invite für einen bereits eingeloggten, existierenden User
   * (im Gegensatz zu POST /invites/accept, das immer einen neuen User registriert)
   */
  async acceptInviteForExistingUser(
    token: string,
    userId: string,
    userEmail: string,
  ): Promise<OrganizationMemberEntity> {
    const invite = await this.validateInvite(token);

    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new ForbiddenException(
        'Diese Einladung ist nicht an deine Email-Adresse gerichtet',
      );
    }

    await this.markInviteAsUsed(token, userId);
    return this.createMembership(userId, invite.organizationId, invite.role);
  }

  /**
   * Lehnt einen Invite ab (entfernt ihn), nur der eingeladene User selbst darf das
   */
  async declineInvite(token: string, userEmail: string): Promise<void> {
    const invite = await this.validateInvite(token);

    if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
      throw new ForbiddenException(
        'Diese Einladung ist nicht an deine Email-Adresse gerichtet',
      );
    }

    await this.inviteRepository.remove(invite);
  }

  /**
   * Anzahl offener (nicht verwendeter, nicht abgelaufener) Invites einer
   * Organisation - zählt beim maxMembers-Tarif-Limit mit, damit nicht mehr
   * Invites verschickt werden können als noch freie Plätze vorhanden sind.
   */
  async countPendingByOrganization(organizationId: string): Promise<number> {
    return this.inviteRepository.count({
      where: {
        organizationId,
        usedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  /**
   * Holt alle Invites einer Organisation
   */
  async getInvitesByOrganization(
    organizationId: string,
  ): Promise<OrganizationInviteEntity[]> {
    return await this.inviteRepository.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Holt alle Invites über alle Organisationen
   */
  async getAllInvites(): Promise<OrganizationInviteEntity[]> {
    return await this.inviteRepository.find({
      relations: ['organization'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Löscht einen Invite
   * Administrators can delete any invite
   * Organization admins/owners can only delete invites from organizations they manage
   */
  async deleteInvite(
    inviteId: string,
    userRole?: string,
    managedOrganizationIds?: string[],
  ): Promise<void> {
    const invite = await this.inviteRepository.findOne({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (
      userRole !== UserRole.ADMINISTRATOR &&
      !(managedOrganizationIds ?? []).includes(invite.organizationId)
    ) {
      throw new ForbiddenException(
        'You can only delete invites from your organization',
      );
    }

    await this.inviteRepository.remove(invite);
  }

  /**
   * Generiert einen sicheren, einzigartigen Token
   */
  private generateInviteToken(): string {
    return randomBytes(32).toString('hex');
  }
}
