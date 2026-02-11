# Frontend Spezifikation: Passwort-Management

## Ziel

Frontend-Umsetzung fuer Passwort-Aenderungen (eingeloggte User) und Admin-Reset-Emails.

## Rollen und Rechte

- `user`: darf nur eigenes Passwort aendern.
- `admin`: darf Passwoerter von Usern der eigenen Organization zuruecksetzen.
- `super_admin`: darf Passwoerter aller User zuruecksetzen und nach Organization filtern.

## Routen

1) **User Settings**
- Route: `/settings`
- Zugriff: alle eingeloggten User

2) **Admin User-Management**
- Route: `/admin/users`
- Zugriff: `admin`

3) **Super Admin User-Management**
- Route: `/super-admin/users`
- Zugriff: `super_admin`

## API Endpoints

### 1) Passwort aendern (eingeloggt)
```
POST /auth/update-password
Authorization: Bearer <access_token>
Body:
{
  "new_password": "string"
}
```
- Passwort Mindestlaenge: 6

### 2) Admin Reset Email an User senden
```
POST /auth/users/{userId}/reset-password
Authorization: Bearer <access_token>
```
- `admin` nur eigene Organization
- `super_admin` alle Organizations

Reset-Link:
- Backend setzt `redirectTo` auf `FRONTEND_RESET_PASSWORD_URL` oder `FRONTEND_URL/reset-password`
- Email-Template sollte nur `{{ .ConfirmationURL }}` verwenden (kein zusaetzliches `redirect_to`)

### 3) User-Liste
```
GET /auth/users
Authorization: Bearer <access_token>
```
- `admin` bekommt nur eigene Organization
- `super_admin` bekommt alle User

### 4) Organization-Liste (nur Super Admin)
```
GET /organizations
Authorization: Bearer <access_token>
```

## UI Spezifikation

### A) Settings Page (`/settings`)

**Sektionen:**
1. Account
2. Passwort aendern

**Formularfelder:**
- `new_password` (Passwort)
- `confirm_password` (Passwort wiederholen)

**Validierung:**
- Mindestlaenge 6
- `new_password` und `confirm_password` muessen gleich sein

**UX:**
- Primary Button: "Passwort aendern"
- Success Message: "Passwort aktualisiert"
- Fehlertexte aus API anzeigen (z. B. invalid, rate limit)

**State/Flow:**
1. User fuellt Formular aus
2. POST `/auth/update-password`
3. Success Toast + Formular leeren

### B) Admin User-Management (`/admin/users`)

**Tabelle:**
- Spalten: Name, Email, Rolle, Status (optional), Aktionen
- Aktion: "Passwort-Reset senden"

**Flow fuer Reset:**
1. Klick auf Reset
2. Bestaetigungs-Dialog (Text: "Reset Email an <email> senden?")
3. POST `/auth/users/{userId}/reset-password`
4. Success Toast: "Reset Email gesendet"

**Filter:**
- Optional: Suche nach Email/Name

### C) Super Admin User-Management (`/super-admin/users`)

**Zusatz:**
- Organization Filter (Dropdown)

**Datenfluss:**
1. GET `/organizations` fuellen
2. GET `/auth/users` fuer alle User
3. Client-seitig filtern nach `organizationId`

**Hinweis:**
- Wenn kein Filter gewaehlt: alle User anzeigen

## Fehlerfaelle

- 401/403: Zugriff verweigert -> Route blocken und auf Login/Forbidden Page
- 422/400: Validierung -> Formfelder markieren
- 500: generische Fehlermeldung

## UI Komponenten (Vorschlag)

- `PasswordChangeForm`
- `UserTable`
- `ResetPasswordButton`
- `OrganizationFilter`
- `ConfirmDialog`
- `Toast`

## QA Checklist

- User kann Passwort aendern nur wenn eingeloggt
- Admin sieht nur User seiner Organization
- Admin kann nur dort Reset senden
- Super Admin sieht alle User
- Super Admin kann nach Organization filtern
- Reset sendet immer Email und blockiert nicht UI

## Supabase UI Checklist (Reset Password)

1) Auth > URL Configuration
- Site URL: `https://fleettrack-frontend.vercel.app/`
- Redirect URLs: `https://fleettrack-frontend.vercel.app/reset-password`

2) Auth > Email Templates > Reset password
- Link nur mit `{{ .ConfirmationURL }}`
- Kein zusaetzliches `redirect_to` anhaengen

3) Backend Env
- `FRONTEND_RESET_PASSWORD_URL` gesetzt (empfohlen)
