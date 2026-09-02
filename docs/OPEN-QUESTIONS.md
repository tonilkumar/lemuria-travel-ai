# Open questions

Six decisions Lemuria needs to make. Where a default was needed to keep
building, it is named here and is cheap to change — except the first, which
should not be left to a default.

Full context: the [Phase 1 build assessment](https://claude.ai/code/artifact/a7cd48d0-f52a-4a08-a3a6-e61816a95f60).

---

## 1. GST treatment — blocks the quotation module

**The costing engine currently defaults to 5% (`gstBps: 500`). That is a
placeholder, not a decision.**

Indian travel GST is genuinely ambiguous: 5% without input tax credit, 18% with
it, and a separate tour-operator margin scheme — applied differently to domestic
versus outbound, and to packages versus standalone services.

A wrong rate produces wrong invoices at scale, and the error surfaces at filing
rather than at issue. This needs Lemuria's CA to confirm the treatment per
service type before the quotation module ships.

Where it lives: `quotation_packages.gst_bps`, defaulted in
`apps/api/src/db/schema/quotations.ts`.

## 2. Quotation approval thresholds

The proposal requires high-value and discounted quotes to enter an approval
workflow, but names no numbers. `quotation_approvals.trigger_reason` records
*why* approval was required; the thresholds themselves are unset.

**Needed:** the rupee value above which a quote needs a manager, and the margin
floor below which it does. Both should land in `settings` so they stay
adjustable without a release.

## 3. Lead scoring calibration

Scoring is a deterministic rule engine — deliberately, so a manager can be told
why a lead is Hot and the same lead scores the same twice. The weights across
travel imminence, budget, source and engagement are a reasoned first cut, not a
model fitted to Lemuria's data.

**Needed:** historical conversion data to calibrate against, or a review with
the sales floor after a month of live use.

Where it lives: `apps/api/src/modules/leads/scoring.service.ts`, with tests
covering bounds, determinism and the direction of each signal.

## 4. WhatsApp Business API onboarding — a lead time, not a task

Business verification and per-template approval by Meta take days to weeks and
sit outside the build. Only the official Business Cloud API / BSP route is being
used; no unofficial automation.

**Needed:** start BSP onboarding now, in parallel, so it does not gate the
communication slice.

## 5. AI provider and its terms

The code is provider-agnostic and `AI_PROVIDER` defaults to `noop`, so nothing
is sent anywhere today. Customer data must not be used for model training, which
is contractual as much as technical.

**Needed:** a chosen provider and a reviewed agreement confirming no training on
API inputs, before any customer data reaches it. See [AI.md](AI.md) for the
governance model already implemented around it.

## 6. Visa checklists are seeded generic

All 26 countries are seeded with a common tourist checklist. Real requirements
differ per country, visa type and applicant profile.

This is a content dependency, not a code one — `visa_checklist_templates` and
its items are already database-driven and admin-editable, and items are copied
onto a case at creation so editing a template never rewrites a live case.

**Needed:** the real checklists from Lemuria's visa desk.

---

## Also worth flagging

**Migration assumes one cleansing round.** The proposal budgets a single
cleansing and trial migration. Legacy data with inconsistent phone formats or
duplicate records routinely needs more. Get an export sample early, so the real
state is known before the migration window rather than during it.

**Gaps stated honestly.** MFA is schema-ready but not enforced. Application-level
document encryption is configured but not applied. There is no dependency
scanning in CI, and automated backups are a deployment responsibility not yet
set up. None of these should be described as complete until they are — see
[SECURITY.md](SECURITY.md).
