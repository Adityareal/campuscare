-- Audit log rows are evidence. Reject any attempt to change or remove them at the database
-- layer, so a bug or a compromised service account cannot quietly rewrite history.
CREATE OR REPLACE FUNCTION campuscare_audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_or_delete
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION campuscare_audit_log_immutable();

CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION campuscare_audit_log_immutable();

-- Consent history is append-only for the same reason: a withdrawal is a new row, never an edit.
CREATE OR REPLACE FUNCTION campuscare_consent_record_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ConsentRecord is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER consent_record_no_update
  BEFORE UPDATE ON "ConsentRecord"
  FOR EACH ROW EXECUTE FUNCTION campuscare_consent_record_immutable();
