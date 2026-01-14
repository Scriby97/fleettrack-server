import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganizationEntity } from './organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { UserRole } from '../auth/enums/user-role.enum';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly organizationRepository: Repository<OrganizationEntity>,
    private readonly invitesService: OrganizationsInvitesService,
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

    // 2. Erstelle Invite für ersten Admin
    const invite = await this.invitesService.createInvite(
      savedOrganization.id,
      {
        email: createOrganizationDto.adminEmail,
        role: createOrganizationDto.adminRole || UserRole.ADMIN,
      },
      undefined, // invitedBy (Super Admin hat keine ID im Context)
    );

    return {
      organization: savedOrganization,
      inviteToken: invite.token,
    };
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
