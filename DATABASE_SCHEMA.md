# Datenbank-Schema für FleetTrack Multi-Tenancy mit Multi-Organization Support

## Entity Relationship Diagram

```
                         ┌──────────────────────────┐
                         │   organizations          │
                         ├──────────────────────────┤
                         │ id (UUID, PK)           │
                         │ name (VARCHAR, UNIQUE)   │
                         │ subdomain (VARCHAR?)     │
                         │ isActive (BOOLEAN)       │
                         │ contactEmail (VARCHAR?)  │
                         │ createdAt (TIMESTAMP)    │
                         │ updatedAt (TIMESTAMP)    │
                         └──────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    │ 1:N          │ 1:N          │ 1:N
                    ▼              ▼              ▼
    ┌────────────────────────┐    ┌────────────────────────┐    ┌────────────────────────┐
    │   user_profiles        │    │   vehicles             │    │  organization_members  │
    ├────────────────────────┤    ├────────────────────────┤    ├────────────────────────┤
    │ id (UUID, PK)         │    │ id (UUID, PK)          │    │ id (UUID, PK)          │
    │ email (VARCHAR, UQ)    │    │ name (VARCHAR)         │    │ userId (UUID, FK)  ────┼──┐
    │ role (VARCHAR)         │    │ plate (VARCHAR)        │    │ organizationId (FK)────┼──┼──┐
    │ firstName (VARCHAR?)   │    │ snowsatNumber (VARCHAR)│    │ role (VARCHAR)         │  │  │
    │ lastName (VARCHAR?)    │    │ organizationId (UUID)  ├─┐  │ joinedAt (TIMESTAMP)   │  │  │
    │ createdAt (TIMESTAMP)  │    │ isRetired (BOOLEAN)    │ │  └────────────────────────┘  │  │
    │ updatedAt (TIMESTAMP)  │    │ location (TEXT?)       │ │           N:N               │  │
    └────────────────────────┘    │ vehicleType (TEXT?)    │ │      (junction table)       │  │
            │                     │ fuelType (TEXT?)       │ │                             │  │
            │                     │ notes (TEXT?)          │ │                             │  │
            │                     └────────────────────────┘ │                             │  │
            │ 1:N (creator)              │ 1:N                │                             │  │
            │                            │ (FK)               │                             │  │
            ▼                            ▼                    │                             │  │
    ┌────────────────────────┐    │                    │    │
    │   usages               │    │                    └────┤────────────────────────────┘
    ├────────────────────────┤    │                         │
    │ id (UUID, PK)          │    │                         │
    │ vehicleId (UUID, FK)───┼────┘                         │
    │ creatorId (UUID, FK)───┘                              │
    │ startOperatingHours    │    ┌────────────────────────────────┐
    │ endOperatingHours      │    │   organization_invites         │
    │ fuelLitersRefilled     │    ├────────────────────────────────┤
    │ usageDate              │    │ id (UUID, PK)                  │
    │ creationDate           │    │ token (VARCHAR, UNIQUE)        │
    └────────────────────────┘    │ organizationId (UUID, FK)  ────┤────┐
                                  │ email (VARCHAR)                │    │
                                  │ role (VARCHAR)                 │    │
                                  │ invitedBy (UUID, FK?)          │    │
                                  │ expiresAt (TIMESTAMP)          │    │
                                  │ usedAt (TIMESTAMP?)            │    │
                                  │ usedBy (UUID, FK?)             │    │
                                  │ createdAt (TIMESTAMP)          │    │
                                  └────────────────────────────────┘    │
                                                                        │
                                                       FK ───────────────┘
                                                       zu organizations.id
```

## Tabellen-Details

### 1. organizations
- **Primary Key**: `id`
- **Unique**: `name`, `subdomain`
- **Beziehungen**: 
  - 1:N zu `organization_members` (User-Membership)
  - 1:N zu `vehicles`
  - 1:N zu `organization_invites`

### 2. user_profiles
- **Primary Key**: `id`
- **Unique**: `email`
- **Spalten**: 
  - `role`: Funktionale globale Rolle - nur `'user'` oder `'administrator'`
    - `'user'`: Normaler Benutzer (hat Zugriff auf Organizations durch `organization_members`)
    - `'administrator'`: Systemadministrator (sieht alle Organisationen, keine Membership nötig)
- **Beziehungen**:
  - 1:N zu `organization_members` (Membership in Orgs)
  - 1:N zu `usages` (als creator)
  - 1:N zu `organization_invites` (als invitedBy/usedBy)

### 3. organization_members (NEW - Junction Table)
- **Primary Key**: `id`
- **Foreign Keys**: 
  - `userId` → `user_profiles.id` (ON DELETE CASCADE)
  - `organizationId` → `organizations.id` (ON DELETE CASCADE)
- **Unique Constraint**: `(userId, organizationId)` - Ein User kann nur 1x pro Org Mitglied sein
- **Spalten**:
  - `role`: Organisation-spezifische Rolle - `'employee'`, `'admin'` oder `'owner'`
    - `'employee'`: Nur Lesezugriff
    - `'admin'`: Kann Organisation verwalten (Fahrzeuge, Mitglieder)
    - `'owner'`: Kann Organisation löschen
- **Beziehungen**:
  - N:1 zu `user_profiles`
  - N:1 zu `organizations`

### 3b. organization_subscriptions (NEW)
- **Primary Key**: `id`
- **Foreign Keys**: `organizationId` → `organizations.id` (ON DELETE CASCADE)
- **Unique Constraint**: `organizationId` - maximal 1 Subscription pro Organisation
- **Spalten**:
  - `tier`: Stabiler Plan-Key (nicht der Anzeigename!) - `'lieutenant'`, `'captain'` oder `'general'`
    - `'lieutenant'`: Free - bis 2 Fahrzeuge, 5 Mitarbeiter
    - `'captain'`: CHF 99.-/Monat - bis 20 Fahrzeuge, 50 Mitarbeiter
    - `'general'`: CHF 199.-/Monat - unlimitiert
    - Limits/Preise sind bewusst NICHT in der DB, sondern in `SUBSCRIPTION_LIMITS` im Code hinterlegt, damit sich Anzeigenamen/Preise ändern lassen ohne Datenmigration
  - `status`: Billing-Status - `'active'`, `'past_due'` oder `'canceled'`
  - `stripeCustomerId` / `stripeSubscriptionId`: Für spätere Stripe-Integration vorgesehen (nullable)
- **Beziehungen**:
  - 1:1 zu `organizations`

### 4. vehicles
- **Primary Key**: `id`
- **Foreign Keys**: 
  - `organizationId` → `organizations.id` (NOT NULL)
- **Beziehungen**:
  - N:1 zu `organizations`
  - 1:N zu `usages`

### 5. usages
- **Primary Key**: `id`
- **Foreign Keys**: 
  - `vehicleId` → `vehicles.id`
  - `creatorId` → `user_profiles.id`
- **Beziehungen**:
  - N:1 zu `vehicles`
  - N:1 zu `user_profiles`
- **Indirekte Organization**: Über `vehicleId` → `vehicles.organizationId`

### 6. organization_invites
- **Primary Key**: `id`
- **Foreign Keys**: 
  - `organizationId` → `organizations.id`
  - `invitedBy` → `user_profiles.id` (nullable)
  - `usedBy` → `user_profiles.id` (nullable)
- **Unique**: `token`
- **Spalten**:
  - `role`: Welche Organisation-Rolle erhält der User bei Accept (aus `organization_members.role`)
- **Beziehungen**:
  - N:1 zu `organizations`
  - N:1 zu `user_profiles` (invitedBy/usedBy)

## Indexes für Performance

```sql
-- Organization Members (NEW)
CREATE INDEX idx_org_members_user ON organization_members("userId");
CREATE INDEX idx_org_members_org ON organization_members("organizationId");
CREATE INDEX idx_org_members_role ON organization_members(role);

-- Vehicles
CREATE INDEX idx_vehicles_organization ON vehicles("organizationId");

-- User Profiles
-- Removed: idx_users_organization (organizationId column removed)

-- Usages
CREATE INDEX idx_usages_vehicle ON usages("vehicleId");
CREATE INDEX idx_usages_creator ON usages("creatorId");
CREATE INDEX idx_usages_usage_date ON usages("usageDate");

-- Organization Invites
CREATE INDEX idx_invites_token ON organization_invites(token);
CREATE INDEX idx_invites_organization ON organization_invites("organizationId");
CREATE INDEX idx_invites_expires ON organization_invites("expiresAt");
```

## Daten-Isolation & Sicherheit

### Zugriffskontrolle

Alle API-Endpoints müssen folgende Logik implementieren:

**Ist User ein Administrator?**
- Rolle `user_profiles.role = 'administrator'` → Zugriff auf alle Organisationen
- Keine Membership-Prüfung nötig

**Ist User ein normaler User?**
- Rolle `user_profiles.role = 'user'` → Nur Zugriff auf Organisationen in `organization_members`
- Prüfe `organization_members` für die angeforderte `organizationId`
- Prüfe `organization_members.role` für Schreibzugriffe:
  - `'employee'`: Nur Lesen
  - `'admin'`: Lesen & Schreiben (außer Delete)
  - `'owner'`: Vollzugriff (auch Delete)

### Daten nach Organization filtern

```sql
-- Alle Fahrzeuge einer Org
SELECT v.* FROM vehicles v
WHERE v."organizationId" = $1;

-- Alle User einer Org
SELECT up.* FROM user_profiles up
JOIN organization_members om ON up.id = om."userId"
WHERE om."organizationId" = $1
ORDER BY up.email;

-- Alle Usages einer Org (indirekt über vehicles)
SELECT u.* FROM usages u
JOIN vehicles v ON u."vehicleId" = v.id
WHERE v."organizationId" = $1
ORDER BY u."usageDate" DESC;

-- User-Organisationen mit ihren Rollen (View)
SELECT * FROM user_org_memberships
WHERE "userId" = $1;
```

### Beispiel: Guard zur Permission-Prüfung

```typescript
// User ist Administrator?
if (user.role === 'administrator') {
  return true; // Voller Zugriff auf alle Orgs
}

// User ist normaler Benutzer?
if (user.role === 'user') {
  // Prüfe ob User Mitglied dieser Org ist
  const membership = await organizationMembers.findOne({
    userId: user.id,
    organizationId: orgId
  });
  
  if (!membership) {
    throw new ForbiddenException('Not a member of this organization');
  }
  
  // Bei Schreibzugriff: Prüfe Rolle
  if (isWriteOperation && membership.role === 'employee') {
    throw new ForbiddenException('Employee role cannot modify data');
  }
  
  return true;
}
```

## Migration Guide

### Step 1: Führe die neue Migration aus

```bash
# Die Migration 002_multi_tenancy_roles.sql wird automatisch beim Server-Start ausgeführt
# Falls manuell: psql -U postgres -d fleettrack -f migrations/002_multi_tenancy_roles.sql
```

### Step 2: Migriere existierende User-Organization Mappings

Nach der Schema-Migration musst du existierende User zur `organization_members` Tabelle migrieren:

```sql
-- 1. Prüfe existierende Organisationen
SELECT id, name FROM organizations;

-- 2. Erstelle Memberships für existierende User
INSERT INTO organization_members ("userId", "organizationId", role, "joinedAt")
SELECT 
  id,
  (SELECT id FROM organizations ORDER BY "createdAt" LIMIT 1), -- Erste Org
  'admin', -- Setze sie als Admin
  COALESCE("createdAt", CURRENT_TIMESTAMP)
FROM user_profiles
WHERE id NOT IN (SELECT "userId" FROM organization_members)
ON CONFLICT ("userId", "organizationId") DO NOTHING;

-- 3. Verifiziere dass alle normalen User (keine Admins) Memberships haben
SELECT up.id, up.email, COUNT(om.id) as membership_count
FROM user_profiles up
LEFT JOIN organization_members om ON up.id = om."userId"
WHERE up.role = 'user'
GROUP BY up.id, up.email
HAVING COUNT(om.id) = 0;
-- Sollte 0 Reihen zurückgeben
```

### Step 3: Update Rollen-Nomenclature

Die alten Rollen werden automatisch migriert:
- `super_admin` → `administrator` (in `user_profiles.role`)
- `admin` (org-spezifisch) → `admin` (in `organization_members.role`)
- `user` → bleibt `user`

### Step 4: Starte den Server neu

```bash
npm run start:dev
```

TypeORM wird die TypeScript Entities verwenden um die Tabellen-Struktur zu validieren.
