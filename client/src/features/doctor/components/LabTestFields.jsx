import { useFieldArray } from 'react-hook-form';
import { FlaskConical, Plus } from 'lucide-react';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { COMMON_LAB_TESTS, emptyLabTest } from '../schemas';

const MAX_TESTS = 30;

/** Lab tests for a lab request: one-tap common tests plus free-text rows. */
export function LabTestFields({ control, register, errors, watch }) {
  const { fields, append, remove, update } = useFieldArray({ control, name: 'labTests' });
  const rowErr = (i, k) => errors?.labTests?.[i]?.[k]?.message;
  const current = watch('labTests') ?? [];
  const picked = (name) => current.findIndex((t) => t?.name?.trim().toLowerCase() === name.toLowerCase());

  const toggle = (name) => {
    const at = picked(name);
    if (at >= 0) {
      if (fields.length > 1) remove(at); else update(at, { ...emptyLabTest });
      return;
    }
    // Fill the first blank row before adding a new one.
    const blank = current.findIndex((t) => !t?.name?.trim());
    if (blank >= 0) update(blank, { name, notes: current[blank]?.notes ?? '' });
    else if (fields.length < MAX_TESTS) append({ name, notes: '' }, { shouldFocus: false });
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#5f6a7c]">Common tests</p>
        <div className="flex flex-wrap gap-2">
          {COMMON_LAB_TESTS.map((name) => {
            const on = picked(name) >= 0;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(name)}
                className={on
                  ? 'rounded-full border border-[#ff6f07] bg-[#fff3ea] px-3 py-1.5 text-sm font-semibold text-[#b8470a]'
                  : 'rounded-full border border-[#dce1e8] bg-white px-3 py-1.5 text-sm text-[#152839] hover:bg-[#f9f8f3]'}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {fields.map((field, i) => (
        <fieldset key={field.id} className="rounded-2xl bg-ink-50/70 p-4 ring-1 ring-ink-100 sm:p-5">
          <legend className="sr-only">Test {i + 1}</legend>
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 font-display text-base font-semibold text-[#152839]">
              <FlaskConical className="h-4 w-4 text-[#ff6f07]" aria-hidden="true" /> Test {i + 1}
            </p>
            {fields.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove test ${i + 1}`}
                className="text-sm font-medium text-[#a3330a] hover:underline"
              >
                Remove
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Test" required placeholder="e.g. Complete Blood Count (CBC)"
              error={rowErr(i, 'name')} {...register(`labTests.${i}.name`)} />
            <Input label="Notes (optional)" placeholder="e.g. 8-10 hours fasting"
              error={rowErr(i, 'notes')} {...register(`labTests.${i}.notes`)} />
          </div>
        </fieldset>
      ))}

      {errors?.labTests?.message && <p role="alert" className="text-sm text-[#a3330a]">{errors.labTests.message}</p>}
      {errors?.labTests?.root?.message && <p role="alert" className="text-sm text-[#a3330a]">{errors.labTests.root.message}</p>}

      <Button variant="secondary" onClick={() => append({ ...emptyLabTest })} disabled={fields.length >= MAX_TESTS}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Add another test
      </Button>
    </div>
  );
}
