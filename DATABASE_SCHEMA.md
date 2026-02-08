# Datenbank-Schema für FleetTrack Multi-Tenancy

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
         │ 1:N
         ├──────────────────────────────┐
         │                              │
         │                              │
         ▼                              ▼
┌────────────────────────┐     ┌────────────────────────┐
│   user_profiles        │     │   vehicles             │
├────────────────────────┤     ├────────────────────────┤
│ id (UUID, PK)         │     │ id (UUID, PK)          │
│ email (VARCHAR, UQ)    │     │ name (VARCHAR)         │
│ role (VARCHAR)         │     │ plate (VARCHAR)        │
│ organizationId (UUID)  │─┐   │ snowsatNumber (VARCHAR)│
│ firstName (VARCHAR?)   │ │   │ organizationId (UUID)  │───┐
│ lastName (VARCHAR?)    │ │   └────────────────────────┘   │
│ createdAt (TIMESTAMP)  │ │                                │
│ updatedAt (TIMESTAMP)  │ │                                │
└────────────────────────┘ │                                │
                           │                                │
                           │                                │
         FK ───────────────┘                                │
                                                            │
                                                   FK ──────┘
                                                            │
                                                            │
                           ┌────────────────────────────────┘
                           │
                           │
                           ▼
                  ┌────────────────────────┐
                  │   usages               │
                  ├────────────────────────┤
                  │ id (UUID, PK)          │
                  │ vehicleId (UUID, FK)   │──────┐
                  │ creatorId (UUID, FK)   │──┐   │
                  │ startOperatingHours    │  │   │
                  │ endOperatingHours      │  │   │
                  │ fuelLitersRefilled     │  │   │
                  │ usageDate              │  │   │
                  └────────────────────────┘  │   │
                                              │   │
                           ┌──────────────────┘   │
                           │                      │
                           ▼                      │
                  zu user_profiles.id             │
                                                  │
                           ┌──────────────────────┘
                           │
                           ▼
                  zu vehicles.id


┌────────────────────────────────┐
│   organization_invites         │
├────────────────────────────────┤
│ id (UUID, PK)                  │
│ token (VARCHAR, UNIQUE)        │
│ organizationId (UUID, FK)      │─────┐
│ email (VARCHAR)                │     │
│ role (VARCHAR)                 │     │
│ invitedBy (UUID?)              │     │
│ expiresAt (TIMESTAMP)          │     │
│ usedAt (TIMESTAMP?)            │     │
│ usedBy (UUID?)                 │     │
│ createdAt (TIMESTAMP)          │     │
└────────────────────────────────┘     │
                                       │
                     FK ───────────────┘
                     zu organizations.id
```

## Tabellen-Details

### 1. organizations
- **Primary Key**: `id`
- **Unique**: `name`, `subdomain`
- **Beziehungen**: 
  - 1:N zu `user_profiles`
  - 1:N zu `vehicles`
  - 1:N zu `organization_invites`

### 2. user_profiles
- **Primary Key**: `id`
- **Foreign Keys**: 
  - `organizationId` → `organizations.id` (nullable für super_admin)
- **Unique**: `email`
- **Beziehungen**:
  - N:1 zu `organizations`
  - 1:N zu `usages` (als creator)

### 3. vehicles
- **Primary Key**: `id`
- **Foreign Keys**: 
  - `organizationId` → `organizations.id` (NOT NULL)
- **Beziehungen**:
  - N:1 zu `organizations`
  - 1:N zu `usages`

### 4. usages
- **Primary Key**: `id`
- **Foreign Keys**: 
  - `vehicleId` → `vehicles.id`
  - `creatorId` → `user_profiles.id`
- **Beziehungen**:
  - N:1 zu `vehicles`
  - N:1 zu `user_profiles`
- **Indirekte Organization**: Über `vehicles.organizationId`

### 5. organization_invites
- **Primary Key**: `id`
- **Foreign Keys**: 
  - `organizationId` → `organizations.id`
  - `invitedBy` → `user_profiles.id` (nullable)
  - `usedBy` → `user_profiles.id` (nullable)
- **Unique**: `token`
- **Beziehungen**:
  - N:1 zu `organizations`

## Indexes für Performance

```sql
-- Vehicles
CREATE INDEX idx_vehicles_organization ON vehicles(organizationId);

-- User Profiles
CREATE INDEX idx_users_organization ON user_profiles(organizationId);

-- Usages
CREATE INDEX idx_usages_vehicle ON usages(vehicleId);
CREATE INDEX idx_usages_creator ON usages(creatorId);
CREATE INDEX idx_usages_usage_date ON usages(usageDate);

-- Organization Invites
CREATE INDEX idx_invites_token ON organization_invites(token);
CREATE INDEX idx_invites_organization ON organization_invites(organizationId);
CREATE INDEX idx_invites_expires ON organization_invites(expiresAt);
```

## Daten-Isolation

**Organization-Ebene:**
- Alle Daten werden über `organizationId` isoliert
- `usages` erbt Organization durch `vehicleId` → `vehicles.organizationId`

**Rollen:**
- `super_admin`: Kein `organizationId`, sieht alles
- `admin`: Hat `organizationId`, sieht nur eigene Org
- `user`: Hat `organizationId`, sieht nur eigene Org

## Migration Script

Da bereits Vehicles in der DB existieren, musst du sie einer Organisation zuordnen:

```sql
-- 1. Erstelle Default-Organisation
INSERT INTO organizations (id, name, "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'Default Organization',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
RETURNING id;
-- Merke dir die ID!

-- 2. Update alle existierenden Vehicles (ersetze die UUID!)
UPDATE vehicles 
SET "organizationId" = 'HIER-DIE-UUID-DER-DEFAULT-ORG-EINFÜGEN'
WHERE "organizationId" IS NULL;

-- 3. Update alle existierenden User (außer super_admins)
UPDATE user_profiles 
SET "organizationId" = 'HIER-DIE-UUID-DER-DEFAULT-ORG-EINFÜGEN'
WHERE "organizationId" IS NULL 
  AND role != 'super_admin';

-- 4. Prüfe ob alle Vehicles eine Organization haben
SELECT COUNT(*) FROM vehicles WHERE "organizationId" IS NULL;
-- Sollte 0 sein

-- 5. Jetzt kann TypeORM die NOT NULL Constraint setzen
-- Starte den Server neu
```
