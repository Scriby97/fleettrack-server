# RLS (Row Level Security) Migration - Anleitung

## Problem
Supabase Security Advisor zeigt 3 Errors:
1. ❌ RLS Disabled in Public - `public.organizations`
2. ❌ RLS Disabled in Public - `public.organization_invites`
3. ⚠️ Sensitive Columns Exposed - `public.organization_invites`

## Lösung
Migration `009_enable_rls_policies.sql` aktiviert RLS auf allen Tabellen und erstellt sichere Policies.

## Migration ausführen

### Option 1: Über Supabase Dashboard (empfohlen)

1. Gehe zu deinem Supabase-Projekt: https://supabase.com/dashboard
2. Navigiere zu **SQL Editor** (linke Sidebar)
3. Klicke auf **New Query**
4. Kopiere den kompletten Inhalt aus `migrations/009_enable_rls_policies.sql`
5. Füge ihn in den SQL Editor ein
6. Klicke auf **Run** (oder Ctrl+Enter)

### Option 2: Über Supabase CLI

```bash
# Falls noch nicht installiert:
npm install -g supabase

# Mit deinem Projekt verbinden:
supabase link --project-ref your-project-ref

# Migration ausführen:
supabase db push migrations/009_enable_rls_policies.sql
```

### Option 3: Manuell via psql

```bash
psql "postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT].supabase.co:5432/postgres" \
  -f migrations/009_enable_rls_policies.sql
```

## Was macht die Migration?

### 1. RLS aktivieren
Aktiviert Row Level Security auf allen Tabellen:
- ✅ `organizations`
- ✅ `organization_invites`
- ✅ `user_profiles`
- ✅ `vehicles`
- ✅ `usages`

### 2. Policies erstellen

#### user_profiles
- Benutzer können ihr eigenes Profil lesen
- Benutzer können ihr eigenes Profil aktualisieren

#### organizations
- Benutzer können ihre eigene Organisation lesen
- Super Admins nutzen Service Role Key (bypassed RLS)

#### organization_invites
- Öffentlicher Zugriff zum Validieren von Invite-Tokens
- Admins können alle Invites ihrer Organisation sehen

#### vehicles
- Benutzer können Fahrzeuge ihrer Organisation sehen

#### usages
- Benutzer können Nutzungen ihrer Organisation sehen (via vehicles)

### 3. Backend-Zugriff
**Wichtig**: Dein NestJS-Backend nutzt den **Service Role Key**, der RLS automatisch umgeht:
- Alle INSERT/UPDATE/DELETE-Operationen laufen über Backend ✅
- RLS schützt nur bei direktem Datenbankzugriff ✅
- Deine bestehende Logik funktioniert weiterhin unverändert ✅

## Nach der Migration

### 1. Security Advisor prüfen
Gehe zu **Advisors** → **Security Advisor** im Supabase Dashboard und klicke auf **Refresh**:
- ✅ Alle "RLS Disabled" Errors sollten weg sein
- ✅ "Sensitive Columns Exposed" Warning sollte weg sein

### 2. Backend testen
```bash
# Backend starten
npm run start:dev

# Teste alle Endpoints:
# - GET /vehicles (sollte funktionieren)
# - GET /usages (sollte funktionieren)
# - POST /organizations (Super Admin)
# - GET /organizations/invites (Invite-Liste)
```

Alle Endpoints sollten weiterhin funktionieren, da das Backend den Service Role Key nutzt.

## Rollback (falls nötig)

Falls du die Policies rückgängig machen möchtest:

```sql
-- RLS deaktivieren
ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invites DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.usages DISABLE ROW LEVEL SECURITY;

-- Policies löschen
DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can read own organization" ON public.organizations;
DROP POLICY IF EXISTS "Users can read invites for their organization" ON public.organization_invites;
DROP POLICY IF EXISTS "Public can read invite by token" ON public.organization_invites;
DROP POLICY IF EXISTS "Users can read vehicles from their organization" ON public.vehicles;
DROP POLICY IF EXISTS "Users can read usages from their organization" ON public.usages;
```

## Sicherheitshinweise

### ✅ Gut
- RLS ist aktiviert (Defense in Depth)
- Backend nutzt Service Role Key (vollständige Kontrolle)
- Policies verhindern unauthorized direct DB access
- Multi-Tenancy ist durch Organization-Filterung gesichert

### ⚠️ Wichtig
- Service Role Key niemals im Frontend nutzen!
- Nur Anon Key im Frontend verwenden
- RLS schützt vor versehentlichem API-Zugriff via PostgREST
- Backend-Logik bleibt die Hauptquelle für Access Control

## Fragen?

- **Funktioniert mein Backend noch?** → Ja! Service Role Key bypassed RLS automatisch
- **Kann ich noch Daten schreiben?** → Ja! Backend nutzt Service Role Key
- **Wozu dann RLS?** → Zusätzlicher Schutz bei direktem DB-Zugriff + fixes Security Warnings
- **Muss ich Code ändern?** → Nein! Alles funktioniert wie vorher
