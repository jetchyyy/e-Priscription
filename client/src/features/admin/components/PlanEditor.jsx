import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input, Textarea } from '../../../components/ui/Input';
import { plansQuery } from '../../billing/api';
import { savePlan } from '../api';

const toForm = (p) => ({
  id: p.id,
  name: p.name,
  who: p.who ?? '',
  monthly: String(p.monthly),
  yearly: p.yearly === p.monthly * 10 ? '' : String(p.yearly),
  rxLimit: String(p.rxLimit),
  qrLimit: String(p.qrLimit),
  doctors: String(p.doctors ?? 1),
  extraDoctor: p.extraDoctor == null ? '' : String(p.extraDoctor),
  linesText: (p.lines ?? []).join('\n'),
  cta: p.cta ?? '',
  sortOrder: String(p.sortOrder ?? 0),
  isPublic: p.isPublic !== false,
  isDefault: Boolean(p.isDefault),
});

const BLANK = {
  id: '', name: '', who: '', monthly: '', yearly: '', rxLimit: '', qrLimit: '1', doctors: '1', extraDoctor: '',
  linesText: '', cta: '', sortOrder: '40', isPublic: false, isDefault: false,
};

function PlanForm({ initial, isNew = false, onDone }) {
  const qc = useQueryClient();
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);

  const save = useMutation({
    mutationFn: () => savePlan({ ...f, lines: f.linesText.split('\n') }, { isNew }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: plansQuery.queryKey });
      qc.invalidateQueries({ queryKey: ['admin', 'doctor-plans'] });
      toast.success(`${f.name} saved. The new limits apply now.`);
      onDone?.();
    },
    onError: (e) => toast.error(e?.message || 'Could not save the plan.'),
  });

  const yearlyHint = f.monthly ? `Leave empty for ₱${(Number(f.monthly) * 10).toLocaleString('en-PH')} (10 months)` : 'Leave empty for 10 × monthly';

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-semibold text-[#152839]">{isNew ? 'New plan' : f.name}</h3>
        {f.isDefault && <span className="rounded-full bg-[#ece7de] px-3 py-1 text-xs font-semibold text-[#152839]">Free plan everyone falls back to</span>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isNew && <Input label="Plan code" required value={f.id} onChange={set('id')} placeholder="e.g. hospital" hint="Lowercase letters, numbers and dashes. Cannot change later." />}
        <Input label="Name" required maxLength={40} value={f.name} onChange={set('name')} />
        <Input label="Prescriptions a month" required type="number" min="0" value={f.rxLimit} onChange={set('rxLimit')} />
        <Input label="Active payment QRs" required type="number" min="0" max="100" value={f.qrLimit} onChange={set('qrLimit')} />
        <Input label="Monthly price (₱)" required type="number" min="0" step="0.01" value={f.monthly} onChange={set('monthly')} disabled={f.isDefault} hint={f.isDefault ? 'The fallback plan is always free.' : undefined} />
        <Input label="Yearly price (₱)" type="number" min="0" step="0.01" value={f.yearly} onChange={set('yearly')} disabled={f.isDefault} hint={f.isDefault ? undefined : yearlyHint} />
        <Input label="Doctors included" type="number" min="1" value={f.doctors} onChange={set('doctors')} />
        <Input label="Price per extra doctor (₱)" type="number" min="0" step="0.01" value={f.extraDoctor} onChange={set('extraDoctor')} hint="Shown on the pricing page only." />
        <Input label="Order on the page" type="number" value={f.sortOrder} onChange={set('sortOrder')} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Input label="Who it is for" maxLength={200} value={f.who} onChange={set('who')} />
        <Input label="Button text" maxLength={40} value={f.cta} onChange={set('cta')} placeholder={`Choose ${f.name || 'plan'}`} />
      </div>
      <Textarea label="Lines on the pricing card, one per line" rows={4} value={f.linesText} onChange={set('linesText')} hint="Up to 12 lines. The prescription limit is shown above them automatically." />
      <label className="flex items-center gap-2 text-[15px] text-[#152839]">
        <input type="checkbox" className="h-4 w-4 accent-[#152839]" checked={f.isPublic} onChange={set('isPublic')} disabled={f.isDefault} />
        Show on the pricing page and to doctors
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ece7de] pt-4">
        <p className="text-sm text-[#45546a]">
          {isNew ? 'A new plan starts hidden until you tick the box above.' : 'Saving changes the limit for every doctor on this plan right away.'}
        </p>
        <div className="flex gap-2">
          {isNew && <Button variant="ghost" onClick={onDone}>Cancel</Button>}
          <Button type="submit" loading={save.isPending} disabled={!isNew && !dirty}>Save {isNew ? 'plan' : 'changes'}</Button>
        </div>
      </div>
    </form>
  );
}

/** Plans, prices and limits. The pricing page, the doctors' limits and the checkout all read these. */
export function PlanEditor({ plans }) {
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby="pe-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="pe-h" className="font-display text-xl font-semibold text-[#152839]">Plans and limits</h2>
          <p className="text-sm text-[#45546a]">Prices are in pesos, VAT included. A doctor already paid keeps their period; the new limit applies to them at once.</p>
        </div>
        {!adding && <Button variant="secondary" onClick={() => setAdding(true)}>Add a plan</Button>}
      </div>
      {adding && <PlanForm initial={BLANK} isNew onDone={() => setAdding(false)} />}
      {plans.map((p) => {
        const initial = toForm(p);
        return <PlanForm key={`${p.id}-${JSON.stringify(initial)}`} initial={initial} />;
      })}
    </section>
  );
}
