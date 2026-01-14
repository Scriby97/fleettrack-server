# Quick Start: Erste Organization anlegen

## 1. Super Admin Account vorbereiten

```sql
-- Prüfe ob dein Account existiert
SELECT id, email, role FROM user_profiles WHERE email = 'nicolas_balmer@hotmail.com';

-- Falls Rolle nicht super_admin, update:
UPDATE user_profiles 
SET role = 'super_admin' 
WHERE email = 'nicolas_balmer@hotmail.com';
```

## 2. .env konfigurieren

```bash
# In .env Datei
FRONTEND_URL=http://localhost:3000
```

Neu starten:
```bash
npm run start:dev
```

## 3. Einloggen & Token holen

```bash
# POST /auth/signin
curl -X POST http://localhost:3001/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "nicolas_balmer@hotmail.com",
    "password": "dein-passwort"
  }'
```

Response enthält `access_token` - kopieren!

## 4. Erste Organization erstellen

```bash
# Ersetze <TOKEN> mit deinem access_token
curl -X POST http://localhost:3001/organizations \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Transport GmbH",
    "adminEmail": "admin@testfirma.com",
    "adminFirstName": "Max",
    "adminLastName": "Mustermann"
  }'
```

**Response:**
```json
{
  "organization": {
    "id": "...",
    "name": "Test Transport GmbH",
    ...
  },
  "invite": {
    "token": "abc123...",
    "link": "http://localhost:3000/invite/accept?token=abc123...",
    "email": "admin@testfirma.com",
    "expiresAt": "2026-01-20T..."
  }
}
```

## 5. Invite-Link testen

1. Kopiere `invite.link` aus der Response
2. Öffne im Browser
3. Frontend sollte Registrierungsformular zeigen mit:
   - Email: `admin@testfirma.com` (pre-filled, disabled)
   - Password-Felder
   - Name-Felder

4. Registriere dich
5. Du bist eingeloggt als Admin der neuen Organization!

## 6. Prüfen ob alles funktioniert hat

```sql
-- Neue Organization wurde erstellt
SELECT * FROM organizations WHERE name = 'Test Transport GmbH';

-- Invite wurde erstellt
SELECT token, email, usedAt FROM organization_invites 
WHERE email = 'admin@testfirma.com';

-- Nach Registrierung: User hat organizationId
SELECT id, email, role, "organizationId" FROM user_profiles 
WHERE email = 'admin@testfirma.com';

-- Invite wurde als "verwendet" markiert (usedAt nicht null)
SELECT token, usedAt, "usedBy" FROM organization_invites 
WHERE email = 'admin@testfirma.com';
```

## ✅ Erfolg!

Wenn alles funktioniert hat:
- ✅ Organization wurde erstellt
- ✅ Invite wurde generiert
- ✅ Admin konnte sich registrieren
- ✅ Admin hat organizationId der neuen Org
- ✅ Invite wurde als "verwendet" markiert

## 📝 Nächste Schritte

1. **Frontend implementieren:**
   - Siehe [INVITE_REGISTRATION_FLOW.md](./INVITE_REGISTRATION_FLOW.md) - Kapitel "Super Admin"
   - Formular für Organization-Erstellung
   - Liste aller Organizations

2. **Weitere Organizations:**
   - Wiederhole Schritt 4 mit anderen Daten

3. **Admins können User einladen:**
   - Als Admin einloggen
   - POST /organizations/invites
   - Siehe [INVITE_REGISTRATION_FLOW.md](./INVITE_REGISTRATION_FLOW.md)

## 🐛 Probleme?

### "Forbidden resource"
→ Rolle ist nicht super_admin (siehe Schritt 1)

### "FRONTEND_URL is not defined"
→ .env Datei fehlt FRONTEND_URL (siehe Schritt 2)

### Invite-Link funktioniert nicht
→ Frontend muss auf dem Port laufen der in FRONTEND_URL steht

### "User with this email already exists"
→ Email ist schon registriert, verwende andere Email
