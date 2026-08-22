-- Migration: Organization Subscriptions
-- Jede Organisation hat maximal eine Subscription (1:1), die den Plan (tier) und Billing-Status trägt.
-- tier/status werden als stabile String-Keys gespeichert (siehe SubscriptionTier/SubscriptionStatus enums),
-- nicht als Anzeige-Namen - Limits und Preise pro Tier leben im Code (SUBSCRIPTION_LIMITS), nicht in der DB.

-- 1. Create organization_subscriptions table
CREATE TABLE IF NOT EXISTS public.organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL UNIQUE,
  tier VARCHAR(50) NOT NULL DEFAULT 'lieutenant',
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  "currentPeriodStart" TIMESTAMP,
  "currentPeriodEnd" TIMESTAMP,
  "canceledAt" TIMESTAMP,
  "stripeCustomerId" VARCHAR(255),
  "stripeSubscriptionId" VARCHAR(255) UNIQUE,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_org_subscriptions_org
    FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT chk_org_subscriptions_tier
    CHECK (tier IN ('lieutenant', 'captain', 'general')),
  CONSTRAINT chk_org_subscriptions_status
    CHECK (status IN ('active', 'past_due', 'canceled'))
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_org ON public.organization_subscriptions("organizationId");
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_tier ON public.organization_subscriptions(tier);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_status ON public.organization_subscriptions(status);

-- 2. Add comments for clarity
COMMENT ON COLUMN public.organization_subscriptions.tier IS
  'Stabiler Plan-Key: lieutenant (free), captain (CHF 99.-/Monat), general (CHF 199.-/Monat). Limits/Preise siehe SUBSCRIPTION_LIMITS im Code.';
COMMENT ON COLUMN public.organization_subscriptions.status IS
  'Billing-Status: active, past_due (Zahlung fehlgeschlagen) oder canceled.';

-- 3. Backfill: jede bestehende Organisation bekommt eine Lieutenant (Free) Subscription
INSERT INTO public.organization_subscriptions ("organizationId", tier, status)
SELECT o.id, 'lieutenant', 'active'
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_subscriptions os WHERE os."organizationId" = o.id
);

-- 4. Enable Row Level Security
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "Administrators can view all subscriptions" ON public.organization_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view their organizations' subscription" ON public.organization_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om."organizationId" = organization_subscriptions."organizationId"
      AND om."userId" = auth.uid()
    )
  );

CREATE POLICY "Service role can insert subscriptions" ON public.organization_subscriptions
  FOR INSERT
  WITH CHECK (true); -- Service role bypasses RLS

CREATE POLICY "Service role can update subscriptions" ON public.organization_subscriptions
  FOR UPDATE
  WITH CHECK (true); -- Service role bypasses RLS

CREATE POLICY "Service role can delete subscriptions" ON public.organization_subscriptions
  FOR DELETE
  USING (true); -- Service role bypasses RLS
