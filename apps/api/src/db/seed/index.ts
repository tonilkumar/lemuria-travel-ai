import { addDays, subDays, subHours, subMonths } from 'date-fns';
import { sql } from 'drizzle-orm';
import { closeDb, db } from '../client.js';
import { permissions, rolePermissions, roles, userRoles, users } from '../schema/auth.js';
import { customers } from '../schema/customers.js';
import { bookings, payments, supplierRates, suppliers } from '../schema/finance.js';
import { followups, leadScores, leads, leadStatusHistory } from '../schema/leads.js';
import {
  destinations,
  leadSources,
  paymentMethods,
  supplierTypes,
  travelTypes,
  visaCountries,
} from '../schema/masterdata.js';
import { customerPassports, visaCases, visaChecklistItems } from '../schema/visa.js';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, type Role } from '@lemuria/shared';
import { nextCode, normaliseName } from '../../lib/codes.js';
import { hashPassword } from '../../lib/security.js';
import { seedQuotationConfig } from './quotations.js';
import {
  CUSTOMER_NOTES,
  DEFAULT_VISA_CHECKLIST,
  DOMESTIC_DESTINATIONS,
  FIRST_NAMES,
  FOLLOWUP_NOTES,
  INTERNATIONAL_DESTINATIONS,
  LAST_NAMES,
  LEAD_SOURCES,
  PAYMENT_METHODS,
  SUPPLIER_TYPES,
  TEAM,
  TRAVEL_TYPES,
  VISA_COUNTRIES,
} from './data.js';

/**
 * Development seed.
 *
 * Deliberately deterministic — the same command produces the same dataset, so a
 * screenshot or a bug report from one machine is reproducible on another. Every
 * row is marked as demo data by its .test email domain and LM-* codes.
 *
 * This script refuses to run against a production database.
 */

const DEMO_PASSWORD = 'LemuriaDemo#2026';

// Mulberry32 — small deterministic PRNG so the dataset never shifts run to run.
let seedState = 0x9e3779b9;
function rand(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)] as T;
const between = (min: number, max: number): number => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p: number): boolean => rand() < p;

function phoneFor(index: number): string {
  // Valid Indian mobile prefixes, unique per seeded record.
  const prefix = ['9', '8', '7', '6'][index % 4];
  return `${prefix}${String(100000000 + index * 7919).slice(0, 9)}`;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed a production database.');
    process.exit(1);
  }

  console.log('Seeding Lemuria Travel AI development data...');

  // ── RBAC ───────────────────────────────────────────────────────────────────
  await db
    .insert(permissions)
    .values(
      PERMISSIONS.map((key) => {
        const [resource = key, action = 'read'] = key.split('.');
        return { key, resource, action };
      }),
    )
    .onConflictDoNothing();

  const permissionRows = await db.select().from(permissions);
  const permissionIdByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  await db
    .insert(roles)
    .values(
      ROLES.map((key) => ({
        key,
        name: key.charAt(0) + key.slice(1).toLowerCase(),
        isSystem: true,
      })),
    )
    .onConflictDoNothing();

  const roleRows = await db.select().from(roles);
  const roleIdByKey = new Map(roleRows.map((r) => [r.key, r.id]));

  for (const role of ROLES) {
    const roleId = roleIdByKey.get(role);
    if (!roleId) continue;
    const grants = ROLE_PERMISSIONS[role]
      .map((key) => permissionIdByKey.get(key))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId, permissionId }));
    if (grants.length) await db.insert(rolePermissions).values(grants).onConflictDoNothing();
  }
  console.log(`  roles: ${ROLES.length}, permissions: ${PERMISSIONS.length}`);

  // ── Team ───────────────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const insertedUsers = await db
    .insert(users)
    .values(
      TEAM.map((member, i) => ({
        employeeCode: `LM-EMP-${String(i + 1).padStart(3, '0')}`,
        fullName: member.fullName,
        email: member.email,
        phone: phoneFor(900 + i),
        designation: member.designation,
        passwordHash,
        isActive: true,
      })),
    )
    .onConflictDoNothing()
    .returning();

  const userRows = insertedUsers.length ? insertedUsers : await db.select().from(users);
  const userIdByEmail = new Map(userRows.map((u) => [u.email, u.id]));

  for (const member of TEAM) {
    const userId = userIdByEmail.get(member.email);
    const roleId = roleIdByKey.get(member.role as Role);
    if (userId && roleId) {
      await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
    }
  }
  const executives = TEAM.filter((t) => t.role === 'EXECUTIVE')
    .map((t) => userIdByEmail.get(t.email))
    .filter((id): id is string => Boolean(id));
  const adminId = userIdByEmail.get(TEAM[0]!.email)!;
  console.log(`  users: ${TEAM.length}`);

  // ── Master data ────────────────────────────────────────────────────────────
  await db.insert(leadSources).values(LEAD_SOURCES).onConflictDoNothing();
  await db.insert(travelTypes).values(TRAVEL_TYPES).onConflictDoNothing();
  await db.insert(paymentMethods).values(PAYMENT_METHODS).onConflictDoNothing();
  await db.insert(supplierTypes).values(SUPPLIER_TYPES).onConflictDoNothing();

  await db
    .insert(destinations)
    .values([
      ...INTERNATIONAL_DESTINATIONS.map((name) => ({ name, isDomestic: false })),
      ...DOMESTIC_DESTINATIONS.map((name) => ({ name, isDomestic: true })),
    ])
    .onConflictDoNothing();

  await db
    .insert(visaCountries)
    .values(
      VISA_COUNTRIES.map((c) => ({
        countryCode: c.code,
        name: c.name,
        processingDaysMin: c.min,
        processingDaysMax: c.max,
      })),
    )
    .onConflictDoNothing();

  const quotationConfig = await seedQuotationConfig(db);
  console.log(
    `  quotation config: ${quotationConfig.rates} tax rates (all PROVISIONAL), ${quotationConfig.settings} approval thresholds (PLACEHOLDERS)`,
  );

  const sourceRows = await db.select().from(leadSources);
  const travelTypeRows = await db.select().from(travelTypes);
  const visaCountryRows = await db.select().from(visaCountries);
  const paymentMethodRows = await db.select().from(paymentMethods);
  const supplierTypeRows = await db.select().from(supplierTypes);
  console.log(`  master data: ${sourceRows.length} sources, ${visaCountryRows.length} visa countries`);

  // ── Suppliers ──────────────────────────────────────────────────────────────
  const supplierNames = [
    'Asia Horizons DMC', 'Emerald Stay Hotels', 'SkyLink Consolidators',
    'Coastal Transfers Pvt Ltd', 'Wanderlust Activities', 'SafeTrip Insurance',
  ];
  const supplierRows = await db
    .insert(suppliers)
    .values(
      await Promise.all(
        supplierNames.map(async (name, i) => ({
          supplierCode: await nextCode(db, 'SUPPLIER'),
          name,
          supplierTypeId: supplierTypeRows[i % supplierTypeRows.length]?.id ?? null,
          contactPerson: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
          phone: phoneFor(800 + i),
          email: `contact${i}@supplier.test`,
          city: pick(['Chennai', 'Bengaluru', 'Kochi', 'Mumbai']),
          country: 'India',
        })),
      ),
    )
    .returning();

  await db.insert(supplierRates).values(
    supplierRows.flatMap((s) =>
      Array.from({ length: 3 }, (_, i) => ({
        supplierId: s.id,
        serviceName: pick(['Twin sharing per night', 'Airport transfer', 'Day tour with guide']),
        category: pick(['hotel', 'transfer', 'activity']),
        destination: pick(INTERNATIONAL_DESTINATIONS),
        unit: pick(['per night', 'per person', 'per vehicle']),
        rate: between(2000, 18000) * 100,
        validFrom: '2026-01-01',
        validTo: '2026-12-31',
        sortIndex: i,
      })).map(({ sortIndex: _sortIndex, ...rest }) => rest),
    ),
  );
  console.log(`  suppliers: ${supplierRows.length}`);

  // ── Customers ──────────────────────────────────────────────────────────────
  const CUSTOMER_COUNT = 24;
  const customerRows = [];
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const fullName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    const totalBookings = chance(0.35) ? between(2, 6) : between(0, 1);
    const tier =
      totalBookings >= 5 ? 'PLATINUM' : totalBookings >= 3 ? 'GOLD' : totalBookings >= 1 ? 'SILVER' : 'BRONZE';

    const [row] = await db
      .insert(customers)
      .values({
        customerCode: await nextCode(db, 'CUSTOMER'),
        fullName,
        nameNormalised: normaliseName(fullName),
        primaryPhone: phoneFor(i),
        email: `${fullName.toLowerCase().replace(/\s+/g, '.')}${i}@example.test`,
        city: pick(['Chennai', 'Bengaluru', 'Kochi', 'Coimbatore', 'Madurai', 'Hyderabad']),
        state: pick(['Tamil Nadu', 'Karnataka', 'Kerala', 'Telangana']),
        country: 'India',
        tier: tier as 'BRONZE',
        relationshipScore: Math.min(100, totalBookings * 18 + between(0, 20)),
        ownerId: pick(executives),
        totalBookings,
        lastActivityAt: subDays(new Date(), between(0, 60)).toISOString().slice(0, 10),
        notes: chance(0.4) ? pick(CUSTOMER_NOTES) : null,
      })
      .returning();
    if (row) customerRows.push(row);
  }
  console.log(`  customers: ${customerRows.length}`);

  // Passports, some expiring soon so the alert tiles have real values.
  await db.insert(customerPassports).values(
    customerRows.slice(0, 16).map((c, i) => ({
      customerId: c.id,
      passportNumberMasked: `••••••${String(1000 + i).slice(-4)}`,
      fullNameOnPassport: c.fullName,
      issuedOn: subMonths(new Date(), between(24, 110)).toISOString().slice(0, 10),
      expiresOn: addDays(new Date(), i < 4 ? between(30, 170) : between(400, 2500))
        .toISOString()
        .slice(0, 10),
      placeOfIssue: pick(['Chennai', 'Bengaluru', 'Kochi']),
    })),
  );

  // ── Leads ──────────────────────────────────────────────────────────────────
  const STATUSES = ['OPEN', 'IN_PROGRESS', 'QUOTATION_SENT', 'CONVERTED', 'LOST', 'NO_RESPONSE'] as const;
  const LEAD_COUNT = 62;
  const leadRows = [];

  for (let i = 0; i < LEAD_COUNT; i++) {
    const fullName = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
    // Keep a handful on today and yesterday so the "New Leads Today" tile and
    // its day-over-day comparison have something real to show.
    const createdAt =
      i < 5
        ? subHours(new Date(), between(1, 10))
        : i < 8
          ? subHours(new Date(), between(26, 44))
          : subHours(new Date(), between(48, 24 * 75));
    const isInternational = chance(0.65);
    const destination = isInternational ? pick(INTERNATIONAL_DESTINATIONS) : pick(DOMESTIC_DESTINATIONS);
    const source = pick(sourceRows);
    const status = pick(STATUSES);
    const adults = between(1, 6);
    const children = chance(0.4) ? between(1, 3) : 0;
    const budget = between(35, 600) * 1000 * 100;
    const travelDate = chance(0.85) ? addDays(new Date(), between(-10, 220)) : null;

    // Score roughly tracks the real engine so the seeded mix looks plausible.
    const score = Math.min(
      100,
      Math.round(
        (source.scoreWeight / 100) * 15 +
          (travelDate ? Math.max(0, 25 - Math.abs(between(0, 200)) / 10) : 6) +
          budget / 100 / 25000 +
          (adults + children >= 4 ? 8 : 4) +
          between(0, 18),
      ),
    );
    const classification = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD';
    const assignedTo = chance(0.88) ? pick(executives) : null;
    const linkedCustomer = status === 'CONVERTED' ? pick(customerRows) : chance(0.15) ? pick(customerRows) : null;

    const [row] = await db
      .insert(leads)
      .values({
        leadCode: await nextCode(db, 'LEAD'),
        customerId: linkedCustomer?.id ?? null,
        customerName: fullName,
        nameNormalised: normaliseName(fullName),
        phone: phoneFor(100 + i),
        email: chance(0.7) ? `${fullName.toLowerCase().replace(/\s+/g, '.')}${i}@example.test` : null,
        destination,
        travelDate: travelDate ? travelDate.toISOString().slice(0, 10) : null,
        travelDateFlexible: chance(0.3),
        travellersAdults: adults,
        travellersChildren: children,
        travelTypeId: pick(travelTypeRows).id,
        budgetAmount: budget,
        leadSourceId: source.id,
        status,
        score,
        classification: classification as 'HOT',
        scoreReason: `Scored ${score} — ${classification === 'HOT' ? 'travel date is near and strong budget' : 'limited signal available'}.`,
        scoredAt: createdAt,
        assignedToId: assignedTo,
        assignedAt: assignedTo ? createdAt : null,
        createdById: adminId,
        lastContactAt: chance(0.6) ? subHours(new Date(), between(1, 24 * 20)) : null,
        lastContactChannel: chance(0.6) ? pick(['CALL', 'WHATSAPP', 'EMAIL']) : null,
        convertedAt: status === 'CONVERTED' ? subDays(new Date(), between(1, 40)) : null,
        createdAt,
        notes: chance(0.5) ? pick(FOLLOWUP_NOTES) : null,
      })
      .returning();

    if (!row) continue;
    leadRows.push(row);

    await db.insert(leadScores).values({
      leadId: row.id,
      score,
      classification: classification as 'HOT',
      reason: row.scoreReason,
      factors: { urgency: between(4, 25), budget: between(5, 25), source: between(6, 15) },
      createdById: adminId,
    });

    await db.insert(leadStatusHistory).values({
      leadId: row.id,
      fromStatus: null,
      toStatus: 'OPEN',
      changedById: adminId,
    });
  }
  console.log(`  leads: ${leadRows.length}`);

  // ── Follow-ups (a realistic mix of overdue, today and upcoming) ────────────
  const TYPES = ['CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'QUOTATION_FOLLOWUP', 'DOCUMENT_COLLECTION'] as const;
  const openLeads = leadRows.filter((l) => l.status !== 'CONVERTED' && l.status !== 'LOST');
  let followupCount = 0;

  for (const lead of openLeads) {
    if (!chance(0.75)) continue;

    // ~30% land in the past so the overdue tile is genuinely populated.
    const overdue = chance(0.3);
    const dueAt = overdue
      ? subHours(new Date(), between(2, 24 * 9))
      : addDays(new Date(), between(0, 12));

    await db.insert(followups).values({
      leadId: lead.id,
      assignedToId: lead.assignedToId ?? pick(executives),
      type: pick(TYPES),
      status: overdue ? 'OVERDUE' : 'PENDING',
      priority: pick(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const),
      dueAt,
      description: pick(FOLLOWUP_NOTES),
      createdById: adminId,
    });
    followupCount++;

    await db.update(leads).set({ nextFollowupAt: dueAt }).where(sql`${leads.id} = ${lead.id}`);
  }

  // Completed history, so "follow-ups done this month" is not zero.
  for (const lead of leadRows.slice(0, 30)) {
    const completedAt = subDays(new Date(), between(0, 26));
    await db.insert(followups).values({
      leadId: lead.id,
      assignedToId: lead.assignedToId ?? pick(executives),
      type: pick(TYPES),
      status: 'COMPLETED',
      priority: 'MEDIUM',
      dueAt: subDays(completedAt, 1),
      description: pick(FOLLOWUP_NOTES),
      completedAt,
      completedById: lead.assignedToId ?? adminId,
      outcome: pick(FOLLOWUP_NOTES),
      createdById: adminId,
    });
    followupCount++;
  }
  console.log(`  follow-ups: ${followupCount}`);

  // ── Bookings + payments ────────────────────────────────────────────────────
  const convertedLeads = leadRows.filter((l) => l.status === 'CONVERTED');
  let paymentCount = 0;

  for (const lead of convertedLeads) {
    if (!lead.customerId) continue;
    const total = lead.budgetAmount ?? between(60, 400) * 1000 * 100;
    const received = chance(0.55) ? total : Math.round(total * (between(20, 80) / 100));

    const [booking] = await db
      .insert(bookings)
      .values({
        bookingCode: await nextCode(db, 'BOOKING'),
        customerId: lead.customerId,
        leadId: lead.id,
        status: 'CONFIRMED',
        travelStartDate: lead.travelDate,
        travelEndDate: lead.travelDate
          ? addDays(new Date(lead.travelDate), between(4, 12)).toISOString().slice(0, 10)
          : null,
        totalAmount: total,
        amountReceived: received,
        amountOutstanding: total - received,
        supplierCostTotal: Math.round(total * 0.78),
        confirmedAt: lead.convertedAt,
        ownerId: lead.assignedToId,
        createdById: adminId,
      })
      .returning();

    if (!booking) continue;

    // Split the receipt into an advance and, sometimes, a balance payment.
    const advance = Math.round(received * (chance(0.5) ? 1 : 0.4));
    const parts = advance === received ? [received] : [advance, received - advance];

    for (const [idx, amount] of parts.entries()) {
      if (amount <= 0) continue;
      await db.insert(payments).values({
        paymentCode: await nextCode(db, 'PAYMENT'),
        bookingId: booking.id,
        customerId: lead.customerId,
        amount,
        paymentMethodId: pick(paymentMethodRows).id,
        referenceNumber: `TXN${between(100000, 999999)}`,
        paidOn: subDays(new Date(), between(0, 28) + idx).toISOString().slice(0, 10),
        recordedById: userIdByEmail.get('lakshmi@lemuriaholidays.test') ?? adminId,
      });
      paymentCount++;
    }
  }
  console.log(`  bookings: ${convertedLeads.length}, payments: ${paymentCount}`);

  // ── Visa cases ─────────────────────────────────────────────────────────────
  const STEPS = [
    'CASE_CREATED', 'DOCUMENTS_REQUIRED', 'DOCUMENTS_SUBMITTED', 'DOCUMENTS_VERIFIED',
    'APPOINTMENT_SCHEDULED', 'APPLICATION_SUBMITTED', 'PROCESSING',
  ] as const;

  const opsUserId = userIdByEmail.get('vinod@lemuriaholidays.test') ?? adminId;
  let visaCount = 0;

  for (const customer of customerRows.slice(0, 11)) {
    const country = pick(visaCountryRows);
    const [visaCase] = await db
      .insert(visaCases)
      .values({
        caseCode: await nextCode(db, 'VISA'),
        customerId: customer.id,
        visaCountryId: country.id,
        currentStep: pick(STEPS),
        travelDate: addDays(new Date(), between(20, 130)).toISOString().slice(0, 10),
        governmentFee: between(2000, 12000) * 100,
        serviceFee: between(1000, 3000) * 100,
        assignedToId: opsUserId,
        createdById: adminId,
      })
      .returning();

    if (!visaCase) continue;
    visaCount++;

    await db.insert(visaChecklistItems).values(
      DEFAULT_VISA_CHECKLIST.map((item, idx) => ({
        visaCaseId: visaCase.id,
        label: item.label,
        isMandatory: item.mandatory,
        sortOrder: idx,
        status: idx < between(2, 7) ? 'VERIFIED' : 'PENDING',
      })),
    );
  }
  console.log(`  visa cases: ${visaCount}`);

  console.log('\nSeed complete.');
  console.log(`  Sign in with any address below and password: ${DEMO_PASSWORD}`);
  for (const member of TEAM) console.log(`    ${member.role.padEnd(10)} ${member.email}`);

  await closeDb();
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
