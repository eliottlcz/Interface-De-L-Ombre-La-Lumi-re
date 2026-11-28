-- Synchronisation sans connexion permanente : chaque modification incrémente un compteur (séquence).
-- Les appareils consultent ce compteur toutes les quelques secondes et se rafraîchissent s'il a changé.
CREATE SEQUENCE IF NOT EXISTS dlal_change_seq;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION dlal_notify_change() RETURNS trigger AS $$
DECLARE rid text;
BEGIN
  IF TG_OP = 'DELETE' THEN rid := OLD.id::text; ELSE rid := NEW.id::text; END IF;
  PERFORM nextval('dlal_change_seq');
  PERFORM pg_notify('dlal_changes', json_build_object('t', TG_TABLE_NAME, 'op', TG_OP, 'id', rid)::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
