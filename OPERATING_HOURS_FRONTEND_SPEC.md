# Betriebsstunden Feldspezifikation für Frontend

## Übersicht
Die Felder `startOperatingHours` und `endOperatingHours` wurden aktualisiert, um Dezimalzahlen mit einer Nachkommastelle zu unterstützen.

**Wichtig**: `startOperatingHours` kann bei der ersten Nutzung eines neuen Fahrzeugs `0` sein.

## Technische Spezifikationen

### Datentyp
- **Backend-Typ**: `DECIMAL(10,1)`
- **Frontend-Typ**: `number`
- **Format**: Dezimalzahl mit maximal einer Nachkommastelle (>= 0 für startOperatingHours, > 0 für endOperatingHours)

### Validierungsregeln

#### 1. Nicht-negative Zahl (Start) / Positive Zahl (End)
- **Regel Start**: Wert muss >= 0 sein (0 ist erlaubt für neue Fahrzeuge)
- **Regel End**: Wert muss > 0 sein
- **Minimum Start**: 0
- **Minimum End**: 0.1
- **Fehlermeldung Start**: "Start-Betriebsstunden müssen 0 oder größer sein"
- **Fehlermeldung End**: "End-Betriebsstunden müssen größer als 0 sein"

#### 2. Dezimalstellen
- **Regel**: Maximal eine Nachkommastelle erlaubt
- **Erlaubt**: 123, 123.5, 0.1, 1500.9
- **Nicht erlaubt**: 123.45, 0.123, 1500.999
- **Fehlermeldung**: "Betriebsstunden dürfen maximal eine Nachkommastelle haben"

#### 3. Wertebereich
- **Minimum**: 0.1
- **Maximum**: 999999999.9 (theoretisches Maximum basierend auf DECIMAL(10,1))
- **Fehlermeldung Minimum**: "Betriebsstunden müssen mindestens 0.1 sein"
- **Fehlermeldung Maximum**: "Betriebsstunden dürfen nicht größer als 999999999.9 sein"

#### 4. End-Betriebsstunden Validierung
- **Regel**: `endOperatingHours` muss immer einen Wert > 0 haben (erforderlich)
- **Regel**: `endOperatingHours` muss >= `startOperatingHours` sein
- **Fehlermeldung**: "End-Betriebsstunden sind erforderlich"
- **Fehlermeldung**: "End-Betriebsstunden müssen größer oder gleich den Start-Betriebsstunden sein"

### Input-Feld Konfiguration

#### HTML Input Attribute
```html
<!-- Start Operating Hours (kann 0 sein für neue Fahrzeuge) -->
<input 
  type="number" 
  step="0.1" 
  min="0"
  max="999999999.9"
  placeholder="z.B. 1234.5 (oder 0 für neues Fahrzeug)"
  required
/>

<!-- End Operating Hours (muss > 0 sein) -->
<input 
  type="number" 
  step="0.1" 
  min="0.1"
  max="999999999.9"
  placeholder="z.B. 1256.8"
  required
/>
```

#### React/Angular Beispiel
```typescript
// Validation Schema (z.B. mit Yup oder Zod)
{
  startOperatingHours: number()
    .min(0, "Start-Betriebsstunden müssen 0 oder größer sein")
    .test(
      'maxDecimalPlaces',
      'Betriebsstunden dürfen maximal eine Nachkommastelle haben',
      (value) => {
        if (value === undefined || value === null) return true;
        const decimalPlaces = (value.toString().split('.')[1] || '').length;
        return decimalPlaces <= 1;
      }
    )
    .required("Start-Betriebsstunden sind erforderlich"),
    
  endOperatingHours: number()
    .positive("End-Betriebsstunden müssen größer als 0 sein")
    .min(0.1, "End-Betriebsstunden müssen mindestens 0.1 sein")
    .test(
      'maxDecimalPlaces',
      'Betriebsstunden dürfen maximal eine Nachkommastelle haben',
      (value) => {
        if (value === undefined || value === null) return true;
        const decimalPlaces = (value.toString().split('.')[1] || '').length;
        return decimalPlaces <= 1;
      }
    )
    .test(
      'greaterThanStart',
      'End-Betriebsstunden müssen größer oder gleich den Start-Betriebsstunden sein',
      function(value) {
        return value >= this.parent.startOperatingHours;
      }
    )
    .required("End-Betriebsstunden sind erforderlich")
}
```

### Anzeige-Format

#### In Tabellen und Listen
- **Format**: `1234.5` (mit Punkt als Dezimaltrennzeichen)
- **Keine führenden Nullen**: `0.5` statt `00.5`
- **Bei ganzen Zahlen**: Optional mit `.0` anzeigen (z.B. `1234.0`) für Konsistenz
- **Bei 0**: Anzeige als `0.0` oder `0` (für neue Fahrzeuge)

#### In Formularen
- **Platzhalter-Text Start**: "z.B. 1234.5 (oder 0 für neues Fahrzeug)"
- **Platzhalter-Text End**: "z.B. 1256.8"
- **Hilfstext unter Start-Feld**: "Geben Sie die Start-Betriebsstunden ein. Bei neuen Fahrzeugen geben Sie 0 ein."
- **Hilfstext unter End-Feld**: "Geben Sie die End-Betriebsstunden mit maximal einer Nachkommastelle ein (z.B. 1256.8)"

### API-Beispiele

#### Request Body (Create Usage)
```json
// Beispiel 1: Normale Nutzung mit Start- und End-Betriebsstunden
{
  "vehicleId": "uuid-here",
  "startOperatingHours": 1234.5,
  "endOperatingHours": 1256.8,
  "fuelLitersRefilled": 50,
  "creationDate": "2026-02-01T10:30:00Z"
}

// Beispiel 2: Erste Nutzung eines neuen Fahrzeugs (startOperatingHours ist 0)
{
  "vehicleId": "uuid-here",
  "startOperatingHours": 0,
  "endOperatingHours": 15.5,
  "fuelLitersRefilled": 100,
  "creationDate": "2026-02-01T10:30:00Z"
}
```

#### Response Body
```json
{
  "id": "uuid-here",
  "vehicleId": "uuid-here",
  "startOperatingHours": 1234.5,
  "endOperatingHours": 1256.8,
  "fuelLitersRefilled": 50,
  "creationDate": "2026-02-01T10:30:00Z"
}
```

### Fehlerbehandlung

#### Backend Validation Errors
Bei ungültigen Werten gibt die API folgende Fehler zurück:

```json
{
  "statusCode": 400,
  "message": [
    "startOperatingHours must be a positive number",
    "startOperatingHours must be a number conforming to the specified constraints"
  ],
  "error": "Bad Request"
}
```

#### Frontend-Handling
- Fehler sofort beim Eingeben anzeigen (Real-time Validation)
- Fehler unter dem jeweiligen Input-Feld anzeigen
- Submit-Button deaktivieren, wenn Validierungsfehler vorhanden sind
- Fokus auf erstes fehlerhaftes Feld setzen beim Submit-Versuch

### JavaScript Hilfsfunktionen

```typescript
/**
 * Rundet eine Zahl auf eine Nachkommastelle
 */
function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Prüft ob eine Zahl maximal eine Nachkommastelle hat
 */
function hasMaxOneDecimalPlace(value: number): boolean {
  const decimalPlaces = (value.toString().split('.')[1] || '').length;
  return decimalPlaces <= 1;
}

/**
 * Formatiert die Betriebsstunden für Anzeige
 */
function formatOperatingHours(hours: number): string {
  return hours.toFixed(1);
}

/**
 * Validiert Betriebsstunden Input
 */
function validateOperatingHours(
  start: number, 
  end: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Start kann 0 sein (neues Fahrzeug), aber nicht negativ
  if (start < 0) {
    errors.push("Start-Betriebsstunden müssen 0 oder größer sein");
  }
  
  if (!hasMaxOneDecimalPlace(start)) {
    errors.push("Start-Betriebsstunden dürfen maximal eine Nachkommastelle haben");
  }
  
  // End ist immer erforderlich und muss > 0 sein
  if (end === null || end === undefined) {
    errors.push("End-Betriebsstunden sind erforderlich");
  } else {
    if (end <= 0) {
      errors.push("End-Betriebsstunden müssen größer als 0 sein");
    }
    
    if (!hasMaxOneDecimalPlace(end)) {
      errors.push("End-Betriebsstunden dürfen maximal eine Nachkommastelle haben");
    }
    
    // End muss immer >= Start sein
    if (end < start) {
      errors.push("End-Betriebsstunden müssen größer oder gleich den Start-Betriebsstunden sein");
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

### UX-Empfehlungen

1. **Auto-Formatierung**: Runde automatisch auf eine Nachkommastelle beim onBlur Event
2. **Inline-Validierung**: Zeige Fehler sofort während der Eingabe an
3. **Visuelles Feedback**: 
   - Grüner Rahmen bei gültiger Eingabe
   - Roter Rahmen bei ungültiger Eingabe
4. **Berechnung anzeigen**: Zeige automatisch die Differenz (end - start) an
5. **Vorschlagswerte**: Bei neuem Usage, verwende endOperatingHours des letzten Usage als startOperatingHours (falls vorhanden)
6. **Neue Fahrzeuge**: 
   - Zeige einen Hinweis "Neues Fahrzeug? Geben Sie 0 als Start-Betriebsstunden ein"
   - Oder Button: "Neues Fahrzeug" der automatisch 0 einträgt
7. **Differenz-Anzeige**: Berechne und zeige die Nutzungsdauer (end - start) automatisch an

### Migration Hinweise für Bestehende Daten

- Bestehende ganzzahlige Werte werden automatisch zu Dezimalzahlen konvertiert (z.B. 1234 → 1234.0)
- Keine Datenverluste durch die Migration
- Nach Migration sollten alle neuen Eingaben dem neuen Format entsprechen

### Testing Checkliste

- [ ] Input akzeptiert Dezimalzahlen mit einer Nachkommastelle (z.B. 123.5)
- [ ] Input akzeptiert ganze Zahlen (z.B. 123)
- [ ] Input lehnt Zahlen mit mehr als einer Nachkommastelle ab (z.B. 123.45)
- [ ] Input lehnt negative Zahlen ab
- [ ] **startOperatingHours akzeptiert 0 (für neue Fahrzeuge)**
- [ ] **endOperatingHours lehnt 0 ab (muss > 0 sein)**
- [ ] **Beide Felder sind erforderlich**
- [ ] End-Betriebsstunden müssen >= Start-Betriebsstunden sein
- [ ] Validation funktioniert korrekt wenn Start = 0
- [ ] Fehlermedungen werden korrekt angezeigt
- [ ] Submit ist deaktiviert bei Validierungsfehlern
- [ ] Werte werden korrekt an API gesendet (inklusive 0 für start)
- [ ] API-Fehler werden korrekt behandelt und angezeigt
