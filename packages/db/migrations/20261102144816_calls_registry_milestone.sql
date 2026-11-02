INSERT INTO "mito-deutsche_app_milestone" (name, at) VALUES ('calls_registry', now()) ON CONFLICT DO NOTHING;
