-- The data of 20261026174632_auth_data again (spec auth-better-auth, PLAN D5),
-- for the users and the Azure accounts NextAuth created after it: until this
-- deploy NextAuth kept serving the login. Every statement skips what the first
-- run already did.

UPDATE "mito-deutsche_user" SET "email_confirmed" = true
WHERE "email_confirmed" = false;
--> statement-breakpoint

UPDATE "mito-deutsche_user" AS u
SET "email" = lower(u."email")
WHERE u."email" <> lower(u."email")
  AND NOT EXISTS (
    SELECT 1 FROM "mito-deutsche_user" AS other
    WHERE other."id" <> u."id" AND lower(other."email") = lower(u."email")
  );
--> statement-breakpoint

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
