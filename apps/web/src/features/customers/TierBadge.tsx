import { Badge, type BadgeTone } from '@/components/ui';

/**
 * Relationship tier. Derived from booking history and lifetime value, so the
 * badge reflects what the customer has actually done rather than a manual label.
 */
const TIER_TONE: Record<string, BadgeTone> = {
  PLATINUM: 'teal',
  GOLD: 'warm',
  SILVER: 'neutral',
  BRONZE: 'neutral',
};

const TIER_LABEL: Record<string, string> = {
  PLATINUM: 'Platinum',
  GOLD: 'Gold',
  SILVER: 'Silver',
  BRONZE: 'Bronze',
};

export function TierBadge({ tier, score }: { tier: string; score?: number }) {
  return (
    <Badge tone={TIER_TONE[tier] ?? 'neutral'} dot={tier === 'PLATINUM' || tier === 'GOLD'}>
      {TIER_LABEL[tier] ?? tier}
      {score !== undefined && score > 0 && <span className="tabular opacity-70">{score}</span>}
    </Badge>
  );
}
