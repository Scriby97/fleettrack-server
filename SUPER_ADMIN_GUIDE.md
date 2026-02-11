# Super Admin Guide - FleetTrack

## 🔐 Super Admin Rolle

Super Admins haben die höchsten Berechtigungen im System und können:
- ✅ Neue Organizations erstellen
- ✅ Alle Organizations verwalten
- ✅ Invites für beliebige Organizations erstellen
- ✅ Alle Users im System sehen
- ✅ System-weite Einstellungen ändern

## 🏢 Neue Organization erstellen

### 1. API Endpoint

**POST** `/organizations`

**Authentifizierung:** Super Admin Token erforderlich

**Request Body:**
```json
{
  "name": "Acme Transportation GmbH",
  "adminEmail": "admin@acme-transport.com",
  "adminFirstName": "Max",
  "adminLastName": "Mustermann",
  "adminRole": "admin",
  "subdomain": "acme",
  "contactEmail": "info@acme-transport.com"
}
```

**Response:**
```json
{
  "organization": {
    "id": "uuid-hier",
    "name": "Acme Transportation GmbH",
    "subdomain": "acme",
    "contactEmail": "info@acme-transport.com",
    "isActive": true,
    "createdAt": "2026-01-13T10:30:00.000Z",
    "updatedAt": "2026-01-13T10:30:00.000Z"
  },
  "invite": {
    "token": "generated-token-hier",
    "link": "https://app.fleettrack.com/invite/accept?token=...",
    "email": "admin@acme-transport.com",
    "expiresAt": "2026-01-20T10:30:00.000Z"
  }
}
```

### 2. Was passiert im System?

1. ✅ Neue Organization wird in `organizations` Tabelle erstellt
2. ✅ Invite wird in `organization_invites` Tabelle erstellt
   - Token: 56 Zeichen (hex)
   - Gültig für: 7 Tage
   - Rolle: admin (oder super_admin)
3. ✅ Invite-Link wird generiert und zurückgegeben

### 3. Nächste Schritte

1. **Invite-Link an Admin senden**
   - Per Email, Chat oder persönlich
   - Link ist 7 Tage gültig
   
2. **Admin registriert sich**
   - Öffnet Invite-Link
   - Füllt Registrierungsformular aus
   - Wird automatisch der Organization zugewiesen
   
3. **Admin kann loslegen**
   - Weitere User einladen
   - Fahrzeuge anlegen
   - System nutzen

## 📋 Organization-Verwaltung

### Alle Organizations auflisten

**GET** `/organizations`

```bash
curl -X GET http://localhost:3001/organizations \
  -H "Authorization: Bearer <super-admin-token>"
```

Response:
```json
[
  {
    "id": "uuid-1",
    "name": "Default Organization",
    "isActive": true,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  },
  {
    "id": "uuid-2",
    "name": "Acme Transportation GmbH",
    "subdomain": "acme",
    "contactEmail": "info@acme-transport.com",
    "isActive": true,
    "createdAt": "2026-01-13T10:30:00.000Z",
    "updatedAt": "2026-01-13T10:30:00.000Z"
  }
]
```

### Organization Details

**GET** `/organizations/:id`

```bash
curl -X GET http://localhost:3001/organizations/<organization-id> \
  -H "Authorization: Bearer <super-admin-token>"
```

### Organization aktualisieren

**PATCH** `/organizations/:id`

```bash
curl -X PATCH http://localhost:3001/organizations/<organization-id> \
  -H "Authorization: Bearer <super-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Neuer Name",
    "contactEmail": "new@email.com"
  }'
```

### Organization deaktivieren

**DELETE** `/organizations/:id`

```bash
curl -X DELETE http://localhost:3001/organizations/<organization-id> \
  -H "Authorization: Bearer <super-admin-token>"
```

⚠️ **Hinweis:** Organization wird nur deaktiviert (isActive = false), nicht gelöscht!

## 👥 User-Verwaltung

### Alle Users im System

**GET** `/auth/users`

```bash
curl -X GET http://localhost:3001/auth/users \
  -H "Authorization: Bearer <super-admin-token>"
```

Response:
```json
[
  {
    "id": "user-uuid",
    "email": "user@example.com",
    "role": "admin",
    "organizationId": "org-uuid",
    "firstName": "Max",
    "lastName": "Mustermann",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
]
```

### User-Rolle ändern

**PATCH** `/auth/users/:userId/role`

```bash
curl -X PATCH http://localhost:3001/auth/users/<user-id>/role \
  -H "Authorization: Bearer <super-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "super_admin"
  }'
```

### Passwort-Reset Email an User senden

**POST** `/auth/users/:userId/reset-password`

```bash
curl -X POST http://localhost:3001/auth/users/<user-id>/reset-password \
  -H "Authorization: Bearer <super-admin-token>"
```

Hinweis: Admins duerfen nur User ihrer Organization resetten.

## 📨 Invite-Verwaltung für beliebige Organizations

Super Admins können Invites für jede Organization erstellen:

**POST** `/organizations/invites?organizationId=<org-id>`

```bash
curl -X POST "http://localhost:3001/organizations/invites?organizationId=<org-id>" \
  -H "Authorization: Bearer <super-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "role": "user"
  }'
```

## 🔧 Troubleshooting

### Problem: "Forbidden resource" Fehler

**Ursache:** User ist kein Super Admin

**Lösung:**
1. Prüfe User-Rolle in DB:
   ```sql
   SELECT id, email, role FROM user_profiles WHERE email = 'your@email.com';
   ```

2. Falls Rolle nicht `super_admin`, update:
   ```sql
   UPDATE user_profiles SET role = 'super_admin' WHERE email = 'your@email.com';
   ```

### Problem: Invite-Link funktioniert nicht

**Mögliche Ursachen:**
1. Token ist abgelaufen (älter als 7 Tage)
2. Invite wurde bereits verwendet
3. FRONTEND_URL nicht korrekt gesetzt

**Lösung:**
1. Prüfe Invite in DB:
   ```sql
   SELECT token, email, expiresAt, usedAt FROM organization_invites 
   WHERE token = 'token-hier';
   ```

2. Falls abgelaufen, erstelle neuen Invite

3. Prüfe `.env` Datei:
   ```bash
   FRONTEND_URL=https://app.fleettrack.com
   ```

### Problem: Organization kann nicht gelöscht werden

**Info:** Organizations werden nur deaktiviert, nicht gelöscht (Datenschutz/Audit)

**Workaround:** Manuelles Löschen via SQL (nur wenn wirklich nötig):
```sql
-- ⚠️ VORSICHT: Löscht alle Daten der Organization!
DELETE FROM usages WHERE vehicleId IN (
  SELECT id FROM vehicles WHERE organizationId = '<org-id>'
);
DELETE FROM vehicles WHERE organizationId = '<org-id>';
DELETE FROM organization_invites WHERE organizationId = '<org-id>';
DELETE FROM user_profiles WHERE organizationId = '<org-id>';
DELETE FROM organizations WHERE id = '<org-id>';
```

## 📊 Monitoring & Reports

### Aktive Organizations zählen

```sql
SELECT COUNT(*) as active_organizations 
FROM organizations 
WHERE isActive = true;
```

### Users pro Organization

```sql
SELECT 
  o.name as organization_name,
  COUNT(up.id) as user_count,
  COUNT(CASE WHEN up.role = 'admin' THEN 1 END) as admin_count
FROM organizations o
LEFT JOIN user_profiles up ON up.organizationId = o.id
WHERE o.isActive = true
GROUP BY o.id, o.name
ORDER BY user_count DESC;
```

### Pending Invites

```sql
SELECT 
  o.name as organization,
  oi.email,
  oi.role,
  oi.expiresAt,
  oi.createdAt
FROM organization_invites oi
JOIN organizations o ON o.id = oi.organizationId
WHERE oi.usedAt IS NULL
  AND oi.expiresAt > NOW()
ORDER BY oi.createdAt DESC;
```

### Abgelaufene/Ungenutzte Invites löschen

```sql
DELETE FROM organization_invites
WHERE usedAt IS NULL 
  AND expiresAt < NOW() - INTERVAL '30 days';
```

## 🔐 Security Best Practices

1. **Super Admin Zugang schützen:**
   - Verwende starke Passwörter
   - Aktiviere 2FA (wenn verfügbar)
   - Teile Super Admin Credentials NICHT

2. **Audit Logging:**
   - Alle Super Admin Aktionen sollten geloggt werden
   - Regelmäßig Logs prüfen

3. **Principle of Least Privilege:**
   - Nur notwendige Personen sollten Super Admin sein
   - Normale Admins für Organization-Management nutzen

4. **Backup:**
   - Regelmäßig Datenbank-Backups
   - Vor großen Änderungen immer Backup erstellen

## 📞 Support

Bei Fragen oder Problemen:
- Email: support@fleettrack.com
- Slack: #super-admins
- Dokumentation: https://docs.fleettrack.com
