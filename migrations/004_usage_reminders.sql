-- Migration: Usage Reminders (taegliche Erfassungserinnerung per Web Push)
-- usage_reminders: pro User genau eine Zeile mit Erinnerungszeit/Status.
-- push_subscriptions: pro User beliebig viele Zeilen (ein Geraet/Browser
-- kann jeweils eine Subscription haben - mehrere Geraete = mehrere Zeilen).

-- 1. Create usage_reminders table
CREATE TABLE IF NOT EXISTS public.usage_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  "reminderTime" VARCHAR(5) NOT NULL DEFAULT '20:00',
  timezone VARCHAR(100) NOT NULL DEFAULT 'Europe/Zurich',
  "lastSentAt" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_usage_reminders_user
    FOREIGN KEY ("userId") REFERENCES public.user_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usage_reminders_enabled_time
  ON public.usage_reminders(enabled, "reminderTime");

COMMENT ON COLUMN public.usage_reminders."reminderTime" IS
  'Uhrzeit im Format HH:mm, ausgewertet in der Zeitzone der Spalte timezone.';
COMMENT ON COLUMN public.usage_reminders."lastSentAt" IS
  'Zeitpunkt des letzten Versands - verhindert Doppel-Versand innerhalb derselben Minute/desselben Tages.';

-- 2. Create push_subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_push_subscriptions_user
    FOREIGN KEY ("userId") REFERENCES public.user_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions("userId");

-- 3. Enable Row Level Security
ALTER TABLE public.usage_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies - usage_reminders
CREATE POLICY "Administrators can view all usage reminders" ON public.usage_reminders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'administrator'
    )
  );

CREATE POLICY "Users can view their own usage reminder" ON public.usage_reminders
  FOR SELECT
  USING ("userId" = auth.uid());

CREATE POLICY "Users can manage their own usage reminder" ON public.usage_reminders
  FOR ALL
  USING ("userId" = auth.uid())
  WITH CHECK ("userId" = auth.uid());

CREATE POLICY "Service role can manage usage reminders" ON public.usage_reminders
  FOR ALL
  USING (true)
  WITH CHECK (true); -- Service role bypasses RLS

-- 5. RLS Policies - push_subscriptions
CREATE POLICY "Users can manage their own push subscriptions" ON public.push_subscriptions
  FOR ALL
  USING ("userId" = auth.uid())
  WITH CHECK ("userId" = auth.uid());

CREATE POLICY "Service role can manage push subscriptions" ON public.push_subscriptions
  FOR ALL
  USING (true)
  WITH CHECK (true); -- Service role bypasses RLS
