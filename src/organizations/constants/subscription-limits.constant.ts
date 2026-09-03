import { SubscriptionTier } from '../enums/subscription-tier.enum';

export interface SubscriptionLimits {
  maxVehicles: number | null; // null = unlimitiert
  maxMembers: number | null; // null = unlimitiert
  priceChf: number;
}

export const SUBSCRIPTION_LIMITS: Record<SubscriptionTier, SubscriptionLimits> = {
  [SubscriptionTier.LIEUTENANT]: { maxVehicles: 2, maxMembers: 5, priceChf: 0 },
  [SubscriptionTier.CAPTAIN]: { maxVehicles: 20, maxMembers: 50, priceChf: 49 },
  [SubscriptionTier.GENERAL]: { maxVehicles: null, maxMembers: null, priceChf: 99 },
};
