-- Journal technique des erreurs serveur (consultable par les administrateurs) : aide au diagnostic en production.
CREATE TABLE IF NOT EXISTS server_errors (
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  method text,
  path text,
  message text,
  digest text,
  stack text
);
--> statement-breakpoint
ALTER TABLE server_errors ENABLE ROW LEVEL SECURITY;
