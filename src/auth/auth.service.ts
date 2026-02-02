import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupabaseService } from '../supabase/supabase.service';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UserRole } from './enums/user-role.enum';

@Injectable()
export class AuthService {
  constructor(
    private supabaseService: SupabaseService,
    @InjectRepository(UserProfileEntity)
    private profileRepo: Repository<UserProfileEntity>,
  ) {}

  /**
   * Login mit Email und Passwort
   */
  async signIn(email: string, password: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new UnauthorizedException(error.message);
    }

    // Hole User-Profile mit Rolle und Organization aus DB
    const profile = await this.profileRepo.findOne({
      where: { id: data.user.id },
      relations: ['organization'],
    });

    return {
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      user: {
        ...data.user,
        role: profile?.role || UserRole.USER,
        organizationId: profile?.organizationId,
        organization: profile?.organization,
      },
    };
  }

  /**
   * Registrierung mit Email und Passwort
   */
  async signUp(
    email: string,
    password: string,
    metadata?: any,
    role: UserRole = UserRole.USER,
    organizationId?: string,
  ) {
    // Prüfe ob User bereits existiert
    const existingProfile = await this.profileRepo.findOne({ 
      where: { email: email.toLowerCase() } 
    });
    
    if (existingProfile) {
      throw new UnauthorizedException(
        'Ein Benutzer mit dieser E-Mail-Adresse existiert bereits. Bitte verwenden Sie eine andere E-Mail oder kontaktieren Sie den Support.',
      );
    }

    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          ...metadata,
          role,
          organizationId,
        },
      },
    });

    if (error) {
      throw new UnauthorizedException(error.message);
    }

    // Erstelle User-Profile in lokaler DB
    if (data.user) {
      const profile = this.profileRepo.create({
        id: data.user.id,
        email: data.user.email!,
        role,
        organizationId,
        firstName: metadata?.firstName,
        lastName: metadata?.lastName,
      });
      await this.profileRepo.save(profile);
    }

    return {
      user: data.user,
      session: data.session,
      profile: await this.profileRepo.findOne({ where: { id: data.user?.id } }),
    };
  }

  /**
   * Token refresh
   */
  async refreshToken(refreshToken: string) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error) {
      throw new UnauthorizedException(error.message);
    }

    return {
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
    };
  }

  /**
   * Sign Out
   */
  async signOut(accessToken: string) {
    const supabase = this.supabaseService.getAuthenticatedClient(accessToken);
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw new UnauthorizedException(error.message);
    }

    return { message: 'Erfolgreich abgemeldet' };
  }

  /**
   * Passwort zurücksetzen (Email senden)
   */
  async resetPassword(email: string) {
    const supabase = this.supabaseService.getClient();

    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      throw new UnauthorizedException(error.message);
    }

    return { message: 'Passwort-Reset Email versendet' };
  }

  /**
   * Passwort aktualisieren
   */
  async updatePassword(accessToken: string, newPassword: string) {
    const supabase = this.supabaseService.getAuthenticatedClient(accessToken);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      throw new UnauthorizedException(error.message);
    }

    return { message: 'Passwort erfolgreich aktualisiert' };
  }

  /**
   * User-Rolle ändern (nur für Admins)
   */
  async updateUserRole(userId: string, newRole: UserRole) {
    const profile = await this.profileRepo.findOne({ where: { id: userId } });

    if (!profile) {
      throw new UnauthorizedException('User nicht gefunden');
    }

    profile.role = newRole;
    await this.profileRepo.save(profile);

    return { message: 'Rolle erfolgreich aktualisiert', profile };
  }

  /**
   * Alle User mit Profilen abrufen (nur für Admins)
   * Super-Admins sehen alle User, normale Admins nur ihre Organization
   */
  async getAllUsers(organizationId?: string) {
    if (organizationId) {
      return this.profileRepo.find({
        where: { organizationId },
        relations: ['organization'],
      });
    }
    return this.profileRepo.find({ relations: ['organization'] });
  }

  /**
   * User-Profile abrufen
   */
  async getUserProfile(userId: string) {
    return this.profileRepo.findOne({
      where: { id: userId },
      relations: ['organization'],
    });
  }
}
