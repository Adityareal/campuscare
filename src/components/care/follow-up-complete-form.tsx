import { ActionForm, type CareAction } from "@/components/care/action-form";
import { Field, Input, Select } from "@/components/ui";

/** Inline completion for one scheduled follow-up. */
export function FollowUpCompleteForm({ action, followUpId, caseId }: { action: CareAction; followUpId: string; caseId: string | null }) {
  const prefix = `fu-${followUpId}`;
  return (
    <ActionForm action={action} submitLabel="Update follow-up" variant="secondary" size="sm" className="gap-3">
      <input type="hidden" name="followUpId" value={followUpId} />
      <input type="hidden" name="caseId" value={caseId ?? ""} />
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <Field id={`${prefix}-status`} label="Result">
          <Select id={`${prefix}-status`} name="status" defaultValue="DONE">
            <option value="DONE">Done</option>
            <option value="MISSED">Missed</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </Field>
        <Field id={`${prefix}-outcome`} label="Outcome note" optionalLabel="Optional">
          <Input id={`${prefix}-outcome`} name="outcome" maxLength={2000} />
        </Field>
      </div>
    </ActionForm>
  );
}
