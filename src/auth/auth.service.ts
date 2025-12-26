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

    // Hole User-Profile mit Rolle aus DB
    const profile = await this.profileRepo.findOne({
      where: { id: data.user.id },
    });

    return {
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      user: {
        ...data.user,
        role: profile?.role || UserRole.USER,
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
  ) {
    const supabase = this.supabaseService.getClient();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          ...metadata,
          role,
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
   */
  async getAllUsers() {
    return this.profileRepo.find();
  }

  /**
   * User-Profile abrufen
   */
  async getUserProfile(userId: string) {
    return this.profileRepo.findOne({ where: { id: userId } });
  }
}
