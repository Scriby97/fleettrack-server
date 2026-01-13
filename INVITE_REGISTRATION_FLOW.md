# Invite-basierte Registrierung - Frontend Implementation Guide

## ✅ RICHTIGER FLOW: Registrierung über Invite

### 1. User erhält Invite-Link
Der Admin erstellt einen Invite im System. Der User erhält einen Link:
```
https://your-frontend.com/invite/accept?token=abc123xyz789...
```

### 2. Frontend validiert den Token (Optional, aber empfohlen)
**GET** `/invites/:token`

Request:
```http
GET http://localhost:3001/invites/abc123xyz789
```

Response (Success):
```json
{
  "email": "newuser@example.com",
  "role": "user",
  "organization": {
    "id": "uuid-here",
    "name": "Acme Corporation"
  },
  "expiresAt": "2026-01-19T12:00:00.000Z"
}
```

**Frontend Action:**
- Zeige Organization-Name
- Pre-fill Email (disabled/readonly)
- Zeige Registrierungs-Formular

### 3. User füllt Registrierungsformular aus
Formular-Felder:
- ✅ Email (pre-filled, disabled)
- ✅ Password
- ✅ Passwort wiederholen
- ✅ Vorname (optional)
- ✅ Nachname (optional)

### 4. Frontend sendet Registrierung an /invites/accept
**⚠️ KRITISCH: Verwende NICHT /auth/signup!**

**POST** `/invites/accept`

Request Body:
```json
{
  "token": "abc123xyz789...",
  "email": "newuser@example.com",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

Response (Success):
```json
{
  "message": "Successfully joined organization",
  "user": {
    "id": "user-uuid",
    "email": "newuser@example.com",
    "user_metadata": {
      "firstName": "John",
      "lastName": "Doe"
    }
  },
  "session": {
    "access_token": "eyJhbGci...",
    "refresh_token": "...",
    "expires_in": 3600
  }
}
```

**Frontend Action:**
- Speichere access_token und refresh_token (localStorage/cookies)
- Redirect zu Dashboard: `/dashboard`
- User ist eingeloggt UND der Organization zugewiesen

---

## ❌ FALSCHER FLOW (Das NICHT tun!)

### ❌ Direkte Registrierung über /auth/signup
**Das würde passieren:**
```json
POST /auth/signup
{
  "email": "newuser@example.com",
  "password": "password"
}
```

**Problem:**
- User wird erstellt OHNE organizationId
- Invite bleibt "pending" (usedAt = null)
- User hat keine Organization → Kann keine Daten sehen
- User kann nicht auf organization-spezifische Endpoints zugreifen

**Result:** User ist registriert aber "verwaist" 🚫

---

## 🔄 Kompletter Flow im Detail

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ADMIN: Erstellt Invite                                   │
│    POST /organizations/invites                              │
│    Body: { email, role }                                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. ADMIN: Kopiert Invite-Link                               │
│    Link: https://app.com/invite/accept?token=XYZ            │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. USER: Öffnet Link im Browser                            │
│    GET /invites/:token (validiert Token)                    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. FRONTEND: Zeigt Registrierungsformular                  │
│    - Email (pre-filled, disabled)                           │
│    - Password                                               │
│    - Name                                                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. USER: Füllt Formular aus und klickt "Registrieren"      │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. FRONTEND: POST /invites/accept                           │
│    Body: { token, email, password, firstName, lastName }    │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. BACKEND:                                                 │
│    ✓ Validiert Token                                        │
│    ✓ Erstellt User in Supabase Auth                        │
│    ✓ Erstellt user_profile mit organizationId              │
│    ✓ Markiert Invite als verwendet (usedAt = NOW)          │
│    ✓ Gibt Session zurück                                   │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. FRONTEND: Speichert Session, redirect zu /dashboard     │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔴 Error Handling

### Token ungültig/abgelaufen
```json
GET /invites/invalid-token

Status: 404
{
  "statusCode": 404,
  "message": "Invite not found"
}
```

**Frontend Action:** Zeige Fehler "Dieser Einladungslink ist ungültig oder abgelaufen"

### Email stimmt nicht überein
```json
POST /invites/accept
{
  "token": "valid-token",
  "email": "wrong@email.com",  // ❌ Nicht die invite email
  "password": "..."
}

Status: 400
{
  "statusCode": 400,
  "message": "Email does not match the invited email address"
}
```

**Frontend Action:** Zeige Fehler "Die E-Mail-Adresse stimmt nicht mit der Einladung überein"

### Invite bereits verwendet
```json
GET /invites/already-used-token

Status: 400
{
  "statusCode": 400,
  "message": "This invite has already been used"
}
```

**Frontend Action:** Zeige Fehler "Diese Einladung wurde bereits verwendet"

---

## 📝 TypeScript Interface für Frontend

```typescript
// API Types
interface InviteInfo {
  email: string;
  role: 'user' | 'admin';
  organization: {
    id: string;
    name: string;
  };
  expiresAt: string; // ISO 8601
}

interface AcceptInviteRequest {
  token: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

interface AcceptInviteResponse {
  message: string;
  user: {
    id: string;
    email: string;
    user_metadata: {
      firstName?: string;
      lastName?: string;
    };
  };
  session: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

// API Functions
async function getInviteInfo(token: string): Promise<InviteInfo> {
  const response = await fetch(`/invites/${token}`);
  if (!response.ok) throw new Error('Invalid invite');
  return response.json();
}

async function acceptInvite(data: AcceptInviteRequest): Promise<AcceptInviteResponse> {
  const response = await fetch('/invites/accept', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Registration failed');
  return response.json();
}
```

---

## ✅ Checkliste für Frontend-Entwickler

- [ ] Invite-Link wird über Query-Parameter `?token=...` geparst
- [ ] GET `/invites/:token` wird aufgerufen um Invite-Info zu holen
- [ ] Email-Feld wird pre-filled und disabled
- [ ] Registrierung geht an **POST `/invites/accept`** (NICHT /auth/signup!)
- [ ] Token wird im Request-Body mitgeschickt
- [ ] Session wird nach erfolgreicher Registrierung gespeichert
- [ ] Redirect zu Dashboard nach erfolgreicher Registrierung
- [ ] Error-Handling für ungültige/abgelaufene Tokens
- [ ] Error-Handling für bereits verwendete Invites

---

## 🚨 Wichtigste Regel

**NIEMALS `/auth/signup` verwenden wenn ein Invite-Token vorhanden ist!**

Immer `/invites/accept` verwenden, damit:
✅ User der richtigen Organization zugewiesen wird
✅ Invite als "verwendet" markiert wird
✅ User die richtige Rolle bekommt
✅ Admin sehen kann, welche Invites verwendet wurden

---

## 📊 Invite-Datenstruktur für Frontend

### GET `/organizations/invites` - Liste aller Invites

Request:
```http
GET http://localhost:3001/organizations/invites
Authorization: Bearer <admin-token>
```

Response:
```json
[
  {
    "id": "1b5fb0d6-671c-4f82-88aa-cbd6b2e5cb36",
    "token": "929147046a6282cea474c00cc7c61b8cdf28e41df9b2c70db4f456da",
    "email": "newuser@example.com",
    "role": "user",
    "organizationId": "3c1479e0-a291-460b-8bb7-bc00e45c2cd0",
    "invitedBy": "e2a1acec-2516-4e95-9e01-9b9251164275",
    "expiresAt": "2026-01-19T14:30:00.000Z",
    "usedAt": "2026-01-12T20:43:24.786Z",
    "usedBy": "7930e926-ead3-40a6-a5af-8211cf7c4dd0",
    "createdAt": "2026-01-12T14:30:00.000Z"
  },
  {
    "id": "a3c4d5e6-f7g8-h9i0-j1k2-l3m4n5o6p7q8",
    "token": "abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890",
    "email": "pending@example.com",
    "role": "admin",
    "organizationId": "3c1479e0-a291-460b-8bb7-bc00e45c2cd0",
    "invitedBy": "e2a1acec-2516-4e95-9e01-9b9251164275",
    "expiresAt": "2026-01-20T10:00:00.000Z",
    "usedAt": null,
    "usedBy": null,
    "createdAt": "2026-01-13T10:00:00.000Z"
  },
  {
    "id": "b4c5d6e7-f8g9-h0i1-j2k3-l4m5n6o7p8q9",
    "token": "xyz987wvu654tsr321qpo098nml765kji432hgf210edc",
    "email": "expired@example.com",
    "role": "user",
    "organizationId": "3c1479e0-a291-460b-8bb7-bc00e45c2cd0",
    "invitedBy": "e2a1acec-2516-4e95-9e01-9b9251164275",
    "expiresAt": "2026-01-10T12:00:00.000Z",
    "usedAt": null,
    "usedBy": null,
    "createdAt": "2026-01-03T12:00:00.000Z"
  }
]
```

### Frontend UI Logik für Invite-Status

```typescript
interface OrganizationInvite {
  id: string;
  token: string;
  email: string;
  role: 'user' | 'admin';
  organizationId: string;
  invitedBy: string;
  expiresAt: string; // ISO 8601
  usedAt: string | null; // ISO 8601 oder null
  usedBy: string | null; // User ID oder null
  createdAt: string; // ISO 8601
}

type InviteStatus = 'used' | 'pending' | 'expired';

function getInviteStatus(invite: OrganizationInvite): InviteStatus {
  // Wurde bereits verwendet
  if (invite.usedAt !== null) {
    return 'used';
  }
  
  // Ist abgelaufen
  const now = new Date();
  const expiresAt = new Date(invite.expiresAt);
  if (expiresAt < now) {
    return 'expired';
  }
  
  // Ist noch gültig
  return 'pending';
}

function getInviteStatusDisplay(status: InviteStatus): {
  label: string;
  color: string;
  icon: string;
} {
  switch (status) {
    case 'used':
      return {
        label: 'Verwendet',
        color: 'green', // oder 'success'
        icon: '✓'
      };
    case 'expired':
      return {
        label: 'Abgelaufen',
        color: 'gray', // oder 'default'
        icon: '⏱'
      };
    case 'pending':
      return {
        label: 'Ausstehend',
        color: 'orange', // oder 'warning'
        icon: '⏳'
      };
  }
}
```

### Beispiel: Invite-Tabelle UI

```tsx
// React Component Beispiel
function InvitesList({ invites }: { invites: OrganizationInvite[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Email</th>
          <th>Rolle</th>
          <th>Status</th>
          <th>Erstellt</th>
          <th>Läuft ab</th>
          <th>Aktionen</th>
        </tr>
      </thead>
      <tbody>
        {invites.map(invite => {
          const status = getInviteStatus(invite);
          const display = getInviteStatusDisplay(status);
          
          return (
            <tr key={invite.id}>
              <td>{invite.email}</td>
              <td>
                <Badge>{invite.role}</Badge>
              </td>
              <td>
                <Badge color={display.color}>
                  {display.icon} {display.label}
                </Badge>
              </td>
              <td>
                {new Date(invite.createdAt).toLocaleDateString('de-DE')}
              </td>
              <td>
                {new Date(invite.expiresAt).toLocaleDateString('de-DE')}
              </td>
              <td>
                {status === 'pending' && (
                  <>
                    <Button onClick={() => copyInviteLink(invite.token)}>
                      Link kopieren
                    </Button>
                    <Button variant="danger" onClick={() => deleteInvite(invite.id)}>
                      Löschen
                    </Button>
                  </>
                )}
                {status === 'used' && (
                  <span className="text-muted">
                    Verwendet am {new Date(invite.usedAt!).toLocaleString('de-DE')}
                  </span>
                )}
                {status === 'expired' && (
                  <Button variant="danger" onClick={() => deleteInvite(invite.id)}>
                    Löschen
                  </Button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function copyInviteLink(token: string) {
  const link = `${window.location.origin}/invite/accept?token=${token}`;
  navigator.clipboard.writeText(link);
  // Zeige Toast: "Link in Zwischenablage kopiert"
}

async function deleteInvite(inviteId: string) {
  const confirmed = confirm('Möchten Sie diese Einladung wirklich löschen?');
  if (!confirmed) return;
  
  await fetch(`/organizations/invites/${inviteId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${getAccessToken()}`
    }
  });
  
  // Reload invite list
}
```

### Beispiel-Daten für Tests

#### ✅ Verwendeter Invite (Status: "used")
```json
{
  "id": "1b5fb0d6-671c-4f82-88aa-cbd6b2e5cb36",
  "token": "929147046a6282cea474c00cc7c61b8cdf28e41df9b2c70db4f456da",
  "email": "john.doe@example.com",
  "role": "user",
  "organizationId": "3c1479e0-a291-460b-8bb7-bc00e45c2cd0",
  "invitedBy": "e2a1acec-2516-4e95-9e01-9b9251164275",
  "expiresAt": "2026-01-19T14:30:00.000Z",
  "usedAt": "2026-01-12T20:43:24.786Z",
  "usedBy": "7930e926-ead3-40a6-a5af-8211cf7c4dd0",
  "createdAt": "2026-01-12T14:30:00.000Z"
}
```

**Frontend Display:**
- Status Badge: 🟢 **Verwendet** (grün)
- Zusätzliche Info: "Verwendet am 12.01.2026, 21:43"
- Aktionen: Keine (nicht löschbar, nur zur Historie)

#### ⏳ Pending Invite (Status: "pending")
```json
{
  "id": "a3c4d5e6-f7g8-h9i0-j1k2-l3m4n5o6p7q8",
  "token": "abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567890",
  "email": "jane.smith@example.com",
  "role": "admin",
  "organizationId": "3c1479e0-a291-460b-8bb7-bc00e45c2cd0",
  "invitedBy": "e2a1acec-2516-4e95-9e01-9b9251164275",
  "expiresAt": "2026-01-20T10:00:00.000Z",
  "usedAt": null,
  "usedBy": null,
  "createdAt": "2026-01-13T10:00:00.000Z"
}
```

**Frontend Display:**
- Status Badge: 🟠 **Ausstehend** (orange)
- Zusätzliche Info: "Läuft ab am 20.01.2026"
- Aktionen: 
  - Button: "Link kopieren" → Kopiert Invite-URL
  - Button: "Löschen" → DELETE /organizations/invites/:id

#### ⏱ Abgelaufener Invite (Status: "expired")
```json
{
  "id": "b4c5d6e7-f8g9-h0i1-j2k3-l4m5n6o7p8q9",
  "token": "xyz987wvu654tsr321qpo098nml765kji432hgf210edc",
  "email": "expired@example.com",
  "role": "user",
  "organizationId": "3c1479e0-a291-460b-8bb7-bc00e45c2cd0",
  "invitedBy": "e2a1acec-2516-4e95-9e01-9b9251164275",
  "expiresAt": "2026-01-10T12:00:00.000Z",
  "usedAt": null,
  "usedBy": null,
  "createdAt": "2026-01-03T12:00:00.000Z"
}
```

**Frontend Display:**
- Status Badge: ⚫ **Abgelaufen** (grau)
- Zusätzliche Info: "Abgelaufen am 10.01.2026"
- Aktionen:
  - Button: "Löschen" → DELETE /organizations/invites/:id

### Wichtige Frontend-Hinweise

1. **usedAt und usedBy prüfen:**
   ```typescript
   if (invite.usedAt !== null && invite.usedBy !== null) {
     // Invite wurde verwendet
   }
   ```

2. **Ablaufdatum prüfen:**
   ```typescript
   const isExpired = new Date(invite.expiresAt) < new Date();
   ```

3. **Invite-Link generieren:**
   ```typescript
   const inviteLink = `${window.location.origin}/invite/accept?token=${invite.token}`;
   ```

4. **Zeitformatierung:**
   ```typescript
   // Deutsches Format
   const formatted = new Date(invite.createdAt).toLocaleString('de-DE', {
     day: '2-digit',
     month: '2-digit',
     year: 'numeric',
     hour: '2-digit',
     minute: '2-digit'
   });
   // Output: "12.01.2026, 21:43"
   ```

5. **Filter-Funktion für Admin-Dashboard:**
   ```typescript
   // Alle pending Invites
   const pendingInvites = invites.filter(i => getInviteStatus(i) === 'pending');
   
   // Alle verwendeten Invites
   const usedInvites = invites.filter(i => getInviteStatus(i) === 'used');
   
   // Alle abgelaufenen Invites
   const expiredInvites = invites.filter(i => getInviteStatus(i) === 'expired');
   ```
