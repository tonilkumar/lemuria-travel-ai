# Quotations

The commercially sensitive module. Three things govern it: the arithmetic is
exact, the price a customer sees was produced by the server, and margin given
away is reviewable.

## The costing engine

`packages/shared/src/domain/quotation-costing.ts`. Pure, no I/O, 32 tests.

```
baseCost      = supplierCost + otherCost
markup        = baseCost x markupBps            (or a flat override)
discount      = (baseCost + markup) x discountBps  (or a flat override)
netBeforeTax  = baseCost + markup - discount
taxableValue  = netBeforeTax | margin | 0        (per the tax basis)
gst           = taxableValue x gstBps
sellingPrice  = netBeforeTax + gst
margin        = markup - discount
marginBps     = margin / netBeforeTax
```

Every amount is **integer paise**, every rate is **basis points**. There is no
floating point anywhere in the file, because the chain above compounds rounding
error into real rupees on an invoice.

It lives in the shared package so the builder UI shows live totals computed by
the *same* function the server persists. Two implementations of this arithmetic
would eventually disagree, and the disagreement would be money.

**Nothing derived is accepted from the client.** The API takes costs, rates and
line items; markup, tax, selling price and margin are computed server-side on
every write. A tampered request cannot produce a quotation whose totals do not
reconcile with its lines.

### Pass-through services

`VISA`, `PERMIT` and `INSURANCE` lines are billed at cost and held out of the
markup base — Lemuria collects a statutory fee on the customer's behalf; it is
not their supply to mark up.

### Rounding

One rounding step per rate application, half-up, away from zero. A test asserts
that components always sum to the total across a range of awkward inputs, and
that `sumCostings` rounds margin identically to `calculateCosting` — an earlier
version truncated in one and rounded in the other, and the same ratio produced
different basis points at package and rollup level.

## Tax is configuration, not code

**Read [OPEN-QUESTIONS.md](OPEN-QUESTIONS.md) first.** Indian travel GST has
more than one defensible treatment and the choice belongs to Lemuria's
accountant, so the code does not contain a rate.

`tax_rates` is a master-data table: a rate in basis points, a basis
(`GROSS` / `MARGIN` / `EXEMPT`), whether input credit applies, and
`is_provisional`. A package snapshots the rate it was priced with rather than
referencing it live, so changing a rate later cannot silently re-price a
quotation the customer has already seen.

Everything seeded today is `is_provisional: true`. While it is:

- the builder shows an amber notice on the package,
- the list marks the row `tax*`,
- **the PDF prints "Tax shown is indicative and subject to confirmation".**

Setting `is_provisional: false` is the one action that removes the caveat, and
it should follow a conversation with an accountant, not a developer's judgement.

When no rate is configured for a category, the resolver falls back to `EXEMPT`
rather than guessing a percentage. Charging a made-up rate is worse than
charging none and having the omission noticed.

## Versions

A quotation owns versions; a version owns package tiers; a tier owns lines.

`DRAFT` and `REJECTED` are editable. Everything from `PENDING_APPROVAL` onward
is frozen — a version the customer has seen cannot be re-priced, and changing
the price means V2. Starting a version deep-copies the previous one, so V2
begins from V1 rather than blank, and both stay on the record.

## Approval

Thresholds live in `settings` (`quotation.highValueThresholdPaise`,
`quotation.minimumMarginBps`) and are seeded as **placeholders**. Submitting
recalculates first — the thresholds may have moved since the last edit, and a
version must never be approved against stale figures — then either:

- trips no rule and goes straight to `APPROVED`, or
- parks in `PENDING_APPROVAL` with the reasons recorded on the version.

`LOSS_MAKING` fires unconditionally, whatever the configured thresholds say.

Three guards, all enforced server-side:

1. **Sending requires `APPROVED`.** A discounted or high-value quote cannot be
   clicked past.
2. **Nobody approves their own submission.** Self-approval would make the whole
   mechanism decorative.
3. **Rejection needs a comment.** "No" without a reason is not reviewable.

Discounting itself needs `quotation.view_margin` — an executive can price, but
giving margin away is a manager's call, and the reason is required on the record.

## Margin visibility

`quotation.view_margin` gates supplier cost, markup and margin. Without it the
API returns `null` for those fields on every route — list, detail, and the line
items — and the UI shows the selling price alone. The PDF builder does not
select cost or margin at all, so there is no path by which they could reach a
customer-facing document.

## AI drafting

Copy only — never prices, never terms invented from nothing.

```
GENERATED -> (edited) -> APPROVED -> written into the version
```

`ai_generations` holds the state. Applying a draft requires `ai.approve`, which
an executive does not hold, and there is no configuration flag that bypasses it.
A draft sits in the UI as a visibly separate block until someone decides.

The context builder sends the minimum: title, destination, dates, traveller
count, package names, selling prices and line descriptions. It does **not**
send cost, margin, supplier names, phone numbers or email addresses, and it
cannot reach passport or identity numbers at all. With `AI_ALLOW_PII=false`
(the default) the customer's name is replaced by a token and stitched back in
locally after the model returns, so it never leaves the building.

`AI_PROVIDER` defaults to `noop`. With no key configured the button explains
itself rather than failing.

## PDF

`quotation-pdf.ts`, drawn with PDFKit. Real vector text — selectable,
searchable, sharp at any zoom — and no headless browser in the deployment.

Two things worth knowing if you edit it:

- `doc.text()` advances `doc.y` on every call, so a two-column row written with
  two calls advances it twice. Fixed-layout blocks track `y` themselves and use
  `lineBreak: false`.
- The footer sits below the bottom margin. Writing there with the margin in
  force makes PDFKit treat it as overflow and append a blank page — once per
  page, compounding. The footer pass drops `page.margins.bottom` and restores it.

## API

See [API.md](API.md) for the endpoint table.
