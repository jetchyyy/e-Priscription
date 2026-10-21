import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { createPlatformMethod, deletePlatformMethod, fetchPlatformMethods, togglePlatformMethod } from '../api';

const KEY = ['admin', 'platform-methods'];

function AddQrModal({ open, onClose }) {
  const qc = useQueryClient();
  const [provider, setProvider] = useState('GCash');
  const [accountName, setAccountName] = useState('Odysseyph IT Solutions');
  const [accountNumber, setAccountNumber] = useState('');
  const [file, setFile] = useState(null);

  const add = useMutation({
    mutationFn: () => createPlatformMethod({ provider, accountName, accountNumber, file }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['platform-payment-methods'] });
      toast.success('Payment QR added. Doctors see it when they upgrade.');
      setFile(null); setAccountNumber('');
      onClose();
    },
    onError: (e) => toast.error(e?.message || 'Could not add the QR.'),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!file) return toast.error('Add the QR image.');
    if (file.size > 5 * 1024 * 1024) return toast.error('The image must be 5 MB or smaller.');
    add.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title="Add ODYSSEY payment QR" description="Doctors scan this to pay for a plan.">
      <form onSubmit={submit} className="space-y-4 pt-2">
        <Input label="Bank or e-wallet" required value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="GCash, Maya, BDO…" />
        <Input label="Account name" required value={accountName} onChange={(e) => setAccountName(e.target.value)} />
        <Input label="Account or mobile number (optional)" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} hint="Doctors can copy it if scanning fails." />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-[#152839]">QR image <span className="text-[#b8470a]" aria-hidden="true">*</span></span>
          <label htmlFor="pqr-file" className="flex min-h-[110px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-[#c8d0db] bg-white p-4 text-center hover:border-[#152839]">
            <ImagePlus className="h-6 w-6 text-[#152839]" aria-hidden="true" />
            <span className="font-semibold text-[#152839]">{file ? file.name : 'Choose the QR image'}</span>
            <span className="text-sm text-[#5f6a7c]">JPG, PNG or WebP, up to 5 MB</span>
          </label>
          <input id="pqr-file" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={add.isPending}>Save QR</Button>
        </div>
      </form>
    </Modal>
  );
}

/** The QR codes doctors pay ODYSSEY with. Only shown ones appear in the doctors' checkout. */
export function PlatformQrs() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: fetchPlatformMethods });
  const refresh = () => { qc.invalidateQueries({ queryKey: KEY }); qc.invalidateQueries({ queryKey: ['platform-payment-methods'] }); };
  const toggle = useMutation({ mutationFn: ({ id, on }) => togglePlatformMethod(id, on), onSuccess: refresh, onError: (e) => toast.error(e?.message || 'Could not update.') });
  const remove = useMutation({ mutationFn: deletePlatformMethod, onSuccess: () => { refresh(); toast.success('QR removed'); }, onError: (e) => toast.error(e?.message || 'Could not remove.') });

  return (
    <section aria-labelledby="pq-h" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="pq-h" className="font-display text-xl font-semibold text-[#152839]">ODYSSEY payment QRs</h2>
          <p className="text-sm text-[#45546a]">Where doctors pay for their plan. Check each payment in this account before approving it.</p>
        </div>
        <Button variant="accent" onClick={() => setAdding(true)}>Add payment QR</Button>
      </div>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-[20px] bg-[#ece7de]" />
      ) : isError ? (
        <div role="alert" className="rounded-[18px] bg-[#fbe9e1] p-4 text-sm text-[#7a2406]">
          Could not load payment QRs. <button className="ml-1 font-semibold underline" onClick={() => refetch()}>Try again</button>
        </div>
      ) : !data.length ? (
        <p className="rounded-[20px] border border-[#dce1e8] bg-white p-6 text-sm text-[#5f6a7c]">
          No payment QR yet. Until you add one, doctors are asked to email ODYSSEY to upgrade.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((m) => (
            <li key={m.id} className="flex flex-col gap-3 rounded-[20px] border border-[#dce1e8] bg-white p-5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-[#152839]">{m.provider}</span>
                <label className="flex items-center gap-2 text-xs text-[#45546a]">
                  <input type="checkbox" className="h-4 w-4 accent-[#152839]" checked={m.is_active} onChange={() => toggle.mutate({ id: m.id, on: !m.is_active })} />
                  Shown to doctors
                </label>
              </div>
              <div className="flex justify-center rounded-2xl bg-[#f9f8f3] p-3">
                <img src={m.qr_image_url} alt={`${m.provider} QR`} className="max-h-40 object-contain" />
              </div>
              <div className="text-sm">
                <p className="font-semibold text-[#152839]">{m.account_name}</p>
                {m.account_number && <p className="tabular-nums text-[#45546a]">{m.account_number}</p>}
              </div>
              <button
                type="button"
                className="self-start text-sm font-medium text-[#a3330a] hover:underline"
                onClick={() => window.confirm(`Remove the ${m.provider} QR?`) && remove.mutate(m.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <AddQrModal open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}
