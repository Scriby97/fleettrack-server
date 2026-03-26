import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationInviteEntity } from './entities/organization-invite.entity';
import { OrganizationEntity } from './organization.entity';
import { CreateInviteDto } from './dto/create-invite.dto';
import { UserRole } from '../auth/enums/user-role.enum';
import { randomBytes } from 'crypto';

@Injectable()
export class OrganizationsInvitesService {
  private readonly logger = new Logger(OrganizationsInvitesService.name);

  constructor(
    @InjectRepository(OrganizationInviteEntity)
    private readonly inviteRepository: Repository<OrganizationInviteEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly organizationRepository: Repository<OrganizationEntity>,
  ) {}

  /**
   * Erstellt einen neuen Invite-Link für eine Organisation
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
      role: createInviteDto.role || UserRole.USER,
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
    console.log('🔍 markInviteAsUsed aufgerufen mit:', { token: token.substring(0, 20), userId });
    
    const invite = await this.validateInvite(token);
    console.log('📋 Invite vor Update:', { id: invite.id, usedAt: invite.usedAt, usedBy: invite.usedBy });

    invite.usedAt = new Date();
    invite.usedBy = userId;
    console.log('📝 Invite nach Änderung (vor save):', { id: invite.id, usedAt: invite.usedAt, usedBy: invite.usedBy });

    const saved = await this.inviteRepository.save(invite);
    console.log('💾 Invite nach save:', { id: saved.id, usedAt: saved.usedAt, usedBy: saved.usedBy });
    
    // Verify by re-querying
    const verified = await this.inviteRepository.findOne({ where: { id: invite.id } });
    console.log('✅ Invite nach DB-Query:', verified ? { id: verified.id, usedAt: verified.usedAt, usedBy: verified.usedBy } : 'NOT FOUND IN DB!');

    return saved;
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
   */
  async deleteInvite(inviteId: string): Promise<void> {
    const invite = await this.inviteRepository.findOne({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
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
