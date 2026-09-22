-- Joining a company needs an invitation the server recorded.
--
-- handle_new_user added every new user to whatever company their metadata
-- named (invited_to_company_id), with whatever role it named (invited_role).
-- inviteUserByEmail sets that metadata, but so can anyone calling the public
-- signUp endpoint with options.data. Proved in a rolled-back transaction: a
-- plain new user whose metadata named another company joined it as OWNER.
--
-- Now the claim is honoured only when company_invitations holds an unclaimed,
-- unexpired invitation for that company and the new user's email. The role
-- comes from the invitation. A claim without one is ignored and the user gets
-- their own company, exactly as an uninvited sign-up does.
--
-- Deployed after invite-user records invitations, so genuine invitations
-- keep working throughout.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_claimed_company_id uuid;
  v_invitation_id uuid;
  v_invitation_company_id uuid;
  v_invitation_role public.company_role;
  new_company_id uuid;
BEGIN
  -- Create the user's profile
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url');

  -- A claim to have been invited is only a claim. Look for the invitation.
  BEGIN
    v_claimed_company_id := NULLIF(new.raw_user_meta_data ->> 'invited_to_company_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_claimed_company_id := NULL;
  END;

  IF v_claimed_company_id IS NOT NULL AND new.email IS NOT NULL THEN
    SELECT i.id, i.company_id, i.role
      INTO v_invitation_id, v_invitation_company_id, v_invitation_role
    FROM public.company_invitations i
    WHERE i.company_id = v_claimed_company_id
      AND lower(i.email) = lower(new.email)
      AND i.claimed_at IS NULL
      AND i.expires_at > now()
    ORDER BY i.created_at DESC
    LIMIT 1
    FOR UPDATE;
  END IF;

  IF v_invitation_id IS NOT NULL THEN
    INSERT INTO public.company_users (company_id, user_id, role)
    VALUES (v_invitation_company_id, new.id, v_invitation_role);

    UPDATE public.company_invitations
    SET claimed_by_user_id = new.id, claimed_at = now()
    WHERE id = v_invitation_id;

    UPDATE public.profiles
    SET active_company_id = v_invitation_company_id
    WHERE id = new.id;
  ELSE
    -- Not invited (or the invitation cannot be found): the user's own company.
    INSERT INTO public.companies (name, owner_id)
    VALUES (COALESCE(new.raw_user_meta_data ->> 'full_name', 'My') || '''s Company', new.id)
    RETURNING id INTO new_company_id;

    INSERT INTO public.company_users (company_id, user_id, role)
    VALUES (new_company_id, new.id, 'owner');

    UPDATE public.profiles
    SET active_company_id = new_company_id
    WHERE id = new.id;
  END IF;

  RETURN new;
END;
$function$;
