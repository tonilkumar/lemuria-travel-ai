import type { AuthenticatedUser } from '@lemuria/shared';
import { and, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/auth.js';
import { customers } from '../../db/schema/customers.js';
import { bookings, payments } from '../../db/schema/finance.js';
import { followups, leads } from '../../db/schema/leads.js';
import { leadSources } from '../../db/schema/masterdata.js';
import { customerPassports, visaCases } from '../../db/schema/visa.js';
import { quotations } from '../../db/schema/quotations.js';

/**
 * Every figure here is computed from Postgres at request time. The dashboard
 * mockup's numbers were illustrative; nothing on this screen is hardcoded
 * (spec §45).
 */

export interface KpiValue {
  value: number;
  previous: number;
  /** Percentage change vs the comparison window; null when the base was zero. */
  changePct: number | null;
}

function delta(current: number, previous: number): KpiValue {
  const changePct = previous === 0 ? null : ((current - previous) / previous) * 100;
  return { value: current, previous, changePct: changePct === null ? null : Number(changePct.toFixed(1)) };
}

/** Restricts to the caller's own book unless they can see the whole company. */
function visibility(viewer: AuthenticatedUser) {
  return viewer.permissions.includes('dashboard.read.company')
    ? undefined
    : eq(leads.assignedToId, viewer.id);
}

export async function kpis(viewer: AuthenticatedUser) {
  const scope = visibility(viewer);

  const [leadRow] = await db
    .select({
      today: sql<number>`count(*) filter (where ${leads.createdAt}::date = current_date)::int`,
      yesterday: sql<number>`count(*) filter (where ${leads.createdAt}::date = current_date - 1)::int`,
    })
    .from(leads)
    .where(and(isNull(leads.deletedAt), scope));

  const [followupRow] = await db
    .select({
      due: sql<number>`count(*) filter (where ${followups.status} in ('PENDING','OVERDUE') and ${followups.dueAt}::date <= current_date)::int`,
      overdue: sql<number>`count(*) filter (where ${followups.status} in ('PENDING','OVERDUE') and ${followups.dueAt} < now())::int`,
    })
    .from(followups)
    .where(
      and(
        isNull(followups.deletedAt),
        viewer.permissions.includes('dashboard.read.company')
          ? undefined
          : eq(followups.assignedToId, viewer.id),
      ),
    );

  const [quotationRow] = await db
    .select({
      today: sql<number>`count(*) filter (where ${quotations.createdAt}::date = current_date)::int`,
      yesterday: sql<number>`count(*) filter (where ${quotations.createdAt}::date = current_date - 1)::int`,
    })
    .from(quotations)
    .where(isNull(quotations.deletedAt));

  const [visaRow] = await db
    .select({
      active: sql<number>`count(*) filter (where ${visaCases.currentStep} <> 'COMPLETED')::int`,
    })
    .from(visaCases)
    .where(isNull(visaCases.deletedAt));

  const [bookingRow] = await db
    .select({
      thisMonth: sql<number>`count(*) filter (where date_trunc('month', ${bookings.createdAt}) = date_trunc('month', current_date))::int`,
      lastMonth: sql<number>`count(*) filter (where date_trunc('month', ${bookings.createdAt}) = date_trunc('month', current_date - interval '1 month'))::int`,
    })
    .from(bookings)
    .where(isNull(bookings.deletedAt));

  // Revenue is money actually received, not quoted or invoiced.
  const [revenueRow] = await db
    .select({
      thisMonth: sql<number>`coalesce(sum(${payments.amount}) filter (where date_trunc('month', ${payments.paidOn}) = date_trunc('month', current_date)), 0)::bigint`,
      lastMonth: sql<number>`coalesce(sum(${payments.amount}) filter (where date_trunc('month', ${payments.paidOn}) = date_trunc('month', current_date - interval '1 month')), 0)::bigint`,
    })
    .from(payments)
    .where(isNull(payments.deletedAt));

  return {
    newLeadsToday: delta(leadRow?.today ?? 0, leadRow?.yesterday ?? 0),
    followupsDue: { value: followupRow?.due ?? 0, overdue: followupRow?.overdue ?? 0 },
    quotationsToday: delta(quotationRow?.today ?? 0, quotationRow?.yesterday ?? 0),
    activeVisaCases: { value: visaRow?.active ?? 0 },
    bookingsThisMonth: delta(bookingRow?.thisMonth ?? 0, bookingRow?.lastMonth ?? 0),
    // Paise; the client formats to rupees.
    revenueThisMonth: delta(Number(revenueRow?.thisMonth ?? 0), Number(revenueRow?.lastMonth ?? 0)),
  };
}

/**
 * Sales funnel. Each stage counts leads that have *reached at least* that
 * stage, so conversion percentages read correctly down the chain rather than
 * dropping to zero because a lead moved past the middle stage.
 */
export async function funnel(viewer: AuthenticatedUser, days = 90) {
  const scope = visibility(viewer);
  const since = sql`current_date - ${days}::int`;

  const [row] = await db
    .select({
      leads: count(),
      qualified: sql<number>`count(*) filter (where ${leads.status} <> 'OPEN')::int`,
      quotationSent: sql<number>`count(*) filter (where ${leads.status} in ('QUOTATION_SENT','CONVERTED'))::int`,
      // Nested inside the previous stage on purpose: a funnel stage can never
      // exceed its parent, so "in follow-up" means quoted AND still worked.
      inFollowup: sql<number>`count(*) filter (
        where ${leads.status} in ('QUOTATION_SENT','CONVERTED')
          and (${leads.nextFollowupAt} is not null or ${leads.lastContactAt} is not null)
      )::int`,
      converted: sql<number>`count(*) filter (where ${leads.status} = 'CONVERTED')::int`,
    })
    .from(leads)
    .where(and(isNull(leads.deletedAt), gte(leads.createdAt, since), scope));

  const total = row?.leads ?? 0;
  const pct = (n: number) => (total === 0 ? 0 : Number(((n / total) * 100).toFixed(1)));

  const stages = [
    { key: 'LEADS', label: 'Leads', count: total, conversionPct: 100 },
    { key: 'QUALIFIED', label: 'Qualified', count: row?.qualified ?? 0, conversionPct: pct(row?.qualified ?? 0) },
    { key: 'QUOTATION_SENT', label: 'Quotation Sent', count: row?.quotationSent ?? 0, conversionPct: pct(row?.quotationSent ?? 0) },
    { key: 'FOLLOWUP', label: 'Follow-up', count: row?.inFollowup ?? 0, conversionPct: pct(row?.inFollowup ?? 0) },
    { key: 'BOOKING_CONFIRMED', label: 'Booking Confirmed', count: row?.converted ?? 0, conversionPct: pct(row?.converted ?? 0) },
  ];

  return { stages, overallConversionPct: pct(row?.converted ?? 0), windowDays: days };
}

export async function leadSourceBreakdown(viewer: AuthenticatedUser, days = 30) {
  const scope = visibility(viewer);
  const rows = await db
    .select({
      id: leadSources.id,
      name: leadSources.name,
      colour: leadSources.colour,
      total: count(),
      converted: sql<number>`count(*) filter (where ${leads.status} = 'CONVERTED')::int`,
    })
    .from(leads)
    .innerJoin(leadSources, eq(leadSources.id, leads.leadSourceId))
    .where(and(isNull(leads.deletedAt), gte(leads.createdAt, sql`current_date - ${days}::int`), scope))
    .groupBy(leadSources.id, leadSources.name, leadSources.colour)
    .orderBy(desc(count()));

  const total = rows.reduce((sum, r) => sum + r.total, 0);
  return rows.map((r) => ({
    ...r,
    sharePct: total === 0 ? 0 : Number(((r.total / total) * 100).toFixed(1)),
  }));
}

/** Revenue received per day over the window, zero-filled so the chart has no gaps. */
export async function revenueTrend(fromDate: string, toDate: string) {
  const rows = await db.execute<{ bucket: string; amount: string }>(sql`
    with days as (
      select generate_series(${fromDate}::date, ${toDate}::date, interval '1 day')::date as bucket
    )
    select d.bucket::text as bucket,
           coalesce(sum(p.amount), 0)::text as amount
    from days d
    left join ${payments} p
      on p.paid_on = d.bucket
     and p.deleted_at is null
    group by d.bucket
    order by d.bucket
  `);

  return [...rows].map((r) => ({ date: r.bucket, amount: Number(r.amount) }));
}

export async function recentEnquiries(viewer: AuthenticatedUser, limit = 8) {
  return db
    .select({
      id: leads.id,
      leadCode: leads.leadCode,
      customerName: leads.customerName,
      destination: leads.destination,
      status: leads.status,
      classification: leads.classification,
      createdAt: leads.createdAt,
      sourceName: leadSources.name,
      sourceColour: leadSources.colour,
      assignedToName: users.fullName,
      assignedToAvatar: users.avatarUrl,
    })
    .from(leads)
    .leftJoin(leadSources, eq(leadSources.id, leads.leadSourceId))
    .leftJoin(users, eq(users.id, leads.assignedToId))
    .where(and(isNull(leads.deletedAt), visibility(viewer)))
    .orderBy(desc(leads.createdAt))
    .limit(limit);
}

const VISA_STEP_COUNT = 12;

export async function activeVisaCases(limit = 6) {
  const rows = await db
    .select({
      id: visaCases.id,
      caseCode: visaCases.caseCode,
      currentStep: visaCases.currentStep,
      travelDate: visaCases.travelDate,
      customerName: customers.fullName,
      countryName: sql<string>`(select name from visa_countries vc where vc.id = ${visaCases.visaCountryId})`,
      stepIndex: sql<number>`array_position(enum_range(null::visa_workflow_step), ${visaCases.currentStep})::int`,
    })
    .from(visaCases)
    .innerJoin(customers, eq(customers.id, visaCases.customerId))
    .where(and(isNull(visaCases.deletedAt), sql`${visaCases.currentStep} <> 'COMPLETED'`))
    .orderBy(visaCases.travelDate)
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    progressPct: Math.round(((r.stepIndex ?? 1) / VISA_STEP_COUNT) * 100),
  }));
}

export async function atAGlance() {
  const [customerRow] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${customers.isActive})::int`,
      repeat: sql<number>`count(*) filter (where ${customers.totalBookings} > 1)::int`,
    })
    .from(customers)
    .where(isNull(customers.deletedAt));

  const [passportRow] = await db
    .select({
      expiringSoon: sql<number>`count(*) filter (where ${customerPassports.expiresOn} between current_date and current_date + 180)::int`,
    })
    .from(customerPassports)
    .where(isNull(customerPassports.deletedAt));

  const [visaRow] = await db
    .select({
      expiringSoon: sql<number>`count(*) filter (where ${visaCases.visaValidTo} between current_date and current_date + 90)::int`,
    })
    .from(visaCases)
    .where(isNull(visaCases.deletedAt));

  const [followupRow] = await db
    .select({
      completedThisMonth: sql<number>`count(*) filter (where ${followups.status} = 'COMPLETED' and date_trunc('month', ${followups.completedAt}) = date_trunc('month', current_date))::int`,
    })
    .from(followups)
    .where(isNull(followups.deletedAt));

  return {
    totalCustomers: customerRow?.total ?? 0,
    activeCustomers: customerRow?.active ?? 0,
    repeatCustomers: customerRow?.repeat ?? 0,
    passportsExpiring: passportRow?.expiringSoon ?? 0,
    visasExpiring: visaRow?.expiringSoon ?? 0,
    followupsCompletedThisMonth: followupRow?.completedThisMonth ?? 0,
  };
}
