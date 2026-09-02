import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/auth.js';
import { customers } from '../../db/schema/customers.js';
import {
  quotationItems,
  quotationPackages,
  quotations,
  quotationVersions,
} from '../../db/schema/quotations.js';
import { notFound } from '../../lib/errors.js';
import type { QuotationPdfData } from './quotation-pdf.js';

/**
 * Assembles exactly what the customer-facing PDF may contain.
 *
 * Nothing commercial crosses this boundary: supplier cost, markup and margin
 * are not selected at all, so there is no path by which they could reach a
 * document that goes to a customer. Only the selling price, the discount and
 * the tax the customer is actually charged.
 */
export async function buildPdfData(versionId: string): Promise<QuotationPdfData> {
  const [head] = await db
    .select({
      version: quotationVersions,
      quotation: quotations,
      customerName: customers.fullName,
      customerCode: customers.customerCode,
      ownerName: users.fullName,
    })
    .from(quotationVersions)
    .innerJoin(quotations, eq(quotations.id, quotationVersions.quotationId))
    .leftJoin(customers, eq(customers.id, quotations.customerId))
    .leftJoin(users, eq(users.id, quotations.ownerId))
    .where(eq(quotationVersions.id, versionId))
    .limit(1);

  if (!head) throw notFound('Quotation version');

  const packages = await db
    .select({
      id: quotationPackages.id,
      name: quotationPackages.name,
      description: quotationPackages.description,
      isRecommended: quotationPackages.isRecommended,
      sellingPrice: quotationPackages.sellingPrice,
      perPersonPrice: quotationPackages.perPersonPrice,
      travellerCount: quotationPackages.travellerCount,
      netBeforeTax: quotationPackages.netBeforeTax,
      discountAmount: quotationPackages.discountAmount,
      gstAmount: quotationPackages.gstAmount,
      gstBps: quotationPackages.gstBps,
      taxBasis: quotationPackages.taxBasis,
      taxIsProvisional: quotationPackages.taxIsProvisional,
    })
    .from(quotationPackages)
    .where(eq(quotationPackages.versionId, versionId))
    .orderBy(asc(quotationPackages.sortOrder));

  const items = packages.length
    ? await db
        .select({
          packageId: quotationItems.packageId,
          category: quotationItems.category,
          description: quotationItems.description,
          quantity: quotationItems.quantity,
          dayNumber: quotationItems.dayNumber,
        })
        .from(quotationItems)
        .where(
          inArray(
            quotationItems.packageId,
            packages.map((p) => p.id),
          ),
        )
        .orderBy(asc(quotationItems.sortOrder))
    : [];

  return {
    quotationCode: head.quotation.quotationCode,
    title: head.quotation.title,
    destination: head.quotation.destination,
    travelStartDate: head.quotation.travelStartDate,
    travelEndDate: head.quotation.travelEndDate,
    travellersAdults: head.quotation.travellersAdults,
    travellersChildren: head.quotation.travellersChildren,
    validUntil: head.quotation.validUntil,
    versionNumber: head.version.versionNumber,
    customerName: head.customerName ?? 'Valued customer',
    customerCode: head.customerCode ?? '',
    ownerName: head.ownerName,
    introText: head.version.introText,
    inclusions: head.version.inclusions ?? [],
    exclusions: head.version.exclusions ?? [],
    termsText: head.version.termsText,
    packages: packages.map((p) => ({
      name: p.name,
      description: p.description,
      isRecommended: p.isRecommended,
      sellingPrice: p.sellingPrice,
      perPersonPrice: p.perPersonPrice,
      travellerCount: p.travellerCount,
      netBeforeTax: p.netBeforeTax,
      discountAmount: p.discountAmount,
      gstAmount: p.gstAmount,
      gstBps: p.gstBps,
      taxBasis: p.taxBasis,
      taxIsProvisional: p.taxIsProvisional,
      items: items
        .filter((i) => i.packageId === p.id)
        .map((i) => ({
          category: i.category,
          description: i.description,
          quantity: i.quantity,
          dayNumber: i.dayNumber,
        })),
    })),
    generatedOn: new Date(),
  };
}
