import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationEntity } from './organization.entity';
import { OrganizationSubscriptionEntity } from './organization-subscription.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { CreateSelfServiceOrganizationDto } from './dto/create-self-service-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { OrganizationSubscriptionsService } from './organization-subscriptions.service';
import { OrganizationMembersService } from './organization-members.service';
import { OrganizationRole } from '../auth/enums/user-role.enum';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly organizationRepository: Repository<OrganizationEntity>,
    private readonly invitesService: OrganizationsInvitesService,
    private readonly subscriptionsService: OrganizationSubscriptionsService,
    private readonly membersService: OrganizationMembersService,
  ) {}

  /**
   * Erstellt eine neue Organization und einen Invite für den ersten Admin
   */
  async create(
    createOrganizationDto: CreateOrganizationDto,
  ): Promise<{ organization: OrganizationEntity; inviteToken: string }> {
    // 1. Erstelle Organization
    const organization = this.organizationRepository.create({
      name: createOrganizationDto.name,
      subdomain: createOrganizationDto.subdomain,
      contactEmail: createOrganizationDto.contactEmail,
    });
    const savedOrganization =
      await this.organizationRepository.save(organization);

    // 2. Erstelle Free-Subscription (Lieutenant) für die neue Organisation
    await this.subscriptionsService.createDefault(savedOrganization.id);

    // 3. Erstelle Invite für ersten Admin
    const invite = await this.invitesService.createInvite(
      savedOrganization.id,
      {
        email: createOrganizationDto.adminEmail,
        role: createOrganizationDto.adminRole || OrganizationRole.ADMIN,
      },
      undefined, // invitedBy (wird vom System erstellt, nicht von einem User)
    );

    return {
      organization: savedOrganization,
      inviteToken: invite.token,
    };
  }

  /**
   * Erstellt eine Organization im Self-Service (durch einen normalen User).
   * Der User wird sofort als Owner eingetragen, die Organisation startet immer
   * auf dem kostenlosen Lieutenant-Tier - ein bezahlter Tier wird erst nach
   * erfolgreichem Stripe-Checkout (Webhook) aktiviert.
   */
  async createSelfService(
    dto: CreateSelfServiceOrganizationDto,
    ownerUserId: string,
  ): Promise<{
    organization: OrganizationEntity;
    subscription: OrganizationSubscriptionEntity;
  }> {
    const organization = this.organizationRepository.create({
      name: dto.name,
      subdomain: dto.subdomain,
      contactEmail: dto.contactEmail,
    });

    let savedOrganization: OrganizationEntity;
    try {
      savedOrganization = await this.organizationRepository.save(organization);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(
          'Eine Organisation mit diesem Namen existiert bereits',
        );
      }
      throw error;
    }

    const subscription = await this.subscriptionsService.createDefault(
      savedOrganization.id,
    );

    await this.membersService.addOwner(savedOrganization.id, ownerUserId);

    return { organization: savedOrganization, subscription };
  }

  async findAll(): Promise<OrganizationEntity[]> {
    return await this.organizationRepository.find({
      where: { isActive: true },
    });
  }

  async findOne(id: string): Promise<OrganizationEntity> {
    const organization = await this.organizationRepository.findOne({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }

    return organization;
  }

  async update(
    id: string,
    updateOrganizationDto: UpdateOrganizationDto,
  ): Promise<OrganizationEntity> {
    const organization = await this.findOne(id);
    Object.assign(organization, updateOrganizationDto);
    return await this.organizationRepository.save(organization);
  }

  async remove(id: string): Promise<void> {
    const organization = await this.findOne(id);
    organization.isActive = false;
    await this.organizationRepository.save(organization);
  }
}
