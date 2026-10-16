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
    onError: () => toast.error('Could not update status.'),
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
          <h1 className="text-2xl font-semibold text-ink-900 sm:text-3xl">Payment QR Codes</h1>
          <p className="mt-1 max-w-2xl text-ink-600">
            Add your bank and e-wallet QR codes (GCash, Maya, BDO, BPI, etc.). Patients can choose and scan any of
            your active QR codes when paying for their prescription.
          </p>
        </div>
        <Button size="lg" onClick={() => setModalOpen(true)}>
          <Plus className="h-5 w-5" /> Add Bank / E-Wallet QR
        </Button>
      </div>

      {/* Main List */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner label="Loading your payment methods..." />
        </div>
      ) : isError ? (
        <Card className="text-center">
          <p className="text-rose-600">Could not load payment methods.</p>
          <Button variant="ghost" onClick={() => refetch()} className="mt-2">
            Try again
          </Button>
        </Card>
      ) : items?.length === 0 ? (
        <EmptyState
          icon={QrCode}
          title="No payment QR codes added yet"
          description="Upload your GCash, Maya, or Bank QR codes so patients can pay you directly."
          action={
            <Button onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" /> Add your first QR code
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const provMeta = PROVIDERS.find((p) => p.name === item.provider) ?? {
              color: 'bg-ink-50 text-ink-700 border-ink-200',
            };
            return (
              <Card key={item.id} className="flex flex-col justify-between overflow-hidden !p-0">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${provMeta.color}`}
                    >
                      {provMeta.type === 'wallet' ? (
                        <Smartphone className="h-3.5 w-3.5" />
                      ) : (
                        <Building2 className="h-3.5 w-3.5" />
                      )}
                      {item.provider}
                    </span>

                    {/* Active Status Badge / Switch */}
                    <button
                      type="button"
                      onClick={() =>
                        toggleMutation.mutate({ id: item.id, isActive: !item.is_active })
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                        item.is_active
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100'
                          : 'bg-ink-100 text-ink-500 hover:bg-ink-200'
                      }`}
                      title={item.is_active ? 'Click to deactivate' : 'Click to activate'}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          item.is_active ? 'bg-emerald-500' : 'bg-ink-400'
                        }`}
                      />
                      {item.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>

                  {/* QR Image Display */}
                  <div
                    onClick={() => setPreviewImage(item.qr_image_url)}
                    className="group relative my-4 flex cursor-pointer items-center justify-center rounded-2xl bg-ink-50 p-3 ring-1 ring-ink-100 transition hover:ring-brand-400"
                  >
                    <img
                      src={item.qr_image_url}
                      alt={`${item.provider} QR code`}
                      className="max-h-48 rounded-xl object-contain shadow-sm"
                    />
                    <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-ink-900/40 opacity-0 backdrop-blur-[2px] transition group-hover:opacity-100">
                      <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-900 shadow">
                        <Eye className="h-3.5 w-3.5" /> Click to enlarge
                      </span>
                    </div>
                  </div>

                  {/* Account Details */}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                      Account Name
                    </p>
                    <p className="font-semibold text-ink-900">{item.account_name}</p>

                    {item.account_number && (
                      <div className="pt-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                          Account / Mobile No.
                        </p>
                        <div className="mt-0.5 flex items-center justify-between rounded-lg bg-ink-50 px-2.5 py-1 text-xs font-mono text-ink-800">
                          <span>{item.account_number}</span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(item.account_number);
                              toast.success('Account number copied!');
                            }}
                            className="text-ink-400 hover:text-brand-600"
                            title="Copy number"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between border-t border-ink-100 bg-ink-50/50 px-5 py-3">
                  <span className="text-xs text-ink-500">
                    {item.is_active ? 'Displayed to patients' : 'Hidden from patients'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => {
                      if (confirm(`Remove this ${item.provider} QR code?`)) {
                        deleteMutation.mutate(item.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              </Card>
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
