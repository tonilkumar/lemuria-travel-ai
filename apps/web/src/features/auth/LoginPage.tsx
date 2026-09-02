import { loginSchema, type LoginInput } from '@lemuria/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Plane } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Input } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const { signIn } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Could not sign in. Please try again.',
      );
    }
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel, hidden on small screens where it would just push the form down. */}
      <div className="relative hidden flex-col justify-between bg-navy-800 p-10 lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300">
            <Plane className="size-5" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-semibold tracking-wide text-white">LEMURIA</span>
            <span className="block text-[11px] font-medium tracking-[0.2em] text-teal-300/80">
              TRAVEL AI
            </span>
          </span>
        </div>

        <div className="max-w-md">
          <h2 className="text-2xl font-semibold leading-snug text-white">
            One connected workflow, from first enquiry to post-travel history.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            Leads, quotations, itineraries, visas and payments in a single operating system for
            Lemuria India Holidays.
          </p>
        </div>

        <p className="text-xs text-white/35">
          Internal system. Access is logged and audited.
        </p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="text-base font-semibold tracking-wide text-ink-900">LEMURIA</span>
            <span className="ml-2 text-[11px] font-medium tracking-[0.2em] text-teal-600">
              TRAVEL AI
            </span>
          </div>

          <h1 className="text-xl font-semibold text-ink-900">Sign in</h1>
          <p className="mt-1 text-sm text-ink-500">Use your Lemuria work account.</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {formError}
              </div>
            )}

            <Input
              label="Email"
              type="email"
              autoComplete="username"
              autoFocus
              required
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              error={errors.password?.message}
              {...register('password')}
            />

            <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
