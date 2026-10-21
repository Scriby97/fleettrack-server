import { Injectable } from '@nestjs/common';
import { Observable, Subject, interval, merge } from 'rxjs';
import { filter, map } from 'rxjs/operators';

interface OrgChangeEvent {
  organizationId: string;
}

/**
 * Pro-Organisation Change-Signal fuer die Frontend-Cache-Invalidierung (siehe
 * DataFreshnessContext im Frontend) - transportiert selbst KEINE Daten, nur
 * "in Organisation X hat sich etwas geaendert, bitte neu laden". Aufrufer
 * (UsagesController/VehiclesController) rufen publish() nach jeder
 * erfolgreichen Nutzungs-/Fahrzeug-Aenderung auf.
 *
 * Laeuft aktuell In-Memory in einer einzelnen Backend-Instanz. Bei mehreren
 * Instanzen (aktuell nicht der Fall) wuerde ein Client, der bei Instanz A
 * verbunden ist, Aenderungen verpassen, die bei Instanz B passiert sind -
 * dafuer bräuchte es dann einen instanzübergreifenden Broadcast (z.B. Postgres
 * LISTEN/NOTIFY, da ohnehin schon Postgres im Einsatz ist). Der 2-Minuten-
 * Fallback-Timer im Frontend faengt das im Zweifel trotzdem ab, da er nicht
 * von diesem Stream abhaengt.
 */
@Injectable()
export class RealtimeService {
  private readonly changes$ = new Subject<OrgChangeEvent>();

  publish(organizationId: string): void {
    this.changes$.next({ organizationId });
  }

  streamForOrganization(organizationId: string): Observable<MessageEvent> {
    const changeEvents$ = this.changes$.pipe(
      filter((event) => event.organizationId === organizationId),
      map((): MessageEvent => ({ data: { type: 'changed' } }) as MessageEvent),
    );

    // Heartbeat alle 25s, damit Proxies/Hosting (z.B. Render) die Verbindung
    // nicht wegen Inaktivitaet schliessen - viele Setups killen stille
    // Verbindungen nach 30-60s. Transportiert kein eigenes Signal, das
    // Frontend ignoriert "ping"-Events bewusst.
    const heartbeat$ = interval(25_000).pipe(
      map((): MessageEvent => ({ data: { type: 'ping' } }) as MessageEvent),
    );

    return merge(changeEvents$, heartbeat$);
  }
}
