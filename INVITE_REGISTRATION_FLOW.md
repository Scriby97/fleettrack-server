git # Invite-basierte Registrierung - Frontend Implementation Guide

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

---

## 🏢 Super Admin: Neue Organization erstellen

### Überblick
Nur **Super Admins** können neue Organizations erstellen. Dabei wird automatisch ein Invite für den ersten Admin der neuen Organization generiert.

### POST `/organizations` - Neue Organization erstellen

**Authentifizierung:** Super Admin Token erforderlich

Request:
```http
POST http://localhost:3001/organizations
Authorization: Bearer <super-admin-token>
Content-Type: application/json

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

**Request Body Felder:**

| Feld | Typ | Pflicht | Beschreibung |
|------|-----|---------|--------------|
| `name` | string | ✅ Ja | Name der Organization (min. 2 Zeichen) |
| `adminEmail` | string | ✅ Ja | Email des ersten Admins |
| `adminFirstName` | string | ❌ Nein | Vorname des Admins (optional) |
| `adminLastName` | string | ❌ Nein | Nachname des Admins (optional) |
| `adminRole` | string | ❌ Nein | Rolle des Admins: `admin` (default) oder `super_admin` |
| `subdomain` | string | ❌ Nein | Subdomain für die Organization (z.B. für Multi-Tenant URLs) |
| `contactEmail` | string | ❌ Nein | Kontakt-Email der Organization |

Response (Success):
```json
{
  "organization": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Acme Transportation GmbH",
    "subdomain": "acme",
    "contactEmail": "info@acme-transport.com",
    "isActive": true,
    "createdAt": "2026-01-13T10:30:00.000Z",
    "updatedAt": "2026-01-13T10:30:00.000Z"
  },
  "invite": {
    "token": "a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef12",
    "link": "https://app.fleettrack.com/invite/accept?token=a1b2c3d4e5f67890abcdef1234567890a1b2c3d4e5f67890abcdef12",
    "email": "admin@acme-transport.com",
    "expiresAt": "2026-01-20T10:30:00.000Z"
  }
}
```

### TypeScript Interface für Frontend

```typescript
interface CreateOrganizationRequest {
  name: string;
  adminEmail: string;
  adminFirstName?: string;
  adminLastName?: string;
  adminRole?: 'admin' | 'super_admin';
  subdomain?: string;
  contactEmail?: string;
}

interface CreateOrganizationResponse {
  organization: {
    id: string;
    name: string;
    subdomain?: string;
    contactEmail?: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  invite: {
    token: string;
    link: string;
    email: string;
    expiresAt: string;
  };
}

async function createOrganization(
  data: CreateOrganizationRequest,
  superAdminToken: string
): Promise<CreateOrganizationResponse> {
  const response = await fetch('/organizations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${superAdminToken}`
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    throw new Error('Failed to create organization');
  }
  
  return response.json();
}
```

### Frontend UI: Super Admin Dashboard

#### Neue Organization erstellen - Formular

```tsx
// React Component Beispiel
function CreateOrganizationForm() {
  const [formData, setFormData] = useState<CreateOrganizationRequest>({
    name: '',
    adminEmail: '',
    adminFirstName: '',
    adminLastName: '',
    adminRole: 'admin',
    subdomain: '',
    contactEmail: '',
  });
  const [result, setResult] = useState<CreateOrganizationResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const token = getAccessToken(); // Hol Super Admin Token
      const response = await createOrganization(formData, token);
      setResult(response);
      
      // Zeige Success-Message mit Invite-Link
      alert(`Organization "${response.organization.name}" erfolgreich erstellt!`);
    } catch (error) {
      alert('Fehler beim Erstellen der Organization: ' + error.message);
    }
  };

  return (
    <div>
      <h2>Neue Organization erstellen</h2>
      
      <form onSubmit={handleSubmit}>
        {/* Organization Details */}
        <fieldset>
          <legend>Organization Details</legend>
          
          <label>
            Organization Name *
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              required
              minLength={2}
              placeholder="z.B. Acme Transportation GmbH"
            />
          </label>

          <label>
            Subdomain (optional)
            <input
              type="text"
              value={formData.subdomain}
              onChange={e => setFormData({ ...formData, subdomain: e.target.value })}
              placeholder="z.B. acme (für acme.fleettrack.com)"
            />
          </label>

          <label>
            Kontakt-Email (optional)
            <input
              type="email"
              value={formData.contactEmail}
              onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
              placeholder="info@firma.com"
            />
          </label>
        </fieldset>

        {/* Admin User Details */}
        <fieldset>
          <legend>Erster Admin-User</legend>
          
          <label>
            Admin Email *
            <input
              type="email"
              value={formData.adminEmail}
              onChange={e => setFormData({ ...formData, adminEmail: e.target.value })}
              required
              placeholder="admin@firma.com"
            />
          </label>

          <label>
            Vorname (optional)
            <input
              type="text"
              value={formData.adminFirstName}
              onChange={e => setFormData({ ...formData, adminFirstName: e.target.value })}
              placeholder="Max"
            />
          </label>

          <label>
            Nachname (optional)
            <input
              type="text"
              value={formData.adminLastName}
              onChange={e => setFormData({ ...formData, adminLastName: e.target.value })}
              placeholder="Mustermann"
            />
          </label>

          <label>
            Admin Rolle
            <select
              value={formData.adminRole}
              onChange={e => setFormData({ ...formData, adminRole: e.target.value as 'admin' | 'super_admin' })}
            >
              <option value="admin">Admin (Standard)</option>
              <option value="super_admin">Super Admin (volle Rechte)</option>
            </select>
          </label>
        </fieldset>

        <button type="submit">Organization erstellen</button>
      </form>

      {/* Success Message mit Invite-Link */}
      {result && (
        <div className="success-message">
          <h3>✅ Organization erfolgreich erstellt!</h3>
          
          <div className="org-details">
            <h4>Organization Details:</h4>
            <p><strong>Name:</strong> {result.organization.name}</p>
            <p><strong>ID:</strong> {result.organization.id}</p>
            {result.organization.subdomain && (
              <p><strong>Subdomain:</strong> {result.organization.subdomain}</p>
            )}
          </div>

          <div className="invite-details">
            <h4>Admin Invite:</h4>
            <p><strong>Email:</strong> {result.invite.email}</p>
            <p><strong>Läuft ab:</strong> {new Date(result.invite.expiresAt).toLocaleString('de-DE')}</p>
            
            <div className="invite-link-box">
              <label>Invite-Link (an Admin senden):</label>
              <input
                type="text"
                value={result.invite.link}
                readOnly
                onClick={e => e.currentTarget.select()}
              />
              <button onClick={() => {
                navigator.clipboard.writeText(result.invite.link);
                alert('Link in Zwischenablage kopiert!');
              }}>
                📋 Link kopieren
              </button>
            </div>

            <div className="actions">
              <button onClick={() => {
                // Email-Client öffnen mit vorgefertigtem Text
                const subject = encodeURIComponent(`Einladung zu ${result.organization.name}`);
                const body = encodeURIComponent(
                  `Hallo,\n\n` +
                  `Sie wurden als Administrator für die Organization "${result.organization.name}" eingeladen.\n\n` +
                  `Bitte klicken Sie auf den folgenden Link, um Ihr Konto zu erstellen:\n` +
                  `${result.invite.link}\n\n` +
                  `Der Link ist gültig bis ${new Date(result.invite.expiresAt).toLocaleString('de-DE')}.\n\n` +
                  `Mit freundlichen Grüßen\n` +
                  `FleetTrack Team`
                );
                window.location.href = `mailto:${result.invite.email}?subject=${subject}&body=${body}`;
              }}>
                📧 Email-Entwurf erstellen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

### GET `/organizations` - Alle Organizations auflisten

**Nur für Super Admins**

Request:
```http
GET http://localhost:3001/organizations
Authorization: Bearer <super-admin-token>
```

Response:
```json
[
  {
    "id": "3c1479e0-a291-460b-8bb7-bc00e45c2cd0",
    "name": "Default Organization",
    "isActive": true,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  },
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Acme Transportation GmbH",
    "subdomain": "acme",
    "contactEmail": "info@acme-transport.com",
    "isActive": true,
    "createdAt": "2026-01-13T10:30:00.000Z",
    "updatedAt": "2026-01-13T10:30:00.000Z"
  }
]
```

### Frontend: Organizations-Liste für Super Admin

```tsx
function OrganizationsList() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const fetchOrganizations = async () => {
    const response = await fetch('/organizations', {
      headers: {
        'Authorization': `Bearer ${getAccessToken()}`
      }
    });
    const data = await response.json();
    setOrganizations(data);
  };

  return (
    <div>
      <h2>Alle Organizations</h2>
      
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Subdomain</th>
            <th>Kontakt-Email</th>
            <th>Status</th>
            <th>Erstellt</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {organizations.map(org => (
            <tr key={org.id}>
              <td>{org.name}</td>
              <td>{org.subdomain || '-'}</td>
              <td>{org.contactEmail || '-'}</td>
              <td>
                <Badge color={org.isActive ? 'green' : 'gray'}>
                  {org.isActive ? 'Aktiv' : 'Inaktiv'}
                </Badge>
              </td>
              <td>
                {new Date(org.createdAt).toLocaleDateString('de-DE')}
              </td>
              <td>
                <Button onClick={() => viewOrganization(org.id)}>
                  Details
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Workflow: Neue Organization onboarden

1. **Super Admin** loggt sich ein
2. Navigiert zu "Organizations" → "Neue Organization erstellen"
3. Füllt Formular aus:
   - Organization-Name
   - Admin-Email
   - Optional: Vorname, Nachname, Subdomain
4. Klickt "Organization erstellen"
5. System erstellt:
   - ✅ Neue Organization in DB
   - ✅ Invite für ersten Admin (7 Tage gültig)
6. Super Admin erhält Invite-Link
7. Super Admin sendet Link an den zukünftigen Admin (per Email/Chat)
8. **Admin** öffnet Invite-Link
9. Admin registriert sich via `/invites/accept`
10. Admin ist eingeloggt und kann:
    - Weitere User einladen
    - Fahrzeuge anlegen
    - System konfigurieren

### Error Handling

#### Super Admin-Rechte fehlen
```json
Status: 403
{
  "statusCode": 403,
  "message": "Forbidden resource"
}
```

**Frontend Action:** Zeige Fehler "Sie haben keine Berechtigung, Organizations zu erstellen"

#### Organization-Name bereits vergeben
```json
Status: 400
{
  "statusCode": 400,
  "message": "Organization with this name already exists"
}
```

**Frontend Action:** Zeige Fehler "Eine Organization mit diesem Namen existiert bereits"

#### Admin-Email bereits verwendet
```json
Status: 400
{
  "statusCode": 400,
  "message": "A user with this email address already exists"
}
```

**Frontend Action:** Zeige Fehler "Ein User mit dieser Email-Adresse existiert bereits"

### Wichtige Hinweise für Frontend-Team

1. **Super Admin Check:**
   ```typescript
   // Nur Super Admins sehen "Organizations erstellen" Button
   if (currentUser.role === 'super_admin') {
     // Zeige Navigation/Button
   }
   ```

2. **Invite-Link speichern:**
   - Nach dem Erstellen sollte der Invite-Link in Zwischenablage kopiert werden können
   - Optional: Email-Integration zum direkten Versenden

3. **Subdomain-Validierung:**
   ```typescript
   // Nur Kleinbuchstaben, Zahlen, Bindestriche
   const subdomainRegex = /^[a-z0-9-]+$/;
   ```

4. **Success-Feedback:**
   - Zeige deutlich den generierten Invite-Link
   - Zeige Ablaufdatum des Invites
   - Biete "Email-Entwurf erstellen" Button

5. **Environment Variable:**
   ```typescript
   // Frontend muss FRONTEND_URL kennen für Invite-Link-Generierung
   // Backend verwendet: process.env.FRONTEND_URL || 'http://localhost:3000'
   ```
