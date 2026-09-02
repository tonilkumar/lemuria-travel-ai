import { describe, expect, it } from 'vitest';
import { ROLES } from './enums.js';
import { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRoles } from './permissions.js';

describe('RBAC catalogue', () => {
  it('grants ADMIN everything', () => {
    expect(ROLE_PERMISSIONS.ADMIN).toHaveLength(PERMISSIONS.length);
  });

  it('only references permissions that exist in the catalogue', () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });

  it('keeps an EXECUTIVE out of company-wide and approval powers', () => {
    const held = new Set(ROLE_PERMISSIONS.EXECUTIVE);
    expect(held.has('lead.read.all')).toBe(false);
    expect(held.has('lead.assign')).toBe(false);
    expect(held.has('quotation.approve')).toBe(false);
    expect(held.has('quotation.view_margin')).toBe(false);
    expect(held.has('audit.read')).toBe(false);
    expect(held.has('user.manage')).toBe(false);
  });

  it('keeps FINANCE out of editing sales records', () => {
    const held = new Set(ROLE_PERMISSIONS.FINANCE);
    expect(held.has('finance.read')).toBe(true);
    expect(held.has('lead.update')).toBe(false);
    expect(held.has('quotation.create')).toBe(false);
  });

  it('gives OPERATIONS the sensitive-document access visa work needs', () => {
    const held = new Set(ROLE_PERMISSIONS.OPERATIONS);
    expect(held.has('document.read.sensitive')).toBe(true);
    expect(held.has('visa.advance_step')).toBe(true);
    // ...but not the money.
    expect(held.has('payment.record')).toBe(false);
  });

  it('unions permissions across multiple roles', () => {
    const both = permissionsForRoles(['EXECUTIVE', 'FINANCE']);
    expect(both.has('lead.create')).toBe(true);
    expect(both.has('finance.read')).toBe(true);
  });

  it('returns an empty set for no roles', () => {
    expect(permissionsForRoles([]).size).toBe(0);
  });

  it('has no duplicate permission keys', () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });
});
