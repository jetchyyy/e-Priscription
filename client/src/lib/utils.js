import { env } from '../config/env';

export const cn = (...classes) => classes.flat(Infinity).filter(Boolean).join(' ');

/** 21-char URL-safe prescription id (matches nanoid_21() in the database). */
export const RX_ID_PATTERN = /^[A-Za-z0-9_-]{21}$/;

export const rxLink = (id) => `${env.appUrl}/rx/${id}`;

/** Accepts a full /rx/<id> link or a bare id and returns the id (or null). */
export function extractRxId(input = '') {
  const m = String(input).trim().match(/([A-Za-z0-9_-]{21})\/?(?:[?#].*)?$/);
  return m ? m[1] : null;
}

export const formatPeso = (n) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(n) || 0);

const DATE_OPTS = { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' };
export const formatDate = (d, opts = DATE_OPTS) =>
  d ? new Intl.DateTimeFormat('en-PH', opts).format(new Date(d)) : '—';

export const formatShortDate = (d) =>
  formatDate(d, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });

export const formatDateTime = (d) =>
  d
    ? new Intl.DateTimeFormat('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila',
      }).format(new Date(d))
    : '—';

/** Age in whole years from a YYYY-MM-DD date of birth. */
export function computeAge(dob, now = new Date()) {
  if (!dob) return null;
  const [y, m, d] = String(dob).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  let age = now.getFullYear() - y;
  const monthDiff = now.getMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d)) age -= 1;
  return age < 0 ? null : age;
}

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Builds the "Sig:" line that appears under each medicine on a Philippine Rx. */
export function buildSig(m = {}) {
  const head = [m.dose && `take ${m.dose}`, m.frequency, m.duration && `for ${m.duration}`]
    .filter(Boolean)
    .join(' ');
  const parts = [];
  if (head) parts.push(`${capitalize(head)}.`);
  if (m.instructions?.trim()) {
    const extra = m.instructions.trim();
    parts.push(/[.!?]$/.test(extra) ? capitalize(extra) : `${capitalize(extra)}.`);
  }
  return parts.join(' ');
}

export function doctorTitle(name = '') {
  return /^dr\.?\s/i.test(name.trim()) ? name.trim() : `Dr. ${name.trim()}`;
}

export function maskName(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w[0]}***`)
    .join(' ');
}

export function fileExtension(path) {
  if (!path || typeof path !== 'string') return '';
  return path.split('.').pop()?.toLowerCase() ?? '';
}
