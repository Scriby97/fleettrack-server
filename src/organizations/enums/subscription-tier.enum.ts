export enum SubscriptionTier {
  LIEUTENANT = 'lieutenant', // Free - bis 8 Fahrzeuge, 13 Mitarbeiter
  CAPTAIN = 'captain', // CHF 69.-/Monat - bis 20 Fahrzeuge, 50 Mitarbeiter
  GENERAL = 'general', // CHF 139.-/Monat - unlimitiert
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}
