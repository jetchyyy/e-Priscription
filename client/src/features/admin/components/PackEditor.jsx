import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { formatPeso } from '../../../lib/utils';
import { packsQuery, perRx } from '../../billing/api';
import { savePack } from '../api';

const toForm = (p) => ({
  id: p.id,
  name: p.name,
  rx: String(p.rx),
  price: String(p.price),
  validDays: p.validDays == null ? '' : String(p.validDays),
  sortOrder: String(p.sortOrder ?? 0),
  isPublic: p.isPublic !== false,
});

const BLANK = { id: '', name: '', rx: '', price: '', validDays: '90', sortOrder: '40', isPublic: false };

function PackForm({ initial, isNew = false, onDone }) {
  const qc = useQueryClient();
  const [f, setF] = useState(initial);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const each = Number(f.rx) > 0 && Number(f.price) > 0 ? Number(f.price) / Number(f.rx) : null;

  const save = useMutation({
    mutationFn: () => savePack({ ...f }, { isNew }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: packsQuery.queryKey });
      toast.success(`${f.name} saved. New orders use these numbers; payments already sent keep what was shown.`);
      onDone?.();
    },
    onError: (e) => toast.error(e?.message || 'Could not save the pack.'),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4 rounded-[20px] border border-[#dce1e8] bg-white p-5 sm:p-6">
      <h3 className="font-display text-lg font-semibold text-[#152839]">{isNew ? 'New pack' : f.name}</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isNew && <Input label="Pack code" required value={f.id} onChange={set('id')} placeholder="e.g. pack-500" hint="Lowercase letters, numbers and dashes. Cannot change later." />}
        <Input label="Name" required maxLength={40} value={f.name} onChange={set('name')} />
        <Input label="Prescriptions in the pack" required type="number" min="1" value={f.rx} onChange={set('rx')} />
        <Input label="Price (₱)" required type="number" min="1" step="0.01" value={f.price} onChange={set('price')} hint={each ? `About ${formatPeso(each)} each` : undefined} />
        <Input label="Valid for (days)" type="number" min="1" value={f.validDays} onChange={set('validDays')} hint="Leave empty if it never expires." />
        <Input label="Order on the page" type="number" value={f.sortOrder} onChange={set('sortOrder')} />
      </div>
      <label className="flex items-center gap-2 text-[15px] text-[#152839]">
        <input type="checkbox" className="h-4 w-4 accent-[#152839]" checked={f.isPublic} onChange={set('isPublic')} />
        On sale to doctors
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ece7de] pt-4">
        <p className="text-sm text-[#45546a]">
          {isNew ? 'A new pack starts hidden until you tick the box above.' : 'Doctors who already paid get the number of prescriptions they ordered.'}
        </p>
        <div className="flex gap-2">
          {isNew && <Button variant="ghost" onClick={onDone}>Cancel</Button>}
          <Button type="submit" loading={save.isPending} disabled={!isNew && !dirty}>Save {isNew ? 'pack' : 'changes'}</Button>
        </div>
      </div>
    </form>
  );
}

/** Packs of extra prescriptions doctors can buy without changing plan. */
export function PackEditor() {
  const [adding, setAdding] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery(packsQuery);

  return (
    <section aria-labelledby="pk-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="pk-h" className="font-display text-xl font-semibold text-[#152839]">Prescription packs</h2>
          <p className="text-sm text-[#45546a]">
            Doctors and clinics buy these without upgrading. They are used after the monthly limit runs out. Price them above your plans’ per-prescription price so upgrading stays the better deal.
          </p>
        </div>
        {!adding && <Button variant="secondary" onClick={() => setAdding(true)}>Add a pack</Button>}
      </div>
      {adding && <PackForm initial={BLANK} isNew onDone={() => setAdding(false)} />}
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-[20px] bg-[#ece7de]" />
      ) : isError ? (
        <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
          Could not load the packs. Has migration 0008 been applied? <button className="ml-1 font-semibold underline" onClick={() => refetch()}>Try again</button>
        </div>
      ) : (
        data.map((p) => {
          const initial = toForm(p);
          return <PackForm key={`${p.id}-${JSON.stringify(initial)}`} initial={initial} />;
        })
      )}
    </section>
  );
}
