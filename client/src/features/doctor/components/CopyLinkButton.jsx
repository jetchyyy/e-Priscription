import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/Button';

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('copy failed');
  return undefined;
}

export function CopyLinkButton({ link, size = 'sm', variant = 'secondary', label = 'Copy link', className }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await copyText(link);
      setCopied(true);
      toast.success('Prescription link copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Long-press the link to copy it manually.');
    }
  };

  return (
    <Button variant={variant} size={size} onClick={onCopy} className={className} aria-label={copied ? 'Link copied' : label}>
      {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

/** Native share sheet on phones; renders nothing where unsupported. */
export function ShareLinkButton({ link, title = 'Your E-Reseta prescription', size = 'md', className }) {
  if (typeof navigator === 'undefined' || !navigator.share) return null;
  const onShare = async () => {
    try {
      await navigator.share({
        title,
        text: 'Here is your prescription. Open the link to view it securely.',
        url: link,
      });
    } catch (e) {
      if (e?.name !== 'AbortError') toast.error('Sharing failed. Use Copy link instead.');
    }
  };
  return (
    <Button variant="secondary" size={size} onClick={onShare} className={className}>
      <Share2 className="h-4 w-4" aria-hidden="true" /> Share
    </Button>
  );
}
