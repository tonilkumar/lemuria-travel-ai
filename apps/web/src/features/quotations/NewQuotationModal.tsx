import { createQuotationSchema, type CreateQuotationInput } from '@lemuria/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, LoadingState, Modal } from '@/components/ui';
import { useCustomers } from '@/features/customers/api';
import { useDebounced } from '@/features/leads/useDebounced';
import { ApiError } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCreateQuotation } from './api';

/**
 * Starts a quotation against a customer.
 *
 * The customer is chosen first because everything downstream — tier, history,
 * where the PDF is addressed — hangs off it.
 */
export function NewQuotationModal({
  open,
  onClose,
  customerId: fixedCustomerId,
}: {
  open: boolean;
  onClose: () => void;
  /** Preselected when starting from a customer or lead. */
  customerId?: string;
}) {
  const navigate = useNavigate();
  const create = useCreateQuotation();

  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput, 350);
  const [selectedId, setSelectedId] = useState<string | null>(fixedCustomerId ?? null);
  const [formError, setFormError] = useState<string | null>(null);

  const results = useCustomers(
    useMemo(() => ({ page: 1, pageSize: 6, ...(search ? { search } : {}) }), [search]),
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateQuotationInput>({
    resolver: zodResolver(createQuotationSchema),
    defaultValues: { travellersAdults: 2, travellersChildren: 0 },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!selectedId) {
      setFormError('Choose a customer first.');
      return;
    }
    setFormError(null);
    try {
      const created = await create.mutateAsync({ ...values, customerId: selectedId });
      reset();
      setSelectedId(fixedCustomerId ?? null);
      setSearchInput('');
      onClose();
      navigate(`/quotations/${created.id}`);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create the quotation.');
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New quotation"
      description="Pick the customer and the trip. Pricing comes next."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="new-quotation-form" loading={isSubmitting}>
            Create and start pricing
          </Button>
        </>
      }
    >
      <form id="new-quotation-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        {formError && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600">
            {formError}
          </p>
        )}

        {!fixedCustomerId && (
          <Field label="Customer" required>
            <Input
              type="search"
              placeholder="Search by name or phone"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setSelectedId(null);
              }}
              leadingIcon={<Search className="size-4" aria-hidden />}
            />
            <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-ink-200">
              {results.isPending ? (
                <LoadingState label="Searching" className="py-6" />
              ) : results.data?.data.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-ink-500">No customers match.</p>
              ) : (
                <ul className="divide-y divide-ink-200/70">
                  {results.data?.data.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        aria-pressed={c.id === selectedId}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          c.id === selectedId ? 'bg-teal-50' : 'hover:bg-ink-50',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink-900">
                            {c.fullName}
                          </span>
                          <span className="tabular block text-xs text-ink-500">
                            {formatPhone(c.primaryPhone)} · {c.customerCode}
                          </span>
                        </span>
                        {c.id === selectedId && (
                          <Check className="size-4 shrink-0 text-teal-600" aria-hidden />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>
        )}

        <Input
          label="Quotation title"
          required
          placeholder="Bali honeymoon, 6 nights"
          error={errors.title?.message}
          {...register('title')}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Destination"
            placeholder="Bali"
            error={errors.destination?.message}
            {...register('destination')}
          />
          <Input
            label="Departure"
            type="date"
            error={errors.travelStartDate?.message}
            {...register('travelStartDate')}
          />
          <Input
            label="Return"
            type="date"
            error={errors.travelEndDate?.message}
            {...register('travelEndDate')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Adults"
            type="number"
            min={1}
            error={errors.travellersAdults?.message}
            {...register('travellersAdults')}
          />
          <Input
            label="Children"
            type="number"
            min={0}
            error={errors.travellersChildren?.message}
            {...register('travellersChildren')}
          />
          <Input
            label="Quote valid until"
            type="date"
            hint="Shown on the PDF"
            error={errors.validUntil?.message}
            {...register('validUntil')}
          />
        </div>
      </form>
    </Modal>
  );
}
