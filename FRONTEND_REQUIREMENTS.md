# Frontend-Anforderungen für Multi-Tenancy mit Invite-System

## 🎯 Übersicht

Das Backend unterstützt jetzt ein invite-basiertes Multi-Tenancy-System. Hier ist, was im Frontend zu entwickeln ist:

---

## 1. 📧 **Invite-Flow (Neue Seiten/Komponenten)**

### A) Invite-Link-Seite (`/invite/:token`)

**Route:** `/invite/:token` (öffentlich, kein Login)

**Funktionalität:**
1. Token aus URL extrahieren
2. Invite validieren: `GET /invites/:token`
3. Anzeigen:
   - Organization Name
   - Eingeladene Email
   - Rolle
   - Ablaufdatum

**Komponenten:**
```typescript
// InvitePage.tsx
- InviteInfo (zeigt Org-Name, Email, Rolle)
- RegistrationForm (Vorname, Nachname, Passwort)
- Submit-Button → POST /invites/accept
```

**API Calls:**
```typescript
// 1. Invite Info abrufen
GET /invites/{token}
Response: {
  email: string,
  role: string,
  organization: { id: string, name: string },
  expiresAt: string
}

// 2. Invite akzeptieren
POST /invites/accept
Body: {
  token: string,
  email: string,
  password: string,
  firstName: string,
  lastName: string
}
Response: {
  message: string,
  user: {...},
  session: {...}
}
```

---

## 2. 👥 **Admin-Bereich: Invite-Management**

### B) User-Verwaltungs-Seite (erweitern)

**Route:** `/admin/users` (nur für Admins)

**Neue Features:**
1. "Invite User" Button
2. Liste aller Invites (pending/accepted/expired)
3. Invite löschen/resend

**Komponenten:**
```typescript
// UserManagementPage.tsx
- InviteUserButton → öffnet Modal
- InviteModal (Email, Rolle eingeben)
- InvitesList (zeigt alle Invites)
  - Status: Pending / Accepted / Expired
  - Copy Link Button
  - Delete Button
```

**API Calls:**
```typescript
// 1. Invite erstellen
POST /organizations/{organizationId}/invites
Body: {
  email: string,
  role: 'user' | 'admin'
}
Response: {
  id: string,
  token: string,
  email: string,
  expiresAt: string
}

// 2. Alle Invites abrufen
GET /organizations/{organizationId}/invites
Response: InviteEntity[]

// 3. Invite löschen
DELETE /organizations/invites/{inviteId}
```

**UI-Anforderungen:**
- Copy-to-Clipboard für Invite-Link
- Format: `https://your-app.com/invite/{token}`
- Status-Badge (Pending/Expired/Used)
- Email an User senden (optional)

---

## 3. 🔐 **Auth-Flow Anpassungen**

### C) Login-Seite (keine Änderungen nötig!)

Der normale Login funktioniert ohne Änderungen:
```typescript
POST /auth/signin
Body: { email, password }
// organizationId wird automatisch geladen
```

### D) Signup-Seite (deaktivieren oder verstecken)

**Option 1:** Signup komplett entfernen (nur Invite-basiert)
**Option 2:** Signup nur für erste Organization (Self-Service)

---

## 4. 🏢 **Organization-Context im Frontend**

### E) User-State erweitern

```typescript
// types/user.ts
interface User {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'user';
  organizationId: string;  // ← NEU
  organization: {          // ← NEU
    id: string;
    name: string;
    subdomain?: string;
  };
  firstName?: string;
  lastName?: string;
}
```

### F) Auth-Context/Store aktualisieren

```typescript
// Nach Login:
const { data } = await api.post('/auth/signin', { email, password });

// data.user enthält jetzt:
// - organizationId
// - organization { id, name }

// Im State speichern:
setUser({
  ...data.user,
  organizationId: data.user.organizationId,
  organization: data.user.organization
});
```

---

## 5. 🎨 **UI-Anpassungen**

### G) Navbar/Header

```typescript
// Anzeigen:
- Organization Name (z.B. "Firma ABC")
- User Rolle Badge (Admin/User)

// Beispiel:
<Header>
  <OrganizationName>{user.organization.name}</OrganizationName>
  <UserInfo>
    {user.firstName} {user.lastName}
    <RoleBadge>{user.role}</RoleBadge>
  </UserInfo>
</Header>
```

### H) Automatisches Filtern (keine Änderungen!)

Alle API-Requests werden automatisch gefiltert:
- `GET /vehicles` → nur Vehicles der eigenen Org
- `GET /vehicles/stats` → nur Stats der eigenen Org
- `GET /auth/users` → nur Users der eigenen Org

**Kein Extra-Code im Frontend nötig!**

---

## 6. 📊 **Super-Admin Features (optional)**

### I) Organization-Verwaltung

**Route:** `/super-admin/organizations` (nur für super_admin)

**Features:**
- Alle Organisationen anzeigen
- Neue Organization erstellen
- Organization aktivieren/deaktivieren

**API Calls:**
```typescript
// Nur für super_admin
GET /organizations
POST /organizations
PATCH /organizations/{id}
DELETE /organizations/{id}
```

---

## 7. 📋 **Checkliste für Frontend-Entwicklung**

### Phase 1: Invite-System (MVP)
- [ ] `/invite/:token` Route erstellen
- [ ] Invite-Info-Komponente
- [ ] Registration-Form für Invite-Akzeptierung
- [ ] Error-Handling (expired, invalid token)

### Phase 2: Admin-Features
- [ ] "Invite User" Button im Admin-Panel
- [ ] Invite-Modal mit Email + Rolle
- [ ] Invite-Liste mit Status
- [ ] Copy-to-Clipboard für Invite-Links
- [ ] Invite löschen

### Phase 3: UI-Polish
- [ ] Organization Name in Navbar
- [ ] User-Rolle Badge
- [ ] Invite-Email-Template (optional)
- [ ] Onboarding-Flow nach Invite-Akzeptierung

### Phase 4: Super-Admin (optional)
- [ ] Organization-Liste
- [ ] Organization erstellen/bearbeiten

---

## 8. 📧 **Email-Integration (optional)**

### J) Invite-Emails versenden

Statt nur Links zu kopieren, kannst du automatisch Emails versenden:

**Backend erweitern:**
- Email-Service (z.B. SendGrid, Resend, AWS SES)
- Email-Template für Invites

**Frontend:**
- Checkbox: "Send invite email automatically"
- Success-Message: "Invite sent to user@example.com"

---

## 9. 🔍 **Testing-Scenarios**

### Test-Cases:
1. ✅ Admin erstellt Invite
2. ✅ User klickt auf Invite-Link
3. ✅ User registriert sich mit korrekter Email
4. ✅ User wird automatisch der Organization zugeordnet
5. ✅ User loggt sich ein und sieht nur Daten seiner Org
6. ❌ User versucht ungültigen/abgelaufenen Invite
7. ❌ User versucht Invite mit falscher Email zu akzeptieren

---

## 10. 🚀 **Minimale Implementation (Quick Start)**

Wenn du schnell starten willst, brauchst du **nur 2 Seiten**:

### 1. Invite-Page (`/invite/:token`)
```tsx
// pages/invite/[token].tsx
export default function InvitePage() {
  const { token } = useParams();
  const [invite, setInvite] = useState(null);
  
  useEffect(() => {
    // GET /invites/:token
    fetchInvite(token).then(setInvite);
  }, [token]);
  
  const handleSubmit = async (data) => {
    // POST /invites/accept
    await acceptInvite({ token, ...data });
    router.push('/login');
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <h1>Join {invite?.organization.name}</h1>
      <input name="email" defaultValue={invite?.email} />
      <input name="firstName" />
      <input name="lastName" />
      <input type="password" name="password" />
      <button>Accept Invite</button>
    </form>
  );
}
```

### 2. Admin User-Page (erweitern)
```tsx
// pages/admin/users.tsx
const handleInviteUser = async () => {
  const { data } = await api.post(
    `/organizations/${user.organizationId}/invites`,
    { email: inviteEmail, role: 'user' }
  );
  
  const inviteLink = `${window.location.origin}/invite/${data.token}`;
  navigator.clipboard.writeText(inviteLink);
  alert('Invite link copied!');
};
```

Das war's! 🎉

---

## 📚 **Zusammenfassung**

**Neue Frontend-Seiten:**
1. `/invite/:token` - Invite-Akzeptierung (öffentlich)
2. `/admin/users` - User + Invite-Verwaltung (Admin)
3. `/super-admin/organizations` - Org-Verwaltung (optional)

**API-Integration:**
- `GET /invites/:token` - Invite validieren
- `POST /invites/accept` - Invite akzeptieren
- `POST /organizations/:id/invites` - Invite erstellen
- `GET /organizations/:id/invites` - Invites auflisten
- `DELETE /organizations/invites/:id` - Invite löschen

**State-Änderungen:**
- User-Object erweitern um `organizationId` und `organization`
- Nach Login automatisch verfügbar

**Keine Änderungen nötig:**
- Login-Flow
- Alle existierenden API-Requests (werden automatisch gefiltert)
