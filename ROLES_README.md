# Rollen-System (RBAC) - FleetTrack

## Verfügbare Rollen

- **`admin`** - Voller Zugriff auf alle Funktionen
- **`user`** - Eingeschränkter Zugriff (nur Lesen)

## Wie funktioniert das System?

### 1. Rollen-Vergabe bei Registrierung

Standardmäßig bekommen alle neuen User die Rolle **`user`**:

```bash
POST /auth/signup
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "Max",
  "lastName": "Mustermann"
}
# → Rolle: "user"
```

### 2. Ersten Admin erstellen

**Option A: Direkt in der Datenbank**
Nach der ersten Registrierung:
```sql
UPDATE user_profiles 
SET role = 'admin' 
WHERE email = 'deine@email.com';
```

**Option B: Über API (wenn du schon Admin bist)**
```bash
PATCH /auth/users/{userId}/role
Authorization: Bearer <admin-token>
{
  "role": "admin"
}
```

### 3. Rollen-Verwaltung

**Alle User anzeigen (nur Admins):**
```bash
GET /auth/users
Authorization: Bearer <admin-token>
```

Response:
```json
[
  {
    "id": "uuid-1",
    "email": "admin@example.com",
    "role": "admin",
    "firstName": "Max",
    "lastName": "Admin",
    "createdAt": "2025-12-23T10:00:00Z"
  },
  {
    "id": "uuid-2",
    "email": "user@example.com",
    "role": "user",
    "firstName": "Anna",
    "lastName": "User",
    "createdAt": "2025-12-23T11:00:00Z"
  }
]
```

**User zur Admin machen:**
```bash
PATCH /auth/users/uuid-2/role
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "role": "admin"
}
```

**Admin zu User zurückstufen:**
```bash
PATCH /auth/users/uuid-1/role
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "role": "user"
}
```

## Verwendung in Controllern

### Controller-Methode für alle authentifizierten User:
```typescript
@Get()
getAllVehicles(@CurrentUser() user: AuthUser) {
  return this.vehiclesService.findAll();
}
```

### Controller-Methode nur für Admins:
```typescript
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../auth/enums/user-role.enum';

@Roles(UserRole.ADMIN)
@Post()
createVehicle(@Body() dto: CreateVehicleDto) {
  return this.vehiclesService.create(dto);
}
```

### Controller-Methode für mehrere Rollen:
```typescript
@Roles(UserRole.ADMIN, UserRole.USER)
@Get('stats')
getStats() {
  return this.vehiclesService.stats();
}
```

## Beispiel-Endpoints mit Rollen

### Öffentlich (keine Auth nötig):
- `POST /auth/signup` - Registrierung
- `POST /auth/signin` - Login
- `POST /auth/refresh` - Token erneuern
- `POST /auth/reset-password` - Passwort-Reset

### Authentifiziert (User oder Admin):
- `GET /auth/me` - Eigenes Profil
- `GET /vehicles` - Fahrzeuge anzeigen
- `GET /vehicles/stats` - Statistiken anzeigen
- `GET /usages` - Nutzungen anzeigen
- `POST /usages` - Nutzung erstellen

### Nur Admins:
- `GET /auth/users` - Alle User auflisten
- `PATCH /auth/users/:id/role` - User-Rolle ändern
- `POST /vehicles` - Fahrzeug erstellen
- `DELETE /vehicles/:id` - Fahrzeug löschen

## Frontend-Integration

### Login und Rolle speichern:
```typescript
const response = await fetch('http://localhost:3000/auth/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const data = await response.json();

// Token und Rolle speichern
localStorage.setItem('access_token', data.access_token);
localStorage.setItem('user_role', data.user.role);
```

### Rolle abfragen:
```typescript
const response = await fetch('http://localhost:3000/auth/me', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('access_token')}`
  }
});

const profile = await response.json();
console.log('Rolle:', profile.role); // "admin" oder "user"
```

### Bedingte UI-Anzeige:
```typescript
// Nur für Admins anzeigen
{profile.role === 'admin' && (
  <button onClick={createVehicle}>Fahrzeug hinzufügen</button>
)}

// Für normale User ausblenden
{profile.role === 'user' && (
  <p>Du hast keine Berechtigung zum Erstellen von Fahrzeugen</p>
)}
```

## Error Handling

**403 Forbidden** - User hat nicht die erforderliche Rolle:
```json
{
  "statusCode": 403,
  "message": "Forbidden resource"
}
```

**401 Unauthorized** - Kein oder ungültiges Token:
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

## Testing

### Test als User:
```bash
# Registrieren
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"test123456"}'

# Login
curl -X POST http://localhost:3000/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"test123456"}'

# Fahrzeuge abrufen (sollte funktionieren)
curl -X GET http://localhost:3000/vehicles \
  -H "Authorization: Bearer <token>"

# Fahrzeug erstellen (sollte 403 geben)
curl -X POST http://localhost:3000/vehicles \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","plate":"AB-123","snowsatNumber":"123"}'
```

### Test als Admin:
```bash
# User manuell zu Admin machen (in DB oder via Admin-Account)
# Dann login und testen

curl -X POST http://localhost:3000/vehicles \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","plate":"AB-123","snowsatNumber":"123"}'
# → Sollte funktionieren!
```

## Best Practices

1. **Ersten Admin manuell erstellen**: Nutze die Datenbank oder ein Setup-Script
2. **Nicht alle Admins vergeben**: Beschränke Admin-Zugriff auf vertrauenswürdige Personen
3. **Rolle im Frontend prüfen**: Blende Admin-Funktionen für normale User aus
4. **Nie nur Frontend-Prüfung**: Backend muss immer validieren (Security!)
5. **Audit-Log**: Logge wichtige Admin-Aktionen für Nachvollziehbarkeit
