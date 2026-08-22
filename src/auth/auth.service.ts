import { Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupabaseService } from '../supabase/supabase.service';
import { UserProfileEntity } from './entities/user-profile.entity';
import { UserRole } from './enums/user-role.enum';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private supabaseService: SupabaseService,
    @InjectRepository(UserProfileEntity)
    private profileRepo: Repository<UserProfileEntity>,
  ) {}

  /**
   * Übersetzt Supabase-Fehlermeldungen ins Deutsche
   */
  private translateSupabaseError(errorMessage: string): string {
    const errorTranslations: { [key: string]: string } = {
      'Email not confirmed': 'E-Mail-Adresse wurde noch nicht bestätigt. Bitte überprüfen Sie Ihr Postfach.',
      'Invalid login credentials': 'Ungültige Anmeldedaten. Bitte überprüfen Sie E-Mail und Passwort.',
      'User already registered': 'Benutzer ist bereits registriert.',
      'Password should be at least 6 characters': 'Das Passwort muss mindestens 6 Zeichen lang sein.',
      'Unable to validate email address': 'E-Mail-Adresse konnte nicht validiert werden.',
      'Invalid email': 'Ungültige E-Mail-Adresse.',
      'Signup requires a valid password': 'Registrierung erfordert ein gültiges Passwort.',
      'Invalid Refresh Token': 'Ungültiger Refresh-Token. Bitte melden Sie sich erneut an.',
      'User not found': 'Benutzer nicht gefunden.',
      'Email rate limit exceeded': 'Zu viele E-Mail-Anfragen. Bitte versuchen Sie es später erneut.',
      'Invalid token': 'Ungültiger Token.',
      'Token has expired': 'Token ist abgelaufen. Bitte melden Sie sich erneut an.',
    };

    // Suche nach passender Übersetzung
    for (const [englishError, germanError] of Object.entries(errorTranslations)) {
      if (errorMessage.includes(englishError)) {
        return germanError;
      }
    }

    // Falls keine Übersetzung gefunden wurde, gebe die Original-Nachricht zurück
    return errorMessage;
  }

  private getResetPasswordRedirectUrl(): string | undefined {
    const explicit = process.env.FRONTEND_RESET_PASSWORD_URL?.trim();
    if (explicit) {
      return explicit;
    }

    const base = process.env.FRONTEND_URL?.trim();
    if (!base) {
      return undefined;
    }

    return base.endsWith('/') ? `${base}reset-password` : `${base}/reset-password`;
  }

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
      throw new UnauthorizedException(this.translateSupabaseError(error.message));
    }

    // Hole User-Profile mit globaler Rolle
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
   * Neue User bekommen standardmäßig die Rolle "user" (kein Administrator)
   */
  async signUp(
    email: string,
    password: string,
    metadata?: any,
    role: UserRole = UserRole.USER,
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
        },
      },
    });

    if (error) {
      throw new UnauthorizedException(this.translateSupabaseError(error.message));
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
      throw new UnauthorizedException(this.translateSupabaseError(error.message));
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
      throw new UnauthorizedException(this.translateSupabaseError(error.message));
    }

    return { message: 'Erfolgreich abgemeldet' };
  }

  /**
   * Passwort zurücksetzen (Email senden)
   */
  async resetPassword(email: string) {
    const supabase = this.supabaseService.getClient();
    const redirectTo = this.getResetPasswordRedirectUrl();

    const options = redirectTo ? { redirectTo } : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, options);

    if (error) {
      throw new UnauthorizedException(this.translateSupabaseError(error.message));
    }

    return { message: 'Passwort-Reset Email versendet' };
  }

  /**
   * Admin: Passwort-Reset Email an einen User senden
   * Nur Administratoren dürfen alle User, normale User dürfen keine Passwort-Resets machen
   */
  async adminResetPasswordByUserId(
    userId: string,
    requesterRole: UserRole,
  ) {
    const targetProfile = await this.profileRepo.findOne({ where: { id: userId } });

    if (!targetProfile) {
      throw new UnauthorizedException('User nicht gefunden');
    }

    // Nur Administratoren dürfen Password-Resets initiieren
    if (requesterRole !== UserRole.ADMINISTRATOR) {
      throw new ForbiddenException('Nur Administratoren dürfen Passwort-Resets durchführen');
    }

    const supabase = this.supabaseService.getClient();
    const redirectTo = this.getResetPasswordRedirectUrl();

    const options = redirectTo ? { redirectTo } : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(
      targetProfile.email,
      options,
    );

    if (error) {
      throw new UnauthorizedException(this.translateSupabaseError(error.message));
    }

    return { message: 'Passwort-Reset Email versendet' };
  }

  /**
   * Passwort aktualisieren
   */
  async updatePassword(userId: string, newPassword: string) {
    if (!userId) {
      throw new UnauthorizedException('Kein gültiger Benutzer');
    }

    const adminSupabase = this.supabaseService.getAdminClient();
    const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (error) {
      this.logger.error(`Supabase admin update failed: ${JSON.stringify(error)}`);
      throw new UnauthorizedException(this.translateSupabaseError(error.message));
    }

    return { message: 'Passwort erfolgreich aktualisiert' };
  }

  /**
   * User-Rolle ändern (nur für Administratoren)
   * Setzt die globale funktionale Rolle (user oder administrator)
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
   * Alle User abrufen (nur für Administratoren)
   */
  async getAllUsers() {
    return this.profileRepo.find({
      relations: ['organizationMemberships'],
    });
  }

  /**
   * User-Profile abrufen
   */
  async getUserProfile(userId: string) {
    return this.profileRepo.findOne({
      where: { id: userId },
      relations: ['organizationMemberships'],
    });
  }
}
