import PDFDocument from 'pdfkit';
import { formatBps } from '@lemuria/shared';

/**
 * Branded quotation PDF.
 *
 * Drawn with PDFKit rather than rendered from HTML: the output is real vector
 * text and shapes, so it stays selectable, searchable and sharp at any zoom,
 * and it does not need a headless browser in the deployment (spec §42).
 */

const BRAND = {
  navy: '#0B3B41',
  teal: '#0D8286',
  tealLight: '#E6F4F4',
  ink: '#12262A',
  inkMid: '#3D5155',
  inkSoft: '#64777B',
  line: '#DDE5E6',
  warn: '#9A6206',
  warnWash: '#FBF0DD',
} as const;

const PAGE = { margin: 48, width: 595.28, height: 841.89 } as const;
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

export interface QuotationPdfPackage {
  name: string;
  description: string | null;
  isRecommended: boolean;
  sellingPrice: number;
  perPersonPrice: number | null;
  travellerCount: number;
  gstAmount: number;
  gstBps: number;
  taxBasis: string;
  netBeforeTax: number;
  discountAmount: number;
  taxIsProvisional: boolean;
  items: { category: string; description: string; quantity: number; dayNumber: number | null }[];
}

export interface QuotationPdfData {
  quotationCode: string;
  title: string;
  destination: string | null;
  travelStartDate: string | null;
  travelEndDate: string | null;
  travellersAdults: number;
  travellersChildren: number;
  validUntil: string | null;
  versionNumber: number;
  customerName: string;
  customerCode: string;
  ownerName: string | null;
  introText: string | null;
  inclusions: string[];
  exclusions: string[];
  termsText: string | null;
  packages: QuotationPdfPackage[];
  generatedOn: Date;
}

/** Indian digit grouping, from integer paise. */
function rupees(paise: number): string {
  const value = Math.round(paise / 100);
  return `INR ${value.toLocaleString('en-IN')}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function renderQuotationPdf(data: QuotationPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE.margin,
      info: {
        Title: `${data.quotationCode} — ${data.title}`,
        Author: 'Lemuria India Holidays',
        Subject: `Travel quotation for ${data.customerName}`,
        Creator: 'Lemuria Travel AI',
      },
      // Required for the footer pass: page numbers cannot be written until the
      // total page count is known, which means revisiting earlier pages.
      bufferPages: true,
      pdfVersion: '1.7',
      lang: 'en-IN',
      displayTitle: true,
    });

    // A PDFDocument is a Readable at runtime, but @types/pdfkit only declares
    // its own 'limit'/'pageAdded' events, so the stream events need the cast.
    const stream = doc as unknown as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);

    try {
      drawHeader(doc, data);
      drawTripSummary(doc, data);
      if (data.introText) drawIntro(doc, data.introText);
      drawPackages(doc, data);
      drawLists(doc, data);
      if (data.termsText) drawTerms(doc, data.termsText);
      drawFooters(doc, data);
      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

type Doc = InstanceType<typeof PDFDocument>;

function drawHeader(doc: Doc, data: QuotationPdfData): void {
  // Brand band
  doc.rect(0, 0, PAGE.width, 108).fill(BRAND.navy);

  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(18)
    .text('LEMURIA', PAGE.margin, 34, { characterSpacing: 2 });

  doc
    .fillColor('#9FDEDD')
    .font('Helvetica')
    .fontSize(8)
    .text('TRAVEL AI', PAGE.margin, 56, { characterSpacing: 3.5 });

  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('QUOTATION', PAGE.margin, 34, { width: CONTENT_WIDTH, align: 'right' });

  doc
    .fillColor('#B3C4C6')
    .font('Helvetica')
    .fontSize(9)
    .text(
      `${data.quotationCode}  ·  Version ${data.versionNumber}`,
      PAGE.margin,
      52,
      { width: CONTENT_WIDTH, align: 'right' },
    )
    .text(`Prepared ${formatDate(data.generatedOn.toISOString().slice(0, 10))}`, PAGE.margin, 66, {
      width: CONTENT_WIDTH,
      align: 'right',
    });

  doc.y = 132;
}

function drawTripSummary(doc: Doc, data: QuotationPdfData): void {
  doc
    .fillColor(BRAND.ink)
    .font('Helvetica-Bold')
    .fontSize(17)
    .text(data.title, PAGE.margin, doc.y, { width: CONTENT_WIDTH });

  doc.moveDown(0.4);

  const travellers = `${data.travellersAdults} adult${data.travellersAdults === 1 ? '' : 's'}${
    data.travellersChildren ? `, ${data.travellersChildren} children` : ''
  }`;

  const facts: [string, string][] = [
    ['Prepared for', data.customerName],
    ['Destination', data.destination ?? '—'],
    [
      'Travel dates',
      data.travelStartDate
        ? `${formatDate(data.travelStartDate)}${data.travelEndDate ? ` – ${formatDate(data.travelEndDate)}` : ''}`
        : 'To be confirmed',
    ],
    ['Travellers', travellers],
  ];

  const top = doc.y + 6;
  const colWidth = CONTENT_WIDTH / 2;

  facts.forEach(([label, value], i) => {
    const x = PAGE.margin + (i % 2) * colWidth;
    const y = top + Math.floor(i / 2) * 34;
    doc.fillColor(BRAND.inkSoft).font('Helvetica').fontSize(7.5).text(label.toUpperCase(), x, y, {
      characterSpacing: 0.8,
      width: colWidth - 12,
    });
    doc
      .fillColor(BRAND.ink)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(value, x, y + 11, { width: colWidth - 12 });
  });

  doc.y = top + Math.ceil(facts.length / 2) * 34 + 6;
  hr(doc);
}

function drawIntro(doc: Doc, intro: string): void {
  doc
    .fillColor(BRAND.inkMid)
    .font('Helvetica')
    .fontSize(10)
    .text(intro, PAGE.margin, doc.y + 10, { width: CONTENT_WIDTH, align: 'left', lineGap: 3 });
  doc.moveDown(0.8);
  hr(doc);
}

function drawPackages(doc: Doc, data: QuotationPdfData): void {
  sectionTitle(doc, data.packages.length > 1 ? 'Your options' : 'Your package');

  for (const pkg of data.packages) {
    ensureSpace(doc, 150);

    const cardTop = doc.y;
    const headerHeight = 46;

    doc.roundedRect(PAGE.margin, cardTop, CONTENT_WIDTH, headerHeight, 6).fill(BRAND.tealLight);

    doc
      .fillColor(BRAND.navy)
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(pkg.name, PAGE.margin + 14, cardTop + 11, { width: CONTENT_WIDTH * 0.55 });

    if (pkg.isRecommended) {
      doc
        .fillColor(BRAND.teal)
        .font('Helvetica-Bold')
        .fontSize(7)
        .text('RECOMMENDED', PAGE.margin + 14, cardTop + 28, { characterSpacing: 1 });
    }

    doc
      .fillColor(BRAND.navy)
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(rupees(pkg.sellingPrice), PAGE.margin, cardTop + 10, {
        width: CONTENT_WIDTH - 14,
        align: 'right',
      });

    if (pkg.perPersonPrice && pkg.travellerCount > 0) {
      doc
        .fillColor(BRAND.inkSoft)
        .font('Helvetica')
        .fontSize(8)
        .text(
          `${rupees(pkg.perPersonPrice)} per person · ${pkg.travellerCount} travellers`,
          PAGE.margin,
          cardTop + 29,
          { width: CONTENT_WIDTH - 14, align: 'right' },
        );
    }

    doc.y = cardTop + headerHeight + 10;

    if (pkg.description) {
      doc
        .fillColor(BRAND.inkMid)
        .font('Helvetica')
        .fontSize(9)
        .text(pkg.description, PAGE.margin + 4, doc.y, { width: CONTENT_WIDTH - 8, lineGap: 2 });
      doc.moveDown(0.5);
    }

    // Line items, two columns on one baseline.
    //
    // `doc.text` advances doc.y on every call, so a two-column row written with
    // two calls would advance it twice and leave a growing gap that eventually
    // spills onto a new page. Track y here and restore it once per row.
    let iy = doc.y;
    for (const item of pkg.items) {
      if (iy + 18 > PAGE.height - 70) {
        doc.addPage();
        iy = doc.y;
      }
      const label = item.dayNumber ? `Day ${item.dayNumber}` : item.category.toLowerCase();
      const description = `${item.description}${item.quantity > 1 ? `  x${item.quantity}` : ''}`;

      doc.font('Helvetica').fontSize(9);
      const rowHeight = doc.heightOfString(description, { width: CONTENT_WIDTH - 80 });

      doc
        .fillColor(BRAND.teal)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(label, PAGE.margin + 6, iy + 1, { width: 62, lineBreak: false });

      doc
        .fillColor(BRAND.inkMid)
        .font('Helvetica')
        .fontSize(9)
        .text(description, PAGE.margin + 74, iy, { width: CONTENT_WIDTH - 80 });

      iy += Math.max(rowHeight, 11) + 3;
    }
    doc.y = iy;

    // Price breakdown, so the customer can see how the total is composed.
    doc.y += 6;
    ensureSpace(doc, 76);
    const breakdownTop = doc.y;
    doc
      .moveTo(PAGE.margin + 4, breakdownTop)
      .lineTo(PAGE.margin + CONTENT_WIDTH - 4, breakdownTop)
      .lineWidth(0.5)
      .stroke(BRAND.line);

    let by = breakdownTop + 8;
    const priceRow = (label: string, value: string, bold = false) => {
      const colour = bold ? BRAND.ink : BRAND.inkSoft;
      const font = bold ? 'Helvetica-Bold' : 'Helvetica';
      const size = bold ? 10 : 9;

      doc
        .fillColor(colour)
        .font(font)
        .fontSize(size)
        .text(label, PAGE.margin + 6, by, { width: CONTENT_WIDTH * 0.6, lineBreak: false });
      doc.text(value, PAGE.margin, by, {
        width: CONTENT_WIDTH - 6,
        align: 'right',
        lineBreak: false,
      });
      by += bold ? 16 : 13;
    };

    priceRow('Package price', rupees(pkg.netBeforeTax + pkg.discountAmount));
    if (pkg.discountAmount > 0) priceRow('Discount', `− ${rupees(pkg.discountAmount)}`);
    if (pkg.taxBasis !== 'EXEMPT' && pkg.gstAmount > 0) {
      priceRow(`GST (${formatBps(pkg.gstBps)})`, rupees(pkg.gstAmount));
    }
    priceRow('Total payable', rupees(pkg.sellingPrice), true);

    doc.y = by + 6;

    if (pkg.taxIsProvisional) {
      doc
        .fillColor(BRAND.warn)
        .font('Helvetica-Oblique')
        .fontSize(7.5)
        .text(
          'Tax shown is indicative and subject to confirmation.',
          PAGE.margin + 6,
          doc.y,
          { width: CONTENT_WIDTH - 12 },
        );
      doc.moveDown(0.4);
    }

    doc.moveDown(0.8);
  }
}

function drawLists(doc: Doc, data: QuotationPdfData): void {
  if (data.inclusions.length === 0 && data.exclusions.length === 0) return;

  ensureSpace(doc, 120);
  hr(doc);

  const colWidth = (CONTENT_WIDTH - 24) / 2;
  const top = doc.y + 12;

  const column = (title: string, entries: string[], x: number, colour: string) => {
    if (entries.length === 0) return top;
    doc
      .fillColor(colour)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(title.toUpperCase(), x, top, { characterSpacing: 1, width: colWidth });

    let y = top + 16;
    for (const entry of entries) {
      doc.fillColor(colour).font('Helvetica').fontSize(9).text('•', x, y, { width: 8 });
      const h = doc.heightOfString(entry, { width: colWidth - 12 });
      doc
        .fillColor(BRAND.inkMid)
        .font('Helvetica')
        .fontSize(9)
        .text(entry, x + 10, y, { width: colWidth - 12, lineGap: 1.5 });
      y += Math.max(h, 12) + 4;
    }
    return y;
  };

  const leftEnd = column('Included', data.inclusions, PAGE.margin, BRAND.teal);
  const rightEnd = column('Not included', data.exclusions, PAGE.margin + colWidth + 24, BRAND.warn);

  doc.y = Math.max(leftEnd, rightEnd) + 8;
}

function drawTerms(doc: Doc, terms: string): void {
  ensureSpace(doc, 110);
  hr(doc);
  sectionTitle(doc, 'Booking terms');
  doc
    .fillColor(BRAND.inkSoft)
    .font('Helvetica')
    .fontSize(8.5)
    .text(terms, PAGE.margin, doc.y, { width: CONTENT_WIDTH, lineGap: 2.5, align: 'left' });
  doc.moveDown(0.6);
}

/**
 * Footers are drawn last, over every page that exists by then — page numbers
 * cannot be written before the page count is known.
 */
function drawFooters(doc: Doc, data: QuotationPdfData): void {
  const range = doc.bufferedPageRange();

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);

    // The footer sits below the normal text area. Writing there with the
    // bottom margin in force makes PDFKit treat it as overflow and append a
    // fresh page — once per page, compounding. Drop the margin for the footer
    // pass and put it back afterwards.
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = PAGE.height - 40;
    doc
      .moveTo(PAGE.margin, y - 10)
      .lineTo(PAGE.width - PAGE.margin, y - 10)
      .lineWidth(0.5)
      .stroke(BRAND.line);

    doc
      .fillColor(BRAND.inkSoft)
      .font('Helvetica')
      .fontSize(7.5)
      .text(
        `Lemuria India Holidays  ·  ${data.quotationCode} v${data.versionNumber}${
          data.validUntil ? `  ·  Valid until ${formatDate(data.validUntil)}` : ''
        }`,
        PAGE.margin,
        y,
        { width: CONTENT_WIDTH * 0.75, lineBreak: false },
      );

    doc.text(`${i - range.start + 1} of ${range.count}`, PAGE.margin, y, {
      width: CONTENT_WIDTH,
      align: 'right',
      lineBreak: false,
    });

    doc.page.margins.bottom = savedBottom;
  }
}

function sectionTitle(doc: Doc, title: string): void {
  doc
    .fillColor(BRAND.navy)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(title, PAGE.margin, doc.y + 12, { width: CONTENT_WIDTH, characterSpacing: 0.3 });
  doc.moveDown(0.6);
}

function hr(doc: Doc): void {
  doc
    .moveTo(PAGE.margin, doc.y + 4)
    .lineTo(PAGE.width - PAGE.margin, doc.y + 4)
    .lineWidth(0.5)
    .stroke(BRAND.line);
  doc.y += 6;
}

/** Starts a new page when the remaining space would split a block awkwardly. */
function ensureSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > PAGE.height - 70) doc.addPage();
}
