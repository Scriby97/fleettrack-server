import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsService } from './organizations.service';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { OrganizationsController } from './organizations.controller';
import { InvitesController } from './invites.controller';
import { OrganizationEntity } from './organization.entity';
import { OrganizationInviteEntity } from './entities/organization-invite.entity';
import { UserProfileEntity } from '../auth/entities/user-profile.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationEntity, OrganizationInviteEntity, UserProfileEntity]),
    AuthModule,
  ],
  controllers: [OrganizationsController, InvitesController],
  providers: [OrganizationsService, OrganizationsInvitesService],
  exports: [OrganizationsService, OrganizationsInvitesService],
})
export class OrganizationsModule {}
