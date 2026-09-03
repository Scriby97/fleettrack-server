import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsService } from './organizations.service';
import { OrganizationsInvitesService } from './organizations-invites.service';
import { OrganizationMembersService } from './organization-members.service';
import { OrganizationSubscriptionsService } from './organization-subscriptions.service';
import { OrganizationsController } from './organizations.controller';
import { InvitesController } from './invites.controller';
import { OrganizationEntity } from './organization.entity';
import { OrganizationMemberEntity } from './organization-member.entity';
import { OrganizationSubscriptionEntity } from './organization-subscription.entity';
import { OrganizationInviteEntity } from './entities/organization-invite.entity';
import { UserProfileEntity } from '../auth/entities/user-profile.entity';
import { VehicleEntity } from '../vehicles/vehicle.entity';
import { AuthModule } from '../auth/auth.module';
import { OrganizationGuard } from '../auth/guards/organization.guard';
import { OrganizationRolesGuard } from '../auth/guards/organization-roles.guard';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrganizationEntity,
      OrganizationMemberEntity,
      OrganizationSubscriptionEntity,
      OrganizationInviteEntity,
      UserProfileEntity,
      // Nur fuer die Fahrzeug-Anzahl beim Free-Limit-Check in
      // OrganizationSubscriptionsService (siehe getOverLieutenantLimitStatus) -
      // kein voller Vehicles-Feature-Import noetig, VehiclesService/-Controller
      // bleiben in AppModule.
      VehicleEntity,
    ]),
    AuthModule,
    forwardRef(() => BillingModule),
  ],
  controllers: [OrganizationsController, InvitesController],
  providers: [
    OrganizationsService,
    OrganizationsInvitesService,
    OrganizationMembersService,
    OrganizationSubscriptionsService,
    OrganizationGuard,
    OrganizationRolesGuard,
  ],
  exports: [
    OrganizationsService,
    OrganizationsInvitesService,
    OrganizationMembersService,
    OrganizationSubscriptionsService,
  ],
})
export class OrganizationsModule {}
