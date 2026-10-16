import { useFieldArray } from 'react-hook-form';
import { Pill, Plus, Trash2 } from 'lucide-react';
import { Input, Select, Textarea } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { DOSAGE_FORMS, FREQUENCY_SUGGESTIONS, emptyMedicine } from '../schemas';
import { buildSig } from '../../../lib/utils';

/** Repeatable medicine rows (Generic name, Brand, Strength, Form, Disp, Sig parts). */
export function MedicineFields({ control, register, errors, watch }) {
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
              <p className="flex items-center gap-2 font-rx text-lg font-bold text-brand-700">
                <Pill className="h-4 w-4" aria-hidden="true" /> ℞ {i + 1}
              </p>
              {fields.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => remove(i)} aria-label={`Remove medicine ${i + 1}`} className="text-rose-600 hover:bg-rose-50">
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove
                </Button>
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
              <Input wrapperClassName="lg:col-span-2" label="Frequency" required list="frequency-options" placeholder="e.g. three times a day"
                error={rowErr(i, 'frequency')} {...register(`medicines.${i}.frequency`)} />
              <Input wrapperClassName="lg:col-span-2" label="Duration" required placeholder="e.g. 7 days"
                error={rowErr(i, 'duration')} {...register(`medicines.${i}.duration`)} />
              <Textarea wrapperClassName="sm:col-span-2 lg:col-span-6" rows={2} label="Special instructions (optional)"
                placeholder="e.g. Take after meals. Complete the full course."
                error={rowErr(i, 'instructions')} {...register(`medicines.${i}.instructions`)} />
            </div>

            {preview && (
              <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm text-ink-600 ring-1 ring-ink-100">
                <span className="font-semibold italic text-brand-700">Sig:</span> {preview}
              </p>
            )}
          </fieldset>
        );
      })}

      {errors?.medicines?.message && <p role="alert" className="text-sm text-rose-600">{errors.medicines.message}</p>}
      {errors?.medicines?.root?.message && <p role="alert" className="text-sm text-rose-600">{errors.medicines.root.message}</p>}

      <Button variant="secondary" onClick={() => append({ ...emptyMedicine })} disabled={fields.length >= 15}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Add another medicine
      </Button>
    </div>
  );
}
