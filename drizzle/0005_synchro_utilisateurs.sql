-- La date de dernière connexion change à chaque connexion : elle ne doit pas rafraîchir les autres appareils ouverts.
-- Les appareils ne se resynchronisent plus que pour les vraies modifications d'un compte (création, suppression, nom, rôle, droits, activation).
DROP TRIGGER IF EXISTS users_realtime ON users;
--> statement-breakpoint
CREATE TRIGGER users_realtime_ins_del AFTER INSERT OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION dlal_notify_change();
--> statement-breakpoint
CREATE TRIGGER users_realtime_maj AFTER UPDATE OF email, name, title, role, permission_overrides, active ON users FOR EACH ROW EXECUTE FUNCTION dlal_notify_change();
