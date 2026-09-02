import { createCustomerSchema, type CreateCustomerInput, type DuplicateCandidate } from '@lemuria/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ArrowRight, UserCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Input, Modal, Select, Textarea } from '@/components/ui';
import { useAssignableUsers } from '@/features/leads/api';
import { useDebounced } from '@/features/leads/useDebounced';
import { ApiError } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import {
  useCheckCustomerDuplicates,
  useCreateCustomer,
  useUpdateCustomer,
  type CustomerProfile,
} from './api';

/**
 * Create or edit a customer.
 *
 * Creating is for people who arrive as customers rather than as enquiries — a
 * walk-in booking, or a referral introduced mid-trip. Enquiries become
 * customers through conversion instead, which preserves the lead history.
 */
export function CustomerFormModal({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  /** Present when editing; absent when creating. */
  existing?: CustomerProfile['customer'] | undefined;
}) {
  const navigate = useNavigate();
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const checkDuplicates = useCheckCustomerDuplicates();
  const assignees = useAssignableUsers();

  const isEdit = Boolean(existing);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: { nationality: 'Indian', country: 'India', acknowledgeDuplicates: false },
  });

  // Load the record being edited once the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (existing) {
      reset({
        fullName: existing.fullName,
        salutation: existing.salutation ?? undefined,
        primaryPhone: existing.primaryPhone,
        alternatePhone: existing.alternatePhone ?? undefined,
        email: existing.email ?? undefined,
        dateOfBirth: existing.dateOfBirth ?? undefined,
        gender: existing.gender ?? undefined,
        nationality: existing.nationality ?? 'Indian',
        addressLine1: existing.addressLine1 ?? undefined,
        addressLine2: existing.addressLine2 ?? undefined,
        city: existing.city ?? undefined,
        state: existing.state ?? undefined,
        postalCode: existing.postalCode ?? undefined,
        country: existing.country ?? 'India',
        notes: existing.notes ?? undefined,
        acknowledgeDuplicates: true,
      });
    } else {
      reset({ nationality: 'Indian', country: 'India', acknowledgeDuplicates: false });
      setDuplicates([]);
    }
    setFormError(null);
  }, [open, existing, reset]);

  const name = watch('fullName');
  const phone = watch('primaryPhone');
  const debouncedName = useDebounced(name, 500);
  const debouncedPhone = useDebounced(phone, 500);

  // Only when creating: an edit is not a duplicate of itself.
  useEffect(() => {
    if (!open || isEdit) return;
    if (!debouncedName || debouncedName.length < 2) return;
    if (!debouncedPhone || debouncedPhone.replace(/\D/g, '').length < 10) return;

    checkDuplicates.mutate(
      { fullName: debouncedName, phone: debouncedPhone },
      { onSuccess: setDuplicates, onError: () => setDuplicates([]) },
    );
    // checkDuplicates is a stable react-query mutation object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, debouncedName, debouncedPhone]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, ...values });
        onClose();
        return;
      }

      const created = await create.mutateAsync({
        ...values,
        acknowledgeDuplicates: duplicates.length > 0 ? true : values.acknowledgeDuplicates,
      });
      onClose();
      navigate(`/customers/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DUPLICATE_DETECTED') {
        const details = err.details as { candidates?: DuplicateCandidate[] } | undefined;
        setDuplicates(details?.candidates ?? []);
        setFormError('This person may already exist. Review the matches, then save again.');
        return;
      }
      setFormError(err instanceof ApiError ? err.message : 'Could not save this customer.');
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit customer' : 'New customer'}
      description={
        isEdit
          ? undefined
          : 'For someone who arrives as a customer. Enquiries become customers through conversion.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="customer-form" loading={isSubmitting}>
            {isEdit ? 'Save changes' : 'Create customer'}
          </Button>
        </>
      }
    >
      <form id="customer-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-warm-50 px-3 py-2.5 text-sm text-warm-700"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-4">
          <Input
            label="Title"
            placeholder="Mr"
            className="sm:col-span-1"
            error={errors.salutation?.message}
            {...register('salutation')}
          />
          <div className="sm:col-span-3">
            <Input
              label="Full name"
              required
              autoFocus
              placeholder="Priya Sharma"
              error={errors.fullName?.message}
              {...register('fullName')}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Phone"
            required
            inputMode="tel"
            placeholder="98765 43210"
            error={errors.primaryPhone?.message}
            {...register('primaryPhone')}
          />
          <Input
            label="Alternate phone"
            inputMode="tel"
            error={errors.alternatePhone?.message}
            {...register('alternatePhone')}
          />
          <Input
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>

        {duplicates.length > 0 && !isEdit && (
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
                    <p className="tabular text-xs text-ink-500">{formatPhone(c.phone)}</p>
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
                        onClick={() => {
                          onClose();
                          navigate(`/customers/${c.customerId}`);
                        }}
                      >
                        Open
                        <ArrowRight className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-warm-700">
              Saving again creates a separate record. Nothing is merged automatically.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Date of birth"
            type="date"
            error={errors.dateOfBirth?.message}
            {...register('dateOfBirth')}
          />
          <Select
            label="Gender"
            placeholder="Prefer not to say"
            options={[
              { value: 'Female', label: 'Female' },
              { value: 'Male', label: 'Male' },
              { value: 'Other', label: 'Other' },
            ]}
            {...register('gender')}
          />
          <Input label="Nationality" error={errors.nationality?.message} {...register('nationality')} />
        </div>

        <fieldset className="space-y-4">
          <legend className="text-xs font-medium text-ink-700">Address</legend>
          <Input placeholder="Address line 1" error={errors.addressLine1?.message} {...register('addressLine1')} />
          <Input placeholder="Address line 2" error={errors.addressLine2?.message} {...register('addressLine2')} />
          <div className="grid gap-4 sm:grid-cols-4">
            <Input placeholder="City" error={errors.city?.message} {...register('city')} />
            <Input placeholder="State" error={errors.state?.message} {...register('state')} />
            <Input placeholder="PIN" error={errors.postalCode?.message} {...register('postalCode')} />
            <Input placeholder="Country" error={errors.country?.message} {...register('country')} />
          </div>
        </fieldset>

        <Select
          label="Relationship owner"
          placeholder="Assign to me"
          options={(assignees.data ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
          {...register('ownerId')}
        />

        <Textarea
          label="Notes"
          placeholder="Anything the team should know"
          error={errors.notes?.message}
          {...register('notes')}
        />
      </form>
    </Modal>
  );
}
