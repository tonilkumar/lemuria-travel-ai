import { ArrowRight, CheckCircle2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { useConvertLead } from './api';

/**
 * Converts an enquiry into a customer.
 *
 * The lead is not consumed by this: it keeps its code, score history and
 * timeline, and gains a link to the customer. The copy says so, because the
 * word "convert" reads as destructive to someone using it for the first time.
 */
export function ConvertLeadModal({
  open,
  onClose,
  lead,
}: {
  open: boolean;
  onClose: () => void;
  lead: {
    id: string;
    leadCode: string;
    customerName: string;
    phone: string;
    email: string | null;
    customerId: string | null;
  };
}) {
  const navigate = useNavigate();
  const convert = useConvertLead();

  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const alreadyLinked = Boolean(lead.customerId);

  const submit = async () => {
    setError(null);
    try {
      const result = await convert.mutateAsync({
        leadId: lead.id,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(alreadyLinked
          ? {}
          : {
              customer: {
                ...(city.trim() ? { city: city.trim() } : {}),
                ...(state.trim() ? { state: state.trim() } : {}),
              },
            }),
      });
      onClose();
      navigate(`/customers/${result.customerId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not convert this enquiry.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convert to customer"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            leadingIcon={<UserPlus className="size-4" aria-hidden />}
            loading={convert.isPending}
            onClick={() => void submit()}
          >
            {alreadyLinked ? 'Link and convert' : 'Create customer'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600">
            {error}
          </p>
        )}

        <div className="rounded-lg bg-teal-50 px-3.5 py-3">
          <p className="flex items-start gap-2 text-sm text-teal-800">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              The enquiry <span className="font-mono text-xs">{lead.leadCode}</span> stays exactly as
              it is — its score, follow-ups and history are kept and linked to the customer.
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-ink-200 px-3.5 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink-900">{lead.customerName}</p>
            <p className="tabular text-xs text-ink-500">
              {formatPhone(lead.phone)}
              {lead.email && (
                <>
                  <span className="mx-1.5 text-ink-300">·</span>
                  {lead.email}
                </>
              )}
            </p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-ink-300" aria-hidden />
          <p className="text-xs font-medium text-teal-700">
            {alreadyLinked ? 'Existing customer' : 'New customer'}
          </p>
        </div>

        {!alreadyLinked && (
          <>
            <p className="text-xs text-ink-500">
              Name, phone and email carry over from the enquiry. Add anything else you already know —
              the rest can be filled in on the profile later.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Chennai" />
              <Input
                label="State"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Tamil Nadu"
              />
            </div>
          </>
        )}

        <Textarea
          label="Conversion note"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Confirmed over the phone, advance received"
        />
      </div>
    </Modal>
  );
}
