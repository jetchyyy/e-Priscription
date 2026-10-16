import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const control =
  'block w-full rounded-xl border bg-white px-3.5 min-h-11 text-[15px] text-ink-900 placeholder:text-ink-400 ' +
  'transition focus:outline-none focus:ring-4 focus:ring-brand-500/15 focus:border-brand-500 disabled:bg-ink-50 disabled:text-ink-500';

function Field({ id, label, error, hint, required, className, children }) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
          {label}
          {required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-rose-600">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

const ariaProps = (id, error, hint) => ({
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-err` : hint ? `${id}-hint` : undefined,
});

export const Input = forwardRef(function Input(
  { label, error, hint, id, required, className, wrapperClassName, ...props }, ref,
) {
  const auto = useId();
  const _id = id ?? auto;
  return (
    <Field id={_id} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <input
        ref={ref}
        id={_id}
        required={required}
        className={cn(control, error ? 'border-rose-400' : 'border-ink-200', className)}
        {...ariaProps(_id, error, hint)}
        {...props}
      />
    </Field>
  );
});

export const Textarea = forwardRef(function Textarea(
  { label, error, hint, id, required, className, wrapperClassName, rows = 3, ...props }, ref,
) {
  const auto = useId();
  const _id = id ?? auto;
  return (
    <Field id={_id} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <textarea
        ref={ref}
        id={_id}
        rows={rows}
        className={cn(control, 'py-2.5', error ? 'border-rose-400' : 'border-ink-200', className)}
        {...ariaProps(_id, error, hint)}
        {...props}
      />
    </Field>
  );
});

export const Select = forwardRef(function Select(
  { label, error, hint, id, required, className, wrapperClassName, children, ...props }, ref,
) {
  const auto = useId();
  const _id = id ?? auto;
  return (
    <Field id={_id} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <div className="relative">
        <select
          ref={ref}
          id={_id}
          className={cn(control, 'appearance-none pr-10', error ? 'border-rose-400' : 'border-ink-200', className)}
          {...ariaProps(_id, error, hint)}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
      </div>
    </Field>
  );
});
