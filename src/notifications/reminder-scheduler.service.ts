import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as webpush from 'web-push';
import { UsageReminderEntity } from './usage-reminder.entity';
import { NotificationsService } from './notifications.service';
import { UsageEntity } from '../usages/usage.entity';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

@Injectable()
export class ReminderSchedulerService {
  private readonly logger = new Logger(ReminderSchedulerService.name);
  private vapidConfigured = false;

  constructor(
    private readonly notificationsService: NotificationsService,
    @InjectRepository(UsageEntity)
    private readonly usageRepository: Repository<UsageEntity>,
  ) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidConfigured = true;
    } else {
      this.logger.warn(
        'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT nicht gesetzt - Erfassungserinnerungen sind deaktiviert.',
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleDueReminders(): Promise<void> {
    if (!this.vapidConfigured) return;

    // Erinnerungszeit ist "HH:mm" ohne Zeitzoneninfo in der DB - wird aktuell
    // fix in Europe/Zurich ausgewertet (das timezone-Feld pro Reminder ist fuer
    // spaetere Flexibilitaet vorbereitet, die UI bietet aktuell keine
    // Zeitzonen-Auswahl an).
    const nowHhMm = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());

    // findDueReminders liefert alles, dessen reminderTime <= jetzt ist (siehe
    // dortiger Kommentar) - processReminder unten sorgt dafuer, dass davon
    // pro Kalendertag trotzdem nur einmal tatsaechlich verschickt wird.
    const dueReminders = await this.notificationsService.findDueReminders(nowHhMm);

    for (const reminder of dueReminders) {
      try {
        await this.processReminder(reminder);
      } catch (error) {
        this.logger.error(
          `Fehler beim Verarbeiten der Erinnerung fuer User ${reminder.userId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  // Kalendertag in Europe/Zurich als "YYYY-MM-DD" - Grundlage fuer "heute
  // schon verschickt?" statt eines festen Zeitfensters. Ein festes Fenster
  // (z.B. 12h) waere entweder zu kurz (Doppelversand noch am selben Tag bei
  // einer fruehen reminderTime) oder zu lang (kein Nachholen nach dem
  // Aufwachen aus dem Render-Free-Tier-Schlaf) - der Kalendertag ist unabhaengig
  // davon korrekt, wann genau der Cron-Tick tatsaechlich laeuft.
  private zurichDateString(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(date);
  }

  private async processReminder(reminder: UsageReminderEntity): Promise<void> {
    const now = Date.now();

    if (
      reminder.lastSentAt &&
      this.zurichDateString(new Date(reminder.lastSentAt)) === this.zurichDateString(new Date(now))
    ) {
      return;
    }

    // Smarte Erinnerung: nicht senden, wenn der User innerhalb der letzten 4
    // Stunden bereits eine Nutzung erfasst hat (creationDate = tatsaechlicher
    // Erfassungszeitpunkt, nicht das frei waehlbare usageDate-Feld).
    const recentUsage = await this.usageRepository
      .createQueryBuilder('usage')
      .where('usage.creatorId = :userId', { userId: reminder.userId })
      .andWhere('usage.creationDate >= :since', { since: now - FOUR_HOURS_MS })
      .getOne();

    if (recentUsage) {
      await this.notificationsService.markSent(reminder.id);
      return;
    }

    const subscriptions = await this.notificationsService.getSubscriptionsForUser(
      reminder.userId,
    );

    const payload = JSON.stringify({
      title: 'Nutzung erfassen',
      body: 'Vergiss nicht, deine heutige Fahrt einzutragen.',
      url: '/',
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            },
            payload,
          );
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            // Subscription nicht mehr gueltig (Berechtigung entzogen, Geraet
            // abgemeldet, ...) - aufraeumen statt bei jedem Tick erneut zu versuchen.
            await this.notificationsService.removeSubscriptionByEndpoint(
              subscription.endpoint,
            );
          } else {
            this.logger.error(
              `Push an ${subscription.endpoint} fehlgeschlagen`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }
      }),
    );

    await this.notificationsService.markSent(reminder.id);
  }
}
