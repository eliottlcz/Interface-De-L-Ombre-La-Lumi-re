-- Synchronisation temps réel : chaque modification de donnée métier émet un signal
-- sur le canal `dlal_changes`. Le serveur (route SSE /api/realtime) l'écoute et
-- prévient instantanément tous les appareils connectés (ordinateur, iPad, smartphone).
CREATE OR REPLACE FUNCTION dlal_notify_change() RETURNS trigger AS $$
DECLARE rid text;
BEGIN
  IF TG_OP = 'DELETE' THEN rid := OLD.id::text; ELSE rid := NEW.id::text; END IF;
  PERFORM pg_notify('dlal_changes', json_build_object('t', TG_TABLE_NAME, 'op', TG_OP, 'id', rid)::text);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contacts','contact_interactions','episodes','episode_stages','contents','tasks','task_comments',
    'attachments','events','checklists','checklist_items','guest_documents','transactions','ideas','resources',
    'vault_items','integrations','metric_snapshots','content_stats','notifications','users'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', t || '_realtime', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dlal_notify_change()', t || '_realtime', t);
  END LOOP;
END $$;
