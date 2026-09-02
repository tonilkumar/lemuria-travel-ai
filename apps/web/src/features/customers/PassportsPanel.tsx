import { expirySeverity, passportSchema, type PassportInput } from '@lemuria/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, BookUser, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Badge,
  Button,
  CardBody,
  CardHeader,
  Input,
  Modal,
  type BadgeTone,
} from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAddPassport, type PassportRecord } from './api';

const SEVERITY_TONE: Record<string, BadgeTone> = {
  CRITICAL: 'danger',
  URGENT: 'hot',
  WARN: 'warm',
  INFO: 'neutral',
};

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: 'Expires within a month',
  URGENT: 'Expires within 3 months',
  WARN: 'Expires within 6 months',
  INFO: 'Expires within a year',
};

export function PassportsPanel({
  customerId,
  passports,
}: {
  customerId: string;
  passports: PassportRecord[];
}) {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);

  // Recording a passport number is identity data, gated the same way as reading
  // one — an executive can see that a passport exists but not add or read it.
  const mayManage = can('customer.update', 'document.read.sensitive');

  return (
    <>
      <CardHeader
        title="Passports"
        action={
          mayManage ? (
            <Button size="sm" variant="secondary" leadingIcon={<Plus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
              Add
            </Button>
          ) : null
        }
      />

      <CardBody>
        {passports.length === 0 ? (
          <p className="text-sm text-ink-500">
            {mayManage
              ? 'No passport on file. Adding one enables the expiry alerts.'
              : 'No passport visible at your access level.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {passports.map((p) => {
              const severity = expirySeverity(p.daysToExpiry);
              const expired = p.daysToExpiry !== null && p.daysToExpiry < 0;

              return (
                <li key={p.id} className="rounded-lg border border-ink-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-mono text-sm text-ink-900">
                        <BookUser className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                        {p.passportNumberMasked}
                      </p>
                      {p.fullNameOnPassport && (
                        <p className="mt-1 truncate text-xs text-ink-500">{p.fullNameOnPassport}</p>
                      )}
                    </div>
                    {p.isPrimary && <Badge tone="teal">Primary</Badge>}
                  </div>

                  <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <dt className="text-ink-500">Issued</dt>
                      <dd className="text-ink-800">{p.issuedOn ? formatDate(p.issuedOn) : '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">Expires</dt>
                      <dd className="text-ink-800">{p.expiresOn ? formatDate(p.expiresOn) : '—'}</dd>
                    </div>
                  </dl>

                  {severity && (
                    <div className="mt-2.5">
                      <Badge tone={SEVERITY_TONE[severity] ?? 'warm'}>
                        <AlertTriangle className="size-3" aria-hidden />
                        {expired ? 'Expired' : (SEVERITY_LABEL[severity] ?? 'Expiring soon')}
                      </Badge>
                      {!expired && p.daysToExpiry !== null && p.daysToExpiry <= 180 && (
                        <p className="mt-1.5 text-[11px] text-ink-500">
                          Most embassies require six months of validity beyond the travel date.
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>

      <AddPassportModal open={open} onClose={() => setOpen(false)} customerId={customerId} />
    </>
  );
}

function AddPassportModal({
  open,
  onClose,
  customerId,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
}) {
  const addPassport = useAddPassport();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PassportInput>({
    resolver: zodResolver(passportSchema),
    defaultValues: { nationality: 'Indian', isPrimary: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await addPassport.mutateAsync({ id: customerId, ...values });
      reset();
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save that passport.');
    }
  });

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Record a passport"
      description="The number is stored masked. Only the last four digits stay readable."
      size="sm"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" form="passport-form" loading={isSubmitting}>
            Save passport
          </Button>
        </>
      }
    >
      <form id="passport-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600">
            {formError}
          </p>
        )}

        <Input
          label="Passport number"
          required
          autoFocus
          placeholder="M1234567"
          error={errors.passportNumber?.message}
          {...register('passportNumber')}
        />

        <Input
          label="Name as printed"
          placeholder="Leave blank to use the customer name"
          error={errors.fullNameOnPassport?.message}
          {...register('fullNameOnPassport')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Issued on" type="date" error={errors.issuedOn?.message} {...register('issuedOn')} />
          <Input
            label="Expires on"
            type="date"
            required
            error={errors.expiresOn?.message}
            {...register('expiresOn')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Place of issue" error={errors.placeOfIssue?.message} {...register('placeOfIssue')} />
          <Input label="Nationality" error={errors.nationality?.message} {...register('nationality')} />
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" className="size-4 rounded border-ink-300 text-teal-600" {...register('isPrimary')} />
          This is the primary passport
        </label>
      </form>
    </Modal>
  );
}
