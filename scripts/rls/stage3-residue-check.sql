DO $$
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM auth.users WHERE email LIKE 's3-%@example.test';
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % Stage 3 auth users persisted', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.site_content WHERE content_key LIKE 's3-proof-%';
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % Stage 3 content rows persisted', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.public_inquiries WHERE email = 's3-proof@example.test';
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % Stage 3 inquiry rows persisted', v_count; END IF;
  RAISE NOTICE '[stage3-residue] OK - zero residue, transaction was rolled back';
END
$$;
