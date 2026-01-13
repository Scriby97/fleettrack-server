import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupabaseService } from '../../supabase/supabase.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UserProfileEntity } from '../entities/user-profile.entity';
import { UserRole } from '../enums/user-role.enum';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);

  constructor(
    private supabaseService: SupabaseService,
    private reflector: Reflector,
    @InjectRepository(UserProfileEntity)
    private profileRepo: Repository<UserProfileEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Prüfe ob Route als public markiert ist
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      this.logger.debug('Route ist als public markiert - überspringe Auth');
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    this.logger.debug(`Auth Header: ${authHeader ? 'vorhanden' : 'fehlt'}`);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('Kein gültiger Authorization Header');
      throw new UnauthorizedException('Kein gültiger Authorization Header');
    }

    const token = authHeader.substring(7); // Entferne "Bearer "
    this.logger.debug(`Token (erste 20 Zeichen): ${token.substring(0, 20)}...`);

    try {
      // Verifiziere Token mit Supabase
      const supabase = this.supabaseService.getClient();
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(token);

      if (error) {
        this.logger.error(`Supabase Auth Fehler: ${error.message}`);
        throw new UnauthorizedException(`Ungültiges Token: ${error.message}`);
      }

      if (!user) {
        this.logger.warn('Kein User trotz fehlendem Error');
        throw new UnauthorizedException('Ungültiges Token');
      }

      this.logger.debug(`User erfolgreich authentifiziert: ${user.email}`);

      // Hole User-Profile mit Rolle aus DB
      let profile = await this.profileRepo.findOne({
        where: { id: user.id },
      });

      this.logger.debug(`DB Lookup für User ID: ${user.id}, Email: ${user.email}`);
      this.logger.debug(`Gefundenes Profil: ${JSON.stringify(profile)}`);

      // Erstelle automatisch ein Profile, falls es nicht existiert
      if (!profile) {
        this.logger.log(`Erstelle neues User-Profile für ${user.email}`);
        profile = this.profileRepo.create({
          id: user.id,
          email: user.email!,
          role: UserRole.USER, // Standard-Rolle
          firstName: user.user_metadata?.firstName,
          lastName: user.user_metadata?.lastName,
        });
        await this.profileRepo.save(profile);
      }

      // Füge User zu Request hinzu für späteren Zugriff
      request.user = {
        id: user.id,
        email: user.email,
        ...user.user_metadata,
        role: profile.role, // DB-Rolle hat Priorität über metadata
        organizationId: profile.organizationId, // Organisation des Users
      };

      this.logger.debug(`User Rolle: ${request.user.role}`);

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Token-Validierung fehlgeschlagen: ${error.message}`);
      throw new UnauthorizedException('Token-Validierung fehlgeschlagen');
    }
  }
}
