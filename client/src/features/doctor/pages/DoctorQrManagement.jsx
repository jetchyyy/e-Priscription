import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Check,
  Copy,
  Eye,
  FileUp,
  Plus,
  QrCode,
  Smartphone,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, EmptyState } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Spinner } from '../../../components/ui/Spinner';
import { useAuthStore } from '../../../store/authStore';
import { Ody } from '../../marketing/components';
import {
  fetchMyPaymentMethods,
  createPaymentMethod,
  togglePaymentMethod,
  deletePaymentMethod,
} from '../api';

const PROVIDERS = [
  { name: 'GCash', type: 'wallet', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { name: 'Maya', type: 'wallet', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { name: 'BDO Unibank', type: 'bank', color: 'bg-sky-50 text-sky-800 border-sky-200' },
  { name: 'BPI', type: 'bank', color: 'bg-red-50 text-red-700 border-red-200' },
  { name: 'UnionBank', type: 'bank', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  { name: 'Metrobank', type: 'bank', color: 'bg-blue-50 text-blue-900 border-blue-200' },
  { name: 'Landbank', type: 'bank', color: 'bg-green-50 text-green-800 border-green-200' },
  { name: 'RCBC', type: 'bank', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { name: 'Security Bank', type: 'bank', color: 'bg-teal-50 text-teal-800 border-teal-200' },
  { name: 'SeaBank', type: 'bank', color: 'bg-orange-50 text-orange-700 border-orange-200' },
  { name: 'GoTyme Bank', type: 'bank', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { name: 'Other Bank / E-Wallet', type: 'other', color: 'bg-ink-50 text-ink-700 border-ink-200' },
];

export default function DoctorQrManagement() {
  const qc = useQueryClient();
  const profile = useAuthStore((s) => s.profile);

  const [modalOpen, setModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  // Form State
  const [provider, setProvider] = useState('GCash');
  const [accountName, setAccountName] = useState(profile?.full_name ?? '');
  const [accountNumber, setAccountNumber] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState('');

  // Queries & Mutations
  const { data: items, isLoading, isError, refetch } = useQuery({
    queryKey: ['doctor', 'payment-methods'],
    queryFn: fetchMyPaymentMethods,
  });

  const addMutation = useMutation({
    mutationFn: createPaymentMethod,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctor', 'payment-methods'] });
      toast.success('Payment QR code added successfully!');
      handleCloseModal();
    },
    onError: (err) => {
      toast.error(err?.message || 'Failed to add payment method.');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }) => togglePaymentMethod(id, isActive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctor', 'payment-methods'] });
      toast.success('Status updated');
    },
    onError: (err) => toast.error(err?.message || 'Could not update status.'),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePaymentMethod,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doctor', 'payment-methods'] });
      toast.success('Payment method removed');
    },
    onError: () => toast.error('Could not delete payment method.'),
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be 5 MB or smaller.');
      return;
    }
    setSelectedFile(file);
    setFilePreview(URL.createObjectURL(file));
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setProvider('GCash');
    setAccountName(profile?.full_name ?? '');
    setAccountNumber('');
    setSelectedFile(null);
    setFilePreview('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Please upload your bank QR code image.');
      return;
    }
    if (!accountName.trim()) {
      toast.error('Please enter the account name.');
      return;
    }
    addMutation.mutate({
      provider,
      accountName,
      accountNumber,
      file: selectedFile,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] font-bold text-[#152839]">Payment QR codes</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#45546a]">
            Add your GCash, Maya, or bank QR codes. Patients pay the access fee directly to your QR before the prescription opens.
          </p>
        </div>
        <div data-tour="qr-add">
          <Button variant="accent" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" /> Add payment QR
          </Button>
        </div>
      </div>

      {/* Main List */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner label="Loading payment methods…" />
        </div>
      ) : isError ? (
        <div className="rounded-[20px] border border-[#f3c2af] bg-[#fbe9e1] p-6 text-center text-sm text-[#7a2406]">
          <p>Could not load payment methods.</p>
          <Button variant="ghost" onClick={() => refetch()} className="mt-2 text-[#7a2406]">
            Try again
          </Button>
        </div>
      ) : items?.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[20px] border border-[#dce1e8] bg-white p-12 text-center">
          <Ody mood="happy" alt="Ody mascot" className="w-28 mb-4" />
          <h3 className="font-display text-lg font-semibold text-[#152839]">
            No payment QR yet. Add your GCash, Maya or bank QR so patients can pay you.
          </h3>
          <p className="mt-1.5 max-w-sm text-sm text-[#45546a]">
            Patients scan your QR code using GCash, Maya, or any bank app to unlock their prescription.
          </p>
          <div className="mt-5" data-tour="qr-add">
            <Button variant="accent" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" /> Add payment QR
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => {
            const masked = item.account_number
              ? item.account_number.length > 4
                ? `•••• ${item.account_number.slice(-4)}`
                : item.account_number
              : null;

            return (
              <div
                key={item.id}
                className="rounded-[20px] border border-[#dce1e8] bg-white p-5 flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-base font-bold text-[#152839]">
                      {item.provider}
                    </span>

                    {/* Switch: Shown to patients (data-tour="qr-switch" on first item) */}
                    <div
                      data-tour={index === 0 ? 'qr-switch' : undefined}
                      className="flex items-center gap-2"
                    >
                      <label className="text-xs text-[#5f6a7c] cursor-pointer" htmlFor={`switch-${item.id}`}>
                        Shown to patients
                      </label>
                      <button
                        id={`switch-${item.id}`}
                        type="button"
                        role="switch"
                        aria-checked={item.is_active}
                        onClick={() =>
                          toggleMutation.mutate({ id: item.id, isActive: !item.is_active })
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          item.is_active ? 'bg-[#ff6f07]' : 'bg-[#dce1e8]'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            item.is_active ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* QR Image Display on a clean white square with mist border */}
                  <div
                    onClick={() => setPreviewImage(item.qr_image_url)}
                    className="cursor-pointer flex items-center justify-center rounded-2xl border border-[#dce1e8] bg-[#f9f8f3] p-4 transition hover:border-[#152839]"
                  >
                    <img
                      src={item.qr_image_url}
                      alt={`${item.provider} QR code`}
                      className="max-h-44 object-contain"
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-xs text-[#5f6a7c]">Account Name</p>
                    <p className="font-semibold text-sm text-[#152839]">{item.account_name}</p>
                    {masked && (
                      <p className="text-xs font-mono text-[#5f6a7c]">{masked}</p>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#dce1e8] flex items-center justify-between">
                  <span className="text-xs text-[#5f6a7c]">
                    {item.is_active ? 'Active on prescriptions' : 'Hidden from patients'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Remove ${item.provider} QR code?`)) {
                        deleteMutation.mutate(item.id);
                      }
                    }}
                    className="text-xs font-medium text-[#a3330a] hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add QR Modal */}
      <Modal
        open={modalOpen}
        onClose={handleCloseModal}
        title="Add Bank / E-Wallet QR Code"
        description="Patients will scan this QR code when paying for their prescription."
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Select
            label="Bank / E-Wallet Provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            required
          >
            {PROVIDERS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </Select>

          <Input
            label="Account Name (as registered in bank)"
            required
            placeholder="Dr. Juan Dela Cruz"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />

          <Input
            label="Account Number or Mobile (Optional)"
            placeholder="e.g. 0917 123 4567 or 1234-5678-90"
            hint="Patients can copy this if scanning fails"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />

          {/* QR Image File Input */}
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink-700">
              QR Code Image <span className="text-rose-500">*</span>
            </label>

            {filePreview ? (
              <div className="relative flex flex-col items-center rounded-2xl border border-ink-200 bg-ink-50 p-4">
                <img
                  src={filePreview}
                  alt="QR Preview"
                  className="max-h-48 rounded-xl object-contain shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setFilePreview('');
                  }}
                  className="absolute right-3 top-3 rounded-full bg-white p-1 text-ink-500 shadow ring-1 ring-ink-200 hover:text-rose-600"
                >
                  <X className="h-4 w-4" />
                </button>
                <p className="mt-2 text-xs font-medium text-ink-600">{selectedFile?.name}</p>
              </div>
            ) : (
              <label
                htmlFor="qr-file-input"
                className="flex min-h-[7.5rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-300 bg-ink-50/60 p-4 text-center transition hover:border-brand-400 hover:bg-brand-50/40"
              >
                <FileUp className="h-6 w-6 text-brand-600" />
                <span className="text-sm font-medium text-ink-800">
                  Upload screenshot or photo of your QR code
                </span>
                <span className="text-xs text-ink-500">JPG, PNG, or WebP · up to 5 MB</span>
                <input
                  id="qr-file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={handleFileChange}
                />
              </label>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button variant="ghost" type="button" onClick={handleCloseModal}>
              Cancel
            </Button>
            <Button type="submit" loading={addMutation.isPending}>
              Save QR Code
            </Button>
          </div>
        </form>
      </Modal>

      {/* Enlarged Image Preview Modal */}
      <Modal
        open={Boolean(previewImage)}
        onClose={() => setPreviewImage(null)}
        title="Payment QR Code Preview"
        size="md"
      >
        <div className="flex flex-col items-center justify-center p-4">
          <img
            src={previewImage}
            alt="Enlarged QR Code"
            className="max-h-[70vh] rounded-2xl object-contain shadow-card"
          />
        </div>
      </Modal>
    </div>
  );
}
