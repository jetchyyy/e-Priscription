import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const control =
  'block w-full rounded-[18px] border border-[#dce1e8] bg-white px-4 min-h-[48px] text-[15px] text-[#152839] placeholder:text-[#5f6a7c] ' +
  'transition focus:outline-none focus:border-[#ff6f07] focus:ring-2 focus:ring-[#ff6f07]/20 disabled:bg-[#ece7de] disabled:text-[#5f6a7c]';

function Field({ id, label, error, hint, required, className, children }) {
  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[#152839]">
          {label}
          {required && <span className="ml-0.5 text-[#b8470a]" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-[#b8470a]">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-[#5f6a7c]">{hint}</p>
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
