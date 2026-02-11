import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;
  private adminSupabase?: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'SUPABASE_URL und SUPABASE_ANON_KEY müssen in .env gesetzt werden',
      );
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Erstellt einen Supabase-Admin-Client (benoetigt Service Role Key).
   */
  getAdminClient(): SupabaseClient {
    if (this.adminSupabase) {
      return this.adminSupabase;
    }

    const supabaseUrl = process.env.SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        'SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY muessen in .env gesetzt werden',
      );
    }

    this.adminSupabase = createClient(supabaseUrl, serviceRoleKey);
    return this.adminSupabase;
  }

  /**
   * Erstellt einen Supabase-Client mit dem Access Token des Users
   * für authentifizierte Anfragen
   */
  getAuthenticatedClient(accessToken: string): SupabaseClient {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

    return createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }
}
