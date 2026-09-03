export enum SubscriptionTier {
  LIEUTENANT = 'lieutenant', // Free - bis 2 Fahrzeuge, 5 Mitarbeiter
  CAPTAIN = 'captain', // CHF 49.-/Monat - bis 20 Fahrzeuge, 50 Mitarbeiter
  GENERAL = 'general', // CHF 99.-/Monat - unlimitiert
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}
