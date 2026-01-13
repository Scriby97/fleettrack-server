import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

/**
 * Guard zur Sicherstellung, dass User nur auf Daten ihrer eigenen Organisation zugreifen
 */
@Injectable()
export class OrganizationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Super-Admins haben Zugriff auf alle Organisationen
    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    // Normale User und Admins müssen einer Organisation angehören
    if (!user.organizationId) {
      throw new ForbiddenException('User has no organization assigned');
    }

    return true;
  }
}
