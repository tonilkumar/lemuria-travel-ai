import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

const CONTROL =
  'w-full rounded-lg border bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 transition-colors disabled:bg-ink-50 disabled:text-ink-400';

const OK = 'border-ink-300 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20';
const BAD = 'border-danger-500 focus:border-danger-500 focus:ring-2 focus:ring-danger-500/20';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-700">
          {label}
          {required && <span className="ml-0.5 text-danger-500">*</span>}
        </label>
      )}
      {children}
      {/* Errors are announced, so a screen-reader user learns why submit failed. */}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-xs text-danger-600" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-500">{hint}</p>
      )}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: ReactNode;
  leadingIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leadingIcon, className, required, ...props },
  ref,
) {
  const generatedId = useId();
  const id = props.id ?? generatedId;

  const control = (
    <div className="relative">
      {leadingIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
          {leadingIcon}
        </span>
      )}
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(CONTROL, 'h-9.5', error ? BAD : OK, leadingIcon && 'pl-9', className)}
        {...props}
      />
    </div>
  );

  if (!label && !error && !hint) return control;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required}>
      {control}
    </Field>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: ReactNode;
  placeholder?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, placeholder, options, className, required, ...props },
  ref,
) {
  const generatedId = useId();
  const id = props.id ?? generatedId;

  const control = (
    <select
      ref={ref}
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      className={cn(CONTROL, 'h-9.5 pr-8', error ? BAD : OK, className)}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  if (!label && !error && !hint) return control;
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} required={required}>
      {control}
    </Field>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, className, ...props },
  ref,
) {
  const generatedId = useId();
  const id = props.id ?? generatedId;

  const control = (
    <textarea
      ref={ref}
      id={id}
      aria-invalid={error ? true : undefined}
      className={cn(CONTROL, 'min-h-20 resize-y py-2', error ? BAD : OK, className)}
      {...props}
    />
  );

  if (!label && !error) return control;
  return (
    <Field label={label} htmlFor={id} error={error}>
      {control}
    </Field>
  );
});
