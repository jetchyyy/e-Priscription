import { useFieldArray } from 'react-hook-form';
import { Pill, Plus, Trash2 } from 'lucide-react';
import { Input, Select, Textarea } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { DOSAGE_FORMS, DURATION_CHIPS, FREQUENCY_CHIPS, FREQUENCY_SUGGESTIONS, emptyMedicine } from '../schemas';
import { buildSig } from '../../../lib/utils';

/** One-tap values for a text field. Tapping sets the field; typing still works. */
function QuickChips({ label, options, value, onPick }) {
  const current = (value ?? '').trim().toLowerCase();
  return (
    <div role="group" aria-label={label} className="mt-2 flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = current === opt.toLowerCase();
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(opt)}
            className={on
              ? 'min-h-[36px] rounded-full border border-[#ff6f07] bg-[#fff3ea] px-3 py-1.5 text-sm font-semibold text-[#b8470a]'
              : 'min-h-[36px] rounded-full border border-[#dce1e8] bg-white px-3 py-1.5 text-sm text-[#152839] hover:bg-[#f9f8f3]'}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/** Repeatable medicine rows (Generic name, Brand, Strength, Form, Disp, Sig parts). */
export function MedicineFields({ control, register, errors, watch, setValue }) {
  const pick = (name, value) => setValue?.(name, value, { shouldValidate: true, shouldDirty: true });
  const { fields, append, remove } = useFieldArray({ control, name: 'medicines' });
  const rowErr = (i, k) => errors?.medicines?.[i]?.[k]?.message;

  return (
    <div className="space-y-4">
      <datalist id="frequency-options">
        {FREQUENCY_SUGGESTIONS.map((f) => <option key={f} value={f} />)}
      </datalist>

      {fields.map((field, i) => {
        const preview = buildSig(watch(`medicines.${i}`));
        return (
          <fieldset key={field.id} className="rounded-2xl bg-ink-50/70 p-4 ring-1 ring-ink-100 sm:p-5">
            <legend className="sr-only">Medicine {i + 1}</legend>
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 font-display text-base font-semibold text-[#152839]">
                <Pill className="h-4 w-4 text-[#ff6f07]" aria-hidden="true" /> Medicine {i + 1}
              </p>
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Remove medicine ${i + 1}`}
                  className="text-sm font-medium text-[#a3330a] hover:underline"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <Input wrapperClassName="lg:col-span-3" label="Generic name" required placeholder="e.g. Amoxicillin"
                error={rowErr(i, 'genericName')} {...register(`medicines.${i}.genericName`)} />
              <Input wrapperClassName="lg:col-span-3" label="Brand name (optional)" placeholder="e.g. Amoxil"
                error={rowErr(i, 'brandName')} {...register(`medicines.${i}.brandName`)} />
              <Input wrapperClassName="lg:col-span-2" label="Strength" required placeholder="e.g. 500 mg"
                error={rowErr(i, 'strength')} {...register(`medicines.${i}.strength`)} />
              <Select wrapperClassName="lg:col-span-2" label="Form" required
                error={rowErr(i, 'form')} {...register(`medicines.${i}.form`)}>
                {DOSAGE_FORMS.map((f) => <option key={f} value={f}>{f}</option>)}
              </Select>
              <Input wrapperClassName="lg:col-span-2" label="Disp. (quantity)" required placeholder="e.g. 21"
                inputMode="numeric" error={rowErr(i, 'quantity')} {...register(`medicines.${i}.quantity`)} />
              <Input wrapperClassName="lg:col-span-2" label="Dose per intake" required placeholder="e.g. 1 capsule"
                error={rowErr(i, 'dose')} {...register(`medicines.${i}.dose`)} />
              <div className="sm:col-span-2 lg:col-span-4">
                <Input label="Frequency" required list="frequency-options" placeholder="e.g. three times a day"
                  error={rowErr(i, 'frequency')} {...register(`medicines.${i}.frequency`)} />
                <QuickChips label={`Frequency for medicine ${i + 1}`} options={FREQUENCY_CHIPS}
                  value={watch(`medicines.${i}.frequency`)} onPick={(v) => pick(`medicines.${i}.frequency`, v)} />
              </div>
              <div className="sm:col-span-2 lg:col-span-6">
                <Input label="Duration" required placeholder="e.g. 7 days"
                  error={rowErr(i, 'duration')} {...register(`medicines.${i}.duration`)} />
                <QuickChips label={`Duration for medicine ${i + 1}`} options={DURATION_CHIPS}
                  value={watch(`medicines.${i}.duration`)} onPick={(v) => pick(`medicines.${i}.duration`, v)} />
              </div>
              <Textarea wrapperClassName="sm:col-span-2 lg:col-span-6" rows={2} label="Special instructions (optional)"
                placeholder="e.g. Take after meals. Complete the full course."
                error={rowErr(i, 'instructions')} {...register(`medicines.${i}.instructions`)} />
            </div>

            {preview && (
              <p className="mt-3 rounded-xl border border-[#dce1e8] bg-white px-3.5 py-2 text-sm text-[#152839]">
                <span className="font-semibold text-[#152839]">Sig:</span> {preview}
              </p>
            )}
          </fieldset>
        );
      })}

      {errors?.medicines?.message && <p role="alert" className="text-sm text-[#a3330a]">{errors.medicines.message}</p>}
      {errors?.medicines?.root?.message && <p role="alert" className="text-sm text-[#a3330a]">{errors.medicines.root.message}</p>}

      <Button variant="secondary" onClick={() => append({ ...emptyMedicine })} disabled={fields.length >= 15}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Add medicine
      </Button>
    </div>
  );
}
