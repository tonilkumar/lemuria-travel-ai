import { Check, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Input, LoadingState, Modal, Select } from '@/components/ui';
import { useDebounced } from '@/features/leads/useDebounced';
import { ApiError } from '@/lib/api';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCustomers, useLinkGroupMember } from './api';

const RELATIONSHIPS = [
  'Spouse',
  'Child',
  'Parent',
  'Sibling',
  'Grandparent',
  'In-law',
  'Friend',
  'Colleague',
];

/**
 * Links another customer into this one's travel group.
 *
 * A group is people who travel together, not a household record — every member
 * keeps their own profile, passport and history. Merging two existing groups is
 * deliberately refused by the API rather than done silently.
 */
export function LinkFamilyModal({
  open,
  onClose,
  customerId,
  customerName,
  excludeIds,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  /** Already-linked members, so they are not offered again. */
  excludeIds: string[];
}) {
  const link = useLinkGroupMember();
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput, 350);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState('');
  const [error, setError] = useState<string | null>(null);

  const results = useCustomers(
    useMemo(() => ({ page: 1, pageSize: 8, ...(search ? { search } : {}) }), [search]),
  );

  const candidates = (results.data?.data ?? []).filter(
    (c) => c.id !== customerId && !excludeIds.includes(c.id),
  );

  const reset = () => {
    setSearchInput('');
    setSelectedId(null);
    setRelationship('');
    setError(null);
  };

  const submit = async () => {
    if (!selectedId) {
      setError('Choose a customer to link.');
      return;
    }
    setError(null);
    try {
      await link.mutateAsync({
        id: customerId,
        customerId: selectedId,
        ...(relationship ? { relationship } : {}),
      });
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not link that customer.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Link a family member"
      description={`Adds another customer to ${customerName}'s travel group. Both keep their own profile.`}
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
          <Button
            leadingIcon={<Users className="size-4" aria-hidden />}
            loading={link.isPending}
            disabled={!selectedId}
            onClick={() => void submit()}
          >
            Link member
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

        <Input
          label="Find a customer"
          type="search"
          autoFocus
          placeholder="Search by name or phone"
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setSelectedId(null);
          }}
          leadingIcon={<Search className="size-4" aria-hidden />}
        />

        <div className="max-h-64 overflow-y-auto rounded-lg border border-ink-200">
          {results.isPending ? (
            <LoadingState label="Searching" className="py-8" />
          ) : candidates.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-500">
              {search ? 'No other customers match.' : 'Start typing to find a customer.'}
            </p>
          ) : (
            <ul className="divide-y divide-ink-200/70">
              {candidates.map((c) => {
                const selected = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(c.id)}
                      aria-pressed={selected}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                        selected ? 'bg-teal-50' : 'hover:bg-ink-50',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-900">{c.fullName}</p>
                        <p className="tabular text-xs text-ink-500">
                          {formatPhone(c.primaryPhone)}
                          <span className="mx-1.5 text-ink-300">·</span>
                          <span className="font-mono text-[11px]">{c.customerCode}</span>
                        </p>
                      </div>
                      {selected && <Check className="size-4 shrink-0 text-teal-600" aria-hidden />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Select
          label="Relationship"
          placeholder="Not specified"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
          options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))}
        />
      </div>
    </Modal>
  );
}
