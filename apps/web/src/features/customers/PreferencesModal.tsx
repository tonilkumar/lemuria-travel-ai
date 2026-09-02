import { customerPreferencesSchema, type CustomerPreferencesInput } from '@lemuria/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Badge, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useSavePreferences, type CustomerProfile } from './api';

/**
 * Travel preferences.
 *
 * Worth capturing properly: these are what make a repeat quotation fast, and
 * dietary and accessibility needs are the ones a customer notices when they are
 * forgotten.
 */
const COMMON_INTERESTS = [
  'Beaches',
  'Wildlife',
  'Adventure',
  'Heritage',
  'Food',
  'Shopping',
  'Nightlife',
  'Trekking',
  'Photography',
  'Wellness',
  'Pilgrimage',
  'Cruises',
];

export function PreferencesModal({
  open,
  onClose,
  customerId,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  customerId: string;
  existing: CustomerProfile['preferences'];
}) {
  const save = useSavePreferences();
  const [interests, setInterests] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CustomerPreferencesInput>({
    resolver: zodResolver(customerPreferencesSchema),
    defaultValues: { interests: [] },
  });

  useEffect(() => {
    if (!open) return;
    setInterests(existing?.interests ?? []);
    reset({
      mealPreference: existing?.mealPreference ?? undefined,
      seatPreference: existing?.seatPreference ?? undefined,
      hotelCategory: existing?.hotelCategory ?? undefined,
      roomPreference: existing?.roomPreference ?? undefined,
      dietaryRestrictions: existing?.dietaryRestrictions ?? undefined,
      accessibilityNeeds: existing?.accessibilityNeeds ?? undefined,
      preferredLanguage: existing?.preferredLanguage ?? undefined,
      notes: existing?.notes ?? undefined,
      interests: existing?.interests ?? [],
    });
    setFormError(null);
  }, [open, existing, reset]);

  const toggleInterest = (interest: string) => {
    setInterests((current) =>
      current.includes(interest) ? current.filter((i) => i !== interest) : [...current, interest],
    );
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync({ id: customerId, ...values, interests });
      onClose();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save preferences.');
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Travel preferences"
      description="What this customer expects, so a repeat quotation starts from the right place."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="preferences-form" loading={isSubmitting}>
            Save preferences
          </Button>
        </>
      }
    >
      <form id="preferences-form" onSubmit={onSubmit} className="space-y-5" noValidate>
        {formError && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-600">
            {formError}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Hotel category"
            placeholder="No preference"
            options={[
              { value: '3-star', label: '3 star' },
              { value: '4-star', label: '4 star' },
              { value: '5-star', label: '5 star' },
              { value: 'Boutique', label: 'Boutique' },
              { value: 'Homestay', label: 'Homestay' },
            ]}
            {...register('hotelCategory')}
          />
          <Select
            label="Room preference"
            placeholder="No preference"
            options={[
              { value: 'Twin', label: 'Twin' },
              { value: 'Double', label: 'Double' },
              { value: 'Suite', label: 'Suite' },
              { value: 'Connecting', label: 'Connecting rooms' },
            ]}
            {...register('roomPreference')}
          />
          <Select
            label="Meal preference"
            placeholder="No preference"
            options={[
              { value: 'Vegetarian', label: 'Vegetarian' },
              { value: 'Jain', label: 'Jain' },
              { value: 'Vegan', label: 'Vegan' },
              { value: 'Halal', label: 'Halal' },
              { value: 'Non-vegetarian', label: 'Non-vegetarian' },
            ]}
            {...register('mealPreference')}
          />
          <Select
            label="Seat preference"
            placeholder="No preference"
            options={[
              { value: 'Window', label: 'Window' },
              { value: 'Aisle', label: 'Aisle' },
              { value: 'Front', label: 'Front of cabin' },
              { value: 'Extra legroom', label: 'Extra legroom' },
            ]}
            {...register('seatPreference')}
          />
        </div>

        <Field label="Interests" hint="Used to shape itinerary suggestions">
          <div className="flex flex-wrap gap-1.5">
            {COMMON_INTERESTS.map((interest) => {
              const selected = interests.includes(interest);
              return (
                <button
                  key={interest}
                  type="button"
                  onClick={() => toggleInterest(interest)}
                  aria-pressed={selected}
                  className="rounded-full transition-transform active:scale-95"
                >
                  <Badge tone={selected ? 'teal' : 'neutral'}>
                    {interest}
                    {selected && <X className="size-3" aria-hidden />}
                  </Badge>
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Preferred language"
            placeholder="Tamil"
            error={errors.preferredLanguage?.message}
            {...register('preferredLanguage')}
          />
        </div>

        <Textarea
          label="Dietary restrictions"
          placeholder="No onion or garlic; severe nut allergy"
          error={errors.dietaryRestrictions?.message}
          {...register('dietaryRestrictions')}
        />

        <Textarea
          label="Accessibility needs"
          placeholder="Ground-floor room, wheelchair assistance at airports"
          error={errors.accessibilityNeeds?.message}
          {...register('accessibilityNeeds')}
        />

        <Textarea label="Other notes" error={errors.notes?.message} {...register('notes')} />
      </form>
    </Modal>
  );
}
