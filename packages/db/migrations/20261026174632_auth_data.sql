-- Data for better-auth (spec auth-better-auth, PLAN D4, D5, D7). Only data:
-- the tables come with the migration before, and NextAuth's rows stay as they
-- are, tokens included (D6), so reverting the code brings NextAuth back.

-- Every user from before better-auth was let in by Azure or by the email
-- link: confirmed. With an unconfirmed email, better-auth's email link would
-- delete the user's accounts and sessions (revokeUnprovenAccountAccess)
UPDATE "mito-deutsche_user" SET "email_confirmed" = true;
--> statement-breakpoint

-- better-auth looks a user up by the email in lower case. Saved with capitals,
-- a user would no longer get in with the email link: lower case, unless
-- another user has the same email in another letter case. Those two stay as
-- they are, and the login refuses them as it does today
UPDATE "mito-deutsche_user" AS u
SET "email" = lower(u."email")
WHERE u."email" <> lower(u."email")
  AND NOT EXISTS (
    SELECT 1 FROM "mito-deutsche_user" AS other
    WHERE other."id" <> u."id" AND lower(other."email") = lower(u."email")
  );
--> statement-breakpoint

-- The `oid` claim of a JWT, or NULL for anything that isn't one: a malformed
-- token must not stop the deploy
CREATE FUNCTION "mito_auth_jwt_oid"(token text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  payload text := split_part(token, '.', 2);
BEGIN
  IF payload !~ '^[A-Za-z0-9_-]+$' THEN
    RETURN NULL;
  END IF;
  payload := translate(payload, '-_', '+/');
  payload := payload || repeat('=', (4 - length(payload) % 4) % 4);
  RETURN NULLIF(btrim(convert_from(decode(payload, 'base64'), 'UTF8')::json ->> 'oid'), '');
EXCEPTION WHEN others THEN
  RETURN NULL;
END
$$;
--> statement-breakpoint

-- NextAuth's Azure accounts, as better-auth finds them: its provider is
-- `microsoft` and the account is the `oid` of the Entra ID token, where
-- NextAuth kept the `sub`. The `oid` is in the id_token NextAuth saved. No
-- tokens are copied (AC31). An account without a usable id_token isn't copied:
-- its user has to be linked again by an admin
INSERT INTO "mito-deutsche_auth_account" ("id", "account_id", "provider_id", "user_id")
SELECT gen_random_uuid()::text, azure."oid", 'microsoft', azure."userId"
FROM (
  SELECT "userId", "mito_auth_jwt_oid"("id_token") AS "oid"
  FROM "mito-deutsche_account"
  WHERE "provider" = 'azure-ad' AND "id_token" IS NOT NULL
) AS azure
WHERE azure."oid" IS NOT NULL
ON CONFLICT ("provider_id", "account_id") DO NOTHING;
--> statement-breakpoint

DROP FUNCTION "mito_auth_jwt_oid"(text);
