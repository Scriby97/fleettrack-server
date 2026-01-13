# Multi-Tenancy Implementierung - FleetTrack

## Übersicht

Diese Implementierung fügt Multi-Tenancy über Organisationen hinzu. Die Architektur nutzt einen **Single-Instance Ansatz** mit Daten-Isolation auf Datenbankebene.

## Architektur

### Rollen-Hierarchie

```
SUPER_ADMIN (super_admin)
  └─ Kann mehrere Organisationen verwalten
  └─ Voller Zugriff auf alle Daten
  └─ Kann Organisationen erstellen/löschen

ADMIN (admin)
  └─ Admin innerhalb einer Organisation
  └─ Kann nur Daten der eigenen Organisation sehen/bearbeiten
  └─ Kann Fahrzeuge und User verwalten

USER (user)
  └─ Normaler Benutzer innerhalb einer Organisation
  └─ Kann Daten lesen und Usages erstellen
```

### Datenmodell

```
Organization
  ├─ id (UUID)
  ├─ name (String, unique)
  ├─ subdomain (String, optional, unique)
  ├─ isActive (Boolean)
  └─ contactEmail (String, optional)

UserProfile
  ├─ organizationId (UUID) → Organization
  └─ ... weitere Felder

Vehicle
  ├─ organizationId (UUID) → Organization
  └─ ... weitere Felder

Usage (indirekt über Vehicle.organizationId isolated)
```

## Neue Endpunkte

### Organizations

```
POST   /organizations              [SUPER_ADMIN] - Org erstellen
GET    /organizations              [SUPER_ADMIN] - Alle Orgs
GET    /organizations/:id          [SUPER_ADMIN, ADMIN] - Eine Org
PATCH  /organizations/:id          [SUPER_ADMIN] - Org updaten
DELETE /organizations/:id          [SUPER_ADMIN] - Org deaktivieren
```

### Angepasste Endpunkte

- `GET /vehicles` - Filtert automatisch nach Organization
- `GET /vehicles/stats` - Filtert automatisch nach Organization
- `POST /vehicles` - Benötigt organizationId
- `GET /auth/users` - Filtert automatisch nach Organization (außer SUPER_ADMIN)

## Verwendung

### 1. Organisation erstellen (als SUPER_ADMIN)

```bash
POST /organizations
{
  "name": "Firma ABC",
  "subdomain": "firma-abc",
  "contactEmail": "admin@firma-abc.de"
}
```

### 2. User für Organisation registrieren

```bash
POST /auth/signup
{
  "email": "user@firma-abc.de",
  "password": "secure123",
  "organizationId": "uuid-der-organisation"
}
```

### 3. Login

Bei erfolgreichem Login wird automatisch die `organizationId` im User-Objekt zurückgegeben:

```json
{
  "access_token": "...",
  "user": {
    "id": "...",
    "role": "user",
    "organizationId": "uuid-der-organisation",
    "organization": { ... }
  }
}
```

## Sicherheit

### Guards

- **SupabaseAuthGuard** - Authentifizierung
- **RolesGuard** - Rollen-basierte Autorisierung
- **OrganizationGuard** - Prüft Organization-Zugehörigkeit

### Automatische Filterung

Alle Abfragen werden automatisch nach Organization gefiltert, außer für SUPER_ADMIN.

## Deployment

### Datenbank-Migration

Führe folgende SQL aus (oder lass TypeORM synchronize=true laufen):

```sql
-- Organizations Tabelle
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL UNIQUE,
  subdomain VARCHAR UNIQUE,
  "isActive" BOOLEAN DEFAULT true,
  "contactEmail" VARCHAR,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- User Profiles erweitern
ALTER TABLE user_profiles 
ADD COLUMN "organizationId" UUID REFERENCES organizations(id);

-- Vehicles erweitern
ALTER TABLE vehicles 
ADD COLUMN "organizationId" UUID NOT NULL REFERENCES organizations(id);

-- Index für bessere Performance
CREATE INDEX idx_vehicles_org ON vehicles("organizationId");
CREATE INDEX idx_users_org ON user_profiles("organizationId");
```

### Supabase Row Level Security (RLS) - Optional

Für zusätzliche Sicherheit auf Supabase-Ebene:

```sql
-- Enable RLS
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users sehen nur Daten ihrer Organisation
CREATE POLICY org_isolation ON vehicles
  USING (
    "organizationId" IN (
      SELECT "organizationId" 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY org_isolation ON user_profiles
  USING (
    "organizationId" IN (
      SELECT "organizationId" 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );
```

## Erste Schritte

1. **Erste Organisation erstellen:**
   - Erstelle manuell einen SUPER_ADMIN User in der Datenbank
   - Setze `role = 'super_admin'` und `organizationId = NULL`

2. **Organisationen anlegen:**
   - Als SUPER_ADMIN einloggen
   - Organisationen über `/organizations` erstellen

3. **User registrieren:**
   - Bei Signup `organizationId` mitgeben
   - User erhalten automatisch die Rolle `user`

## Vorteile dieser Lösung

✅ **Kosteneffizient** - Eine Instanz für alle Organisationen
✅ **Einfaches Deployment** - Einmal deployen, alle Kunden nutzen es
✅ **Skalierbar** - Kann Tausende Organisationen handhaben
✅ **Sichere Isolation** - Daten werden über Foreign Keys isoliert
✅ **Flexibel** - Kann später auf Hybrid-Ansatz erweitert werden

## Nächste Schritte (Optional)

- [ ] API-Rate-Limiting pro Organization
- [ ] Organization-spezifische Settings
- [ ] Multi-User-Support (User können in mehreren Orgs sein)
- [ ] Organization-Billing & Subscriptions
- [ ] Custom Subdomains (firma1.fleettrack.com)
