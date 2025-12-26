# Supabase Auth Integration

## Setup

1. **Supabase Projekt erstellen**
   - Gehe zu [https://supabase.com](https://supabase.com)
   - Erstelle ein neues Projekt
   - Kopiere die `URL` und `anon key` aus den Projekt-Settings

2. **Umgebungsvariablen konfigurieren**
   ```bash
   cp .env.example .env
   ```
   Fülle die `.env` Datei mit deinen Supabase-Credentials aus:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here
   ```

3. **Dependencies installieren**
   ```bash
   npm install
   ```

4. **Server starten**
   ```bash
   npm run start:dev
   ```

## API Endpoints

### Auth Endpoints (öffentlich)

#### 1. Registrierung
```http
POST /auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "metadata": {
    "name": "Max Mustermann"
  }
}
```

#### 2. Login
```http
POST /auth/signin
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

Response:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "...",
  "user": {
    "id": "...",
    "email": "user@example.com"
  }
}
```

#### 3. Token erneuern
```http
POST /auth/refresh
Content-Type: application/json

{
  "refresh_token": "your-refresh-token"
}
```

#### 4. Passwort zurücksetzen
```http
POST /auth/reset-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Geschützte Endpoints (benötigen Auth Token)

Alle folgenden Requests benötigen einen Authorization Header:
```http
Authorization: Bearer <access_token>
```

#### 5. Aktueller User
```http
GET /auth/me
Authorization: Bearer <access_token>
```

#### 6. Logout
```http
POST /auth/signout
Authorization: Bearer <access_token>
```

#### 7. Passwort ändern
```http
POST /auth/update-password
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "new_password": "newSecurePassword123"
}
```

#### 8. Fahrzeuge abrufen
```http
GET /vehicles
Authorization: Bearer <access_token>
```

#### 9. Fahrzeug erstellen
```http
POST /vehicles
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Schneepflug 1",
  "plate": "AB-CD-123",
  "snowsatNumber": "12345"
}
```

#### 10. Fahrzeug-Statistiken
```http
GET /vehicles/stats
Authorization: Bearer <access_token>
```

#### 11. Nutzungen abrufen
```http
GET /usages
Authorization: Bearer <access_token>
```

#### 12. Nutzung erstellen
```http
POST /usages
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "vehicleId": "uuid-here",
  "startOperatingHours": 100,
  "endOperatingHours": 105,
  "fuelLitersRefilled": 50,
  "creationDate": "2025-12-23T10:00:00Z"
}
```

## Architektur

### Module

- **SupabaseModule**: Globales Modul für Supabase Client
- **AuthModule**: Authentifizierungs-Logik und Endpoints
- **VehiclesModule**: Fahrzeugverwaltung (geschützt)
- **UsagesModule**: Nutzungsverwaltung (geschützt)

### Guards

Der `SupabaseAuthGuard` ist global aktiv und schützt alle Endpoints standardmäßig. 

Um einen Endpoint öffentlich zu machen, verwende den `@Public()` Decorator:

```typescript
import { Public } from './auth/decorators/public.decorator';

@Public()
@Get('public')
publicEndpoint() {
  return 'Dieser Endpoint ist öffentlich';
}
```

### User-Zugriff in Controllern

Verwende den `@CurrentUser()` Decorator, um auf den authentifizierten User zuzugreifen:

```typescript
import { CurrentUser, AuthUser } from './auth/decorators/current-user.decorator';

@Get('profile')
getProfile(@CurrentUser() user: AuthUser) {
  console.log('User ID:', user.id);
  console.log('User Email:', user.email);
  return user;
}
```

## Testing mit cURL

### 1. Registrierung
```bash
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123456"}'
```

### 2. Login
```bash
curl -X POST http://localhost:3000/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123456"}'
```

Speichere den `access_token` aus der Response.

### 3. Geschützte Endpoint aufrufen
```bash
curl -X GET http://localhost:3000/vehicles \
  -H "Authorization: Bearer <access_token>"
```

## Hinweise

- **Alle Endpoints sind standardmäßig geschützt** außer:
  - `/auth/signup`
  - `/auth/signin`
  - `/auth/refresh`
  - `/auth/reset-password`

- Der Access Token läuft nach 1 Stunde ab (Supabase Standard)
- Verwende den Refresh Token, um einen neuen Access Token zu erhalten
- Supabase verwaltet die User-Datenbank automatisch

## Supabase Dashboard

In deinem Supabase Dashboard kannst du:
- User verwalten
- Auth-Einstellungen konfigurieren (E-Mail-Templates, OAuth-Provider, etc.)
- Row Level Security (RLS) für deine Tabellen einrichten
- API-Logs einsehen
