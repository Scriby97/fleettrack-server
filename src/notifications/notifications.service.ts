import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageReminderEntity } from './usage-reminder.entity';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { CreatePushSubscriptionDto } from './dto/push-subscription.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(UsageReminderEntity)
    private readonly reminderRepository: Repository<UsageReminderEntity>,
    @InjectRepository(PushSubscriptionEntity)
    private readonly subscriptionRepository: Repository<PushSubscriptionEntity>,
  ) {}

  /**
   * Erinnerungs-Einstellungen des Users - falls noch keine existieren, ein
   * Default-Objekt zurueckgeben statt 404 (einfacher fuers Frontend). Default
   * ist bewusst bereits aktiviert (20:30), damit ein User, der die Einstellungen
   * noch nie angefasst hat, beim ersten Speichern nicht zusaetzlich noch den
   * Schalter umlegen und die Zeit setzen muss - persistiert wird trotzdem erst
   * durch updateReminder (und die Browser-Berechtigung muss der User ohnehin
   * explizit erteilen, das kann kein Default ersetzen).
   */
  async getReminder(userId: string): Promise<UsageReminderEntity> {
    const existing = await this.reminderRepository.findOne({
      where: { userId },
    });
    if (existing) return existing;

    return this.reminderRepository.create({
      userId,
      enabled: true,
      reminderTime: '20:30',
      timezone: 'Europe/Zurich',
    });
  }

  async updateReminder(
    userId: string,
    enabled: boolean,
    time: string,
  ): Promise<UsageReminderEntity> {
    let reminder = await this.reminderRepository.findOne({
      where: { userId },
    });
    if (!reminder) {
      reminder = this.reminderRepository.create({ userId });
    }
    reminder.enabled = enabled;
    reminder.reminderTime = time;
    return this.reminderRepository.save(reminder);
  }

  async addSubscription(
    userId: string,
    dto: CreatePushSubscriptionDto,
  ): Promise<PushSubscriptionEntity> {
    const existing = await this.subscriptionRepository.findOne({
      where: { endpoint: dto.endpoint },
    });
    if (existing) {
      existing.userId = userId;
      existing.p256dh = dto.keys.p256dh;
      existing.auth = dto.keys.auth;
      return this.subscriptionRepository.save(existing);
    }

    const subscription = this.subscriptionRepository.create({
      userId,
      endpoint: dto.endpoint,
      p256dh: dto.keys.p256dh,
      auth: dto.keys.auth,
    });
    return this.subscriptionRepository.save(subscription);
  }

  async removeSubscription(userId: string, endpoint: string): Promise<void> {
    await this.subscriptionRepository.delete({ userId, endpoint });
  }

  async removeSubscriptionByEndpoint(endpoint: string): Promise<void> {
    await this.subscriptionRepository.delete({ endpoint });
  }

  /**
   * Faellige Erinnerungen: reminderTime (Format "HH:mm") ist bereits erreicht
   * oder ueberschritten - bewusst kein exakter Gleichheitsvergleich mehr.
   * Der EVERY_MINUTE-Cron in ReminderSchedulerService laeuft nur, waehrend
   * der Prozess wach ist; auf Render Free Tier schlaeft das Backend nach
   * Inaktivitaet ein, und eine in dieser Zeit verpasste Minute wird nicht
   * automatisch nachgeholt. Mit "<=" holt der naechste tatsaechlich
   * laufende Tick eine verpasste Erinnerung nach, statt sie fuer den Tag
   * ersatzlos ausfallen zu lassen. Der doppelte Versand am selben Tag wird
   * separat ueber lastSentAt verhindert (siehe
   * ReminderSchedulerService.processReminder).
   */
  async findDueReminders(nowHhMm: string): Promise<UsageReminderEntity[]> {
    return this.reminderRepository
      .createQueryBuilder('reminder')
      .where('reminder.enabled = true')
      .andWhere('reminder."reminderTime" <= :nowHhMm', { nowHhMm })
      .getMany();
  }

  async markSent(reminderId: string): Promise<void> {
    await this.reminderRepository.update(reminderId, {
      lastSentAt: new Date(),
    });
  }

  async getSubscriptionsForUser(
    userId: string,
  ): Promise<PushSubscriptionEntity[]> {
    return this.subscriptionRepository.find({ where: { userId } });
  }
}
