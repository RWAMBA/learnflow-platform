CREATE TABLE public.password_change_attempts (
  user_id uuid PRIMARY KEY,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.password_change_attempts TO authenticated;
GRANT ALL ON public.password_change_attempts TO service_role;

ALTER TABLE public.password_change_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own password attempt state"
ON public.password_change_attempts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_password_change_attempts_updated_at
BEFORE UPDATE ON public.password_change_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();