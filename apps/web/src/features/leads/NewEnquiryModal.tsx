import { createLeadSchema, type CreateLeadInput, type DuplicateCandidate } from '@lemuria/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ArrowRight, UserCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import {
  useCheckDuplicates,
  useCreateLead,
  useLeadSourceOptions,
  useTravelTypeOptions,
} from './api';
import { useDebounced } from './useDebounced';

/**
 * Quick Enquiry.
 *
 * Only name, phone and source are required so a walk-in can be captured in
 * under 30 seconds (spec §11). Duplicate candidates are surfaced while the user
 * types; they are never merged automatically (spec §12).
 */
export function NewEnquiryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const sources = useLeadSourceOptions();
  const travelTypes = useTravelTypeOptions();
  const createLead = useCreateLead();
  const checkDuplicates = useCheckDuplicates();

  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateLeadInput>({
    resolver: zodResolver(createLeadSchema),
    defaultValues: {
      travellersAdults: 1,
      travellersChildren: 0,
      budgetCurrency: 'INR',
      travelDateFlexible: false,
      acknowledgeDuplicates: false,
    },
  });

  const name = watch('customerName');
  const phone = watch('phone');
  const debouncedName = useDebounced(name, 500);
  const debouncedPhone = useDebounced(phone, 500);

  // Look for existing records as soon as there is enough to match on.
  useEffect(() => {
    if (!open) return;
    if (!debouncedName || debouncedName.length < 2) return;
    if (!debouncedPhone || debouncedPhone.replace(/\D/g, '').length < 10) return;

    checkDuplicates.mutate(
      { customerName: debouncedName, phone: debouncedPhone },
      { onSuccess: setDuplicates, onError: () => setDuplicates([]) },
    );
    // checkDuplicates is a stable mutation object from react-query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debouncedName, debouncedPhone]);

  useEffect(() => {
    if (!open) {
      reset();
      setDuplicates([]);
      setFormError(null);
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const created = await createLead.mutateAsync({
        ...values,
        // The user has seen the candidate list by the time they submit.
        acknowledgeDuplicates: duplicates.length > 0 ? true : values.acknowledgeDuplicates,
      });
      onClose();
      navigate(`/leads/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_DETECTED') {
        const details = err.details as { candidates?: DuplicateCandidate[] } | undefined;
        setDuplicates(details?.candidates ?? []);
        setFormError('This person may already exist. Review the matches below, then save again.');
        return;
      }
      setFormError(err instanceof ApiError ? err.message : 'Could not save the enquiry.');
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Enquiry"
      description="Capture the essentials now; the rest can be filled in later."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-enquiry-form" loading={isSubmitting}>
            Create Enquiry
          </Button>
        </>
      }
    >
      <form id="new-enquiry-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-warm-50 px-3 py-2.5 text-sm text-warm-700"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Customer name"
            required
            autoFocus
            placeholder="Priya Sharma"
            error={errors.customerName?.message}
            {...register('customerName')}
          />
          <Input
            label="Phone"
            required
            inputMode="tel"
            placeholder="98765 43210"
            error={errors.phone?.message}
            {...register('phone')}
          />
        </div>

        {/* Duplicate candidates — advisory, never auto-merged */}
        {duplicates.length > 0 && (
          <div className="rounded-lg border border-warm-200 bg-warm-50/60 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warm-800">
              <UserCheck className="size-3.5" aria-hidden />
              {duplicates.length === 1
                ? 'A possible existing record was found'
                : `${duplicates.length} possible existing records were found`}
            </p>
            <ul className="mt-2 space-y-1.5">
              {duplicates.map((c) => (
                <li
                  key={c.customerId ?? c.leadId}
                  className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">{c.name}</p>
                    <p className="tabular text-xs text-ink-500">
                      {formatPhone(c.phone)}
                      {c.customerCode && (
                        <>
                          <span className="mx-1.5 text-ink-300">·</span>
                          <span className="font-mono text-[11px]">{c.customerCode}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={c.confidence === 'HIGH' ? 'warm' : 'neutral'}>
                      {c.matchedOn.includes('PHONE') ? 'Same phone' : 'Similar'}
                    </Badge>
                    {c.customerId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setValue('linkToCustomerId', c.customerId ?? undefined)}
                      >
                        Use this
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-warm-700">
              Saving again will create a separate enquiry. Nothing is merged automatically.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Email"
            type="email"
            placeholder="priya@example.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <Select
            label="Lead source"
            required
            placeholder="How did they reach us?"
            error={errors.leadSourceId?.message}
            options={(sources.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
            {...register('leadSourceId')}
          />
        </div>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Travel requirement</legend>
          <Input
            label="Destination"
            placeholder="Bali, Kerala, Europe…"
            error={errors.destination?.message}
            {...register('destination')}
          />
          <Input
            label="Travel date"
            type="date"
            hint="Leave blank if they have not decided"
            error={errors.travelDate?.message}
            {...register('travelDate')}
          />
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-4">
          <Input
            label="Adults"
            type="number"
            min={0}
            max={99}
            error={errors.travellersAdults?.message}
            {...register('travellersAdults')}
          />
          <Input
            label="Children"
            type="number"
            min={0}
            max={99}
            error={errors.travellersChildren?.message}
            {...register('travellersChildren')}
          />
          <Select
            label="Travel type"
            placeholder="Any"
            options={(travelTypes.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
            {...register('travelTypeId')}
          />
          <Input
            label="Budget (₹)"
            type="number"
            min={0}
            placeholder="150000"
            error={errors.budgetAmount?.message}
            {...register('budgetAmount')}
          />
        </div>

        <Textarea
          label="Notes"
          placeholder="Anything the team should know before the first call"
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>
    </Modal>
  );
}
