import { ROLES, type Role } from './enums.js';

/**
 * Permission catalogue. Format: `<resource>.<action>`.
 * Every sensitive API route declares the permission it requires; the server
 * enforces it (spec §27). Frontend uses the same strings only to hide UI.
 */
export const PERMISSIONS = [
  // Leads
  'lead.read', 'lead.read.all', 'lead.create', 'lead.update', 'lead.delete',
  'lead.assign', 'lead.convert', 'lead.score',
  // Follow-ups
  'followup.read', 'followup.create', 'followup.update', 'followup.complete',
  // Customers
  'customer.read', 'customer.create', 'customer.update', 'customer.delete', 'customer.merge',
  // Documents
  'document.read', 'document.upload', 'document.delete', 'document.read.sensitive',
  // Quotations
  'quotation.read', 'quotation.create', 'quotation.update', 'quotation.approve',
  'quotation.send', 'quotation.view_margin',
  // Itineraries
  'itinerary.read', 'itinerary.create', 'itinerary.update', 'itinerary.publish',
  // Visa & passport
  'visa.read', 'visa.create', 'visa.update', 'visa.advance_step',
  'passport.read', 'passport.create', 'passport.update',
  // Communication
  'communication.read', 'communication.send', 'template.manage',
  // Finance
  'finance.read', 'finance.update', 'payment.record', 'supplier.read', 'supplier.manage',
  // Reporting
  'report.read', 'report.export', 'dashboard.read', 'dashboard.read.company',
  // AI
  'ai.use', 'ai.approve',
  // Administration
  'user.read', 'user.manage', 'role.manage', 'masterdata.read', 'masterdata.manage',
  'audit.read', 'settings.manage', 'import.run',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const EXECUTIVE: Permission[] = [
  'lead.read', 'lead.create', 'lead.update', 'lead.convert', 'lead.score',
  'followup.read', 'followup.create', 'followup.update', 'followup.complete',
  'customer.read', 'customer.create', 'customer.update',
  'document.read', 'document.upload',
  'quotation.read', 'quotation.create', 'quotation.update',
  'itinerary.read', 'itinerary.create', 'itinerary.update',
  'visa.read', 'passport.read',
  'communication.read', 'communication.send',
  'dashboard.read', 'report.read',
  'ai.use',
  'masterdata.read',
];

const OPERATIONS: Permission[] = [
  'lead.read', 'customer.read', 'customer.update',
  'document.read', 'document.upload', 'document.read.sensitive',
  'itinerary.read', 'itinerary.create', 'itinerary.update', 'itinerary.publish',
  'visa.read', 'visa.create', 'visa.update', 'visa.advance_step',
  'passport.read', 'passport.create', 'passport.update',
  'followup.read', 'followup.create', 'followup.update', 'followup.complete',
  'communication.read', 'communication.send',
  'dashboard.read', 'report.read',
  'ai.use', 'masterdata.read',
];

const FINANCE: Permission[] = [
  'lead.read', 'customer.read',
  'quotation.read', 'quotation.view_margin',
  'finance.read', 'finance.update', 'payment.record',
  'supplier.read', 'supplier.manage',
  'document.read',
  'dashboard.read', 'report.read', 'report.export',
  'masterdata.read',
];

const MANAGER: Permission[] = [
  ...new Set<Permission>([
    ...EXECUTIVE, ...OPERATIONS, ...FINANCE,
    'lead.read.all', 'lead.assign', 'lead.delete',
    'customer.merge',
    'quotation.approve', 'quotation.send', 'quotation.view_margin',
    'dashboard.read.company', 'report.export',
    'ai.approve', 'user.read', 'audit.read', 'template.manage',
    'masterdata.manage', 'import.run',
  ]),
];

/** Default role → permission mapping. Seeded into the DB; editable at runtime. */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  MANAGER: MANAGER,
  EXECUTIVE: EXECUTIVE,
  OPERATIONS: OPERATIONS,
  FINANCE: FINANCE,
};

export function permissionsForRoles(roles: readonly Role[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) out.add(p);
  return out;
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
