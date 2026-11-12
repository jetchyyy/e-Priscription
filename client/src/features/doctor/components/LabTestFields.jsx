import { useState } from 'react';
import { useFieldArray } from 'react-hook-form';
import { FlaskConical, Plus } from 'lucide-react';
import { Input, Select } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { COMMON_LAB_TESTS, emptyLabTest } from '../schemas';

const MAX_TESTS = 30;
const OTHER = '__other';

const isCommon = (name) => COMMON_LAB_TESTS.includes(name?.trim());

/** Lab tests for a lab request: pick from a dropdown, or choose "Others" and type the test. */
export function LabTestFields({ control, register, errors, watch, setValue }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'labTests' });
  // Rows where the doctor chose "Others", keyed by field id (the name may still be blank).
  const [otherRows, setOtherRows] = useState(() => new Set());
  const rowErr = (i, k) => errors?.labTests?.[i]?.[k]?.message;
  const current = watch('labTests') ?? [];

  const choiceFor = (field, i) => {
    const name = current[i]?.name ?? '';
    if (isCommon(name)) return name.trim();
    if (otherRows.has(field.id) || name.trim()) return OTHER;
    return '';
  };

  const setOther = (id, on) => setOtherRows((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  });

  const choose = (field, i, value) => {
    const path = `labTests.${i}.name`;
    if (value === OTHER) {
      setOther(field.id, true);
      setValue(path, '', { shouldDirty: true });
    } else {
      setOther(field.id, false);
      setValue(path, value, { shouldValidate: Boolean(value), shouldDirty: true });
    }
  };

  // Tests already picked in another row are shown as added so they are not ordered twice.
  const takenElsewhere = (name, i) => current.some((t, j) => j !== i && t?.name?.trim() === name);

  return (
    <div className="space-y-4">
      {fields.map((field, i) => {
        const choice = choiceFor(field, i);
        const nameReg = register(`labTests.${i}.name`);
        return (
          <fieldset key={field.id} className="rounded-2xl bg-ink-50/70 p-4 ring-1 ring-ink-100 sm:p-5">
            <legend className="sr-only">Test {i + 1}</legend>
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 font-display text-base font-semibold text-[#152839]">
                <FlaskConical className="h-4 w-4 text-[#ff6f07]" aria-hidden="true" /> Test {i + 1}
              </p>
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => { setOther(field.id, false); remove(i); }}
                  aria-label={`Remove test ${i + 1}`}
                  className="min-h-[36px] px-2 text-sm font-medium text-[#a3330a] hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="Test"
                required
                value={choice}
                onChange={(e) => choose(field, i, e.target.value)}
                // Lets the form focus this dropdown when the test is missing.
                ref={choice === OTHER ? undefined : nameReg.ref}
                error={choice === OTHER ? undefined : rowErr(i, 'name')}
              >
                <option value="">Choose a test…</option>
                {COMMON_LAB_TESTS.map((name) => {
                  const taken = takenElsewhere(name, i);
                  return (
                    <option key={name} value={name} disabled={taken}>
                      {taken ? `${name} (added)` : name}
                    </option>
                  );
                })}
                <option value={OTHER}>Others (please specify)</option>
              </Select>
              <Input label="Notes (optional)" placeholder="e.g. 8-10 hours fasting"
                error={rowErr(i, 'notes')} {...register(`labTests.${i}.notes`)} />
              {choice === OTHER && (
                <Input
                  wrapperClassName="sm:col-span-2"
                  label="Specify the test"
                  required
                  autoFocus={otherRows.has(field.id) && !current[i]?.name}
                  placeholder="e.g. Hepatitis B surface antigen (HBsAg)"
                  error={rowErr(i, 'name')}
                  {...nameReg}
                />
              )}
            </div>
          </fieldset>
        );
      })}

      {errors?.labTests?.message && <p role="alert" className="text-sm text-[#a3330a]">{errors.labTests.message}</p>}
      {errors?.labTests?.root?.message && <p role="alert" className="text-sm text-[#a3330a]">{errors.labTests.root.message}</p>}

      <Button variant="secondary" onClick={() => append({ ...emptyLabTest })} disabled={fields.length >= MAX_TESTS}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Add another test
      </Button>
    </div>
  );
}
