# Deployment-Anleitung

## Übersicht

- **Backend**: https://fleettrack-server.onrender.com/ (Render.com)
- **Frontend**: https://fleettrack-frontend.vercel.app/ (Vercel)
- **Datenbank**: Supabase PostgreSQL

---

## 🚀 Backend Deployment (Render.com)

### Voraussetzungen
- GitHub Repository ist verbunden mit Render
- Render.com Account ist eingerichtet

### Schritte

#### 1. Environment Variables auf Render setzen

Gehe zu Render Dashboard → Dein Service → Environment:

```bash
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Database
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# Frontend URL (wichtig für Invite-Links!)
FRONTEND_URL=https://fleettrack-frontend.vercel.app

# Port (wird automatisch von Render gesetzt)
PORT=3001
```

#### 2. Build & Start Commands auf Render

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npm run start:prod
```

#### 3. Deploy

```bash
# Code committen
git add .
git commit -m "Update deployment settings"
git push origin main

# Render deployed automatisch nach jedem Push auf main
```

#### 4. Überprüfen

1. Öffne: https://fleettrack-server.onrender.com/
2. Du solltest sehen: `FleetTrack Backend API is running`
3. Teste API: https://fleettrack-server.onrender.com/vehicles (erfordert Auth)

---

## 🎨 Frontend Deployment (Vercel)

### Voraussetzungen
- GitHub Repository ist verbunden mit Vercel
- Vercel Account ist eingerichtet

### Schritte

#### 1. Environment Variables auf Vercel setzen

Gehe zu Vercel Dashboard → Dein Projekt → Settings → Environment Variables:

```bash
# Backend API URL
NEXT_PUBLIC_API_URL=https://fleettrack-server.onrender.com

# Supabase (nur ANON_KEY, niemals SERVICE_ROLE_KEY!)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
```

**⚠️ WICHTIG**: Niemals `SUPABASE_SERVICE_ROLE_KEY` im Frontend verwenden!

#### 2. Deploy

```bash
# Code committen
git add .
git commit -m "Update frontend settings"
git push origin main

# Vercel deployed automatisch nach jedem Push auf main
```

#### 3. Überprüfen

1. Öffne: https://fleettrack-frontend.vercel.app/
2. Login sollte funktionieren
3. API-Calls sollten zu Render Backend gehen

---

## 🗄️ Datenbank Migration (Supabase)

### Baseline Migration ausführen

1. Gehe zu Supabase Dashboard → SQL Editor
2. Öffne `migrations/001_initial_schema.sql`
3. Kopiere den gesamten Inhalt
4. Führe im SQL Editor aus
5. Prüfe Security Advisor → sollte keine Errors mehr zeigen

### Service Role Key überprüfen

Stelle sicher, dass das Backend den **Service Role Key** nutzt (nicht Anon Key):
- Service Role Key bypassed RLS
- Nur im Backend verwenden
- Niemals im Frontend exponieren

---

## ✅ Deployment Checklist

### Vor dem Deployment

- [ ] Baseline Migration auf Supabase ausgeführt (`001_initial_schema.sql`)
- [ ] RLS aktiviert und getestet
- [ ] `.env.example` aktualisiert mit Produktions-URLs
- [ ] CORS in `main.ts` enthält Frontend-URL
- [ ] Frontend-URL in Backend Environment gesetzt

### Backend (Render)

- [ ] Environment Variables korrekt gesetzt:
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` ⚠️
  - [ ] `DATABASE_URL`
  - [ ] `FRONTEND_URL` (für Invite-Links)
- [ ] Build Command: `npm install && npm run build`
- [ ] Start Command: `npm run start:prod`
- [ ] Health Check: https://fleettrack-server.onrender.com/ zeigt Willkommensnachricht

### Frontend (Vercel)

- [ ] Environment Variables korrekt gesetzt:
  - [ ] `NEXT_PUBLIC_API_URL` = https://fleettrack-server.onrender.com
  - [ ] `NEXT_PUBLIC_SUPABASE_URL`
  - [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` (nur Anon Key!)
- [ ] Auto-Deploy aktiviert für main branch
- [ ] Frontend öffnet sich und lädt

### Nach dem Deployment

- [ ] Login funktioniert
- [ ] Vehicles werden geladen
- [ ] Usages werden geladen
- [ ] Multi-Tenancy funktioniert (Admin sieht nur eigene Org)
- [ ] Super Admin kann Organisationen erstellen
- [ ] Invite-Links funktionieren (enthalten richtige Frontend-URL)
- [ ] Security Advisor zeigt keine kritischen Errors

---

## 🔧 Troubleshooting

### Backend startet nicht

1. **Prüfe Render Logs**:
   - Render Dashboard → Logs
   - Suche nach Fehlermeldungen

2. **Häufige Probleme**:
   - `DATABASE_URL` falsch → Prüfe Connection String
   - `SUPABASE_SERVICE_ROLE_KEY` fehlt → Backend kann nicht auf DB zugreifen
   - TypeORM Fehler → Prüfe `synchronize: false` in ormconfig

### CORS Errors im Frontend

1. **Prüfe CORS in main.ts**:
   ```typescript
   app.enableCors({
     origin: [
       'http://localhost:3000',
       'https://fleettrack-frontend.vercel.app'
     ],
     credentials: true,
   });
   ```

2. **Stelle sicher**:
   - Frontend-URL ist exakt richtig (mit/ohne trailing slash)
   - Backend ist neu deployed nach CORS-Änderung

### Invite-Links zeigen falsche URL

1. **Prüfe Environment Variable**:
   - Render Dashboard → Environment → `FRONTEND_URL`
   - Sollte sein: `https://fleettrack-frontend.vercel.app`

2. **Code-Check**:
   - [organizations.controller.ts](src/organizations/organizations.controller.ts) Zeile ~33
   - Nutzt `process.env.FRONTEND_URL` für Invite-Links

### RLS blockiert Zugriffe

1. **Prüfe Service Role Key**:
   - Backend muss `SUPABASE_SERVICE_ROLE_KEY` nutzen
   - Service Role Key bypassed RLS automatisch

2. **Prüfe Code**:
   - [supabase.service.ts](src/supabase/supabase.service.ts)
   - Sollte Service Role Key für createClient nutzen

### Frontend bekommt 401 Unauthorized

1. **Prüfe Authentication**:
   - User ist eingeloggt in Supabase
   - JWT Token wird im Header mitgeschickt
   - Token ist nicht abgelaufen

2. **Prüfe Backend**:
   - `SUPABASE_ANON_KEY` stimmt mit Frontend überein
   - Auth Guard ist korrekt konfiguriert

---

## 🔒 Sicherheit

### Production Best Practices

✅ **Do's:**
- Service Role Key nur im Backend
- Anon Key nur im Frontend
- CORS auf spezifische Origins begrenzen
- RLS auf allen Tabellen aktiviert
- HTTPS für alle Verbindungen
- Environment Variables niemals im Code

❌ **Don'ts:**
- Service Role Key im Frontend
- Secrets in Git committen
- CORS auf `*` (alle Origins)
- RLS deaktiviert lassen
- Credentials in Logs ausgeben

---

## 📊 Monitoring

### Render Dashboard
- **Logs**: Real-time logs des Backends
- **Metrics**: CPU, Memory, Response Times
- **Events**: Deploys, Crashes, Restarts

### Vercel Dashboard
- **Analytics**: Page Views, Visitors
- **Logs**: Build logs und Runtime logs
- **Speed Insights**: Performance Metrics

### Supabase Dashboard
- **Database**: Health, Connections, Storage
- **Auth**: Active Users, Auth Events
- **API**: Request Counts, Errors
- **Security Advisor**: RLS Status, Warnings

---

## 🚨 Rollback

Falls etwas schief geht:

### Backend Rollback (Render)

1. Render Dashboard → Deployments
2. Wähle vorherige erfolgreiche Deployment
3. Klicke "Redeploy"

### Frontend Rollback (Vercel)

1. Vercel Dashboard → Deployments
2. Wähle vorherige erfolgreiche Deployment
3. Klicke "Promote to Production"

### Database Rollback (Supabase)

Für Datenbankänderungen gibt es keinen automatischen Rollback.
Nutze die Rollback-SQL aus [RLS_MIGRATION.md](RLS_MIGRATION.md):

```sql
-- RLS deaktivieren (falls nötig)
ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;
-- ... (siehe RLS_MIGRATION.md für vollständige Rollback-SQL)
```

---

## 📞 Support

Bei Problemen:
1. Prüfe Logs (Render, Vercel, Supabase)
2. Siehe Troubleshooting-Sektion oben
3. Prüfe Environment Variables
4. Teste lokal mit gleichen Environment Variables

---

## 🎯 Quick Deploy Commands

```bash
# Backend neu deployen
git add .
git commit -m "Backend update"
git push origin main
# Render deployed automatisch

# Environment Variable ändern
# → Render Dashboard → Environment → Edit → Save
# → Render startet automatisch neu

# Logs checken
# → Render Dashboard → Logs (real-time)

# Frontend neu deployen
# → Push to main branch
# → Vercel deployed automatisch

# Migration ausführen
# → Supabase Dashboard → SQL Editor → Run migration
```

---

## 📝 Notes

- **Erste Deployment**: Erstelle manuell einen Super Admin in Supabase:
  ```sql
  UPDATE user_profiles 
  SET role = 'super_admin' 
  WHERE email = 'deine-email@example.com';
  ```

- **Invite-Links**: Werden automatisch mit `FRONTEND_URL` generiert
  - Format: `https://fleettrack-frontend.vercel.app/invite?token=...`

- **Auto-Deploy**: Beide Plattformen deployen automatisch bei Push auf main
  - Render: ~2-5 Minuten Build Time
  - Vercel: ~1-2 Minuten Build Time
