# AI

AI assists Lemuria's staff. It never makes an irreversible business decision and
never speaks to a customer without a human approving the words first.

## Provider abstraction

Business logic depends on an `AIProvider` interface, not on a vendor SDK:

```ts
interface AIProvider {
  generate(request: GenerationRequest): Promise<GenerationResult>;
}
```

Implementations are selected by `AI_PROVIDER` and configured entirely from the
environment. The default is `noop`, which returns a "not configured" result — a
missing key degrades a feature, it does not crash a request.

Above that sits `AIService`, which is what modules actually call:

```
generateQuotationContent()   generateItinerary()
generateCommunication()      summarize()
detectMissingDocuments()     scoreLead()
```

Swapping vendors means writing one adapter. No module imports a vendor SDK.

## Lead scoring is deliberately not a model

`scoreLead()` is a deterministic rule engine over travel imminence, budget,
source weight, group size, loyalty, engagement recency and enquiry completeness.

That is a design decision, not a shortcut. A travel executive has to answer "why
is this Hot?" to a manager, and the same lead must score the same way twice. A
model that returns 71 today and 64 tomorrow for unchanged inputs is unusable on
a sales floor.

Scores are stored with their factor breakdown in `lead_scores`, so a past
classification stays explainable. A human override sets `score_is_manual` and
the engine then leaves that lead alone. AI may later *suggest* an adjustment,
recorded as a separate, overridable signal — it will not silently set the number
the floor works from.

## Human approval

Any AI-generated quotation copy, itinerary, covering letter or customer message
follows:

```
GENERATED -> EDITED -> APPROVED -> SENT
```

`ai_generations.status` holds that state. The send path checks for `APPROVED`
and raises `AI_REVIEW_REQUIRED` otherwise. There is no configuration flag that
turns this off — a draft cannot reach a customer by accident.

Every generation records provider, model, redacted prompt summary, output, the
human's edited version, reviewer, token counts, latency, and whether PII was
included.

## Data governance

A context-building layer sits between the database and the provider:

```
entity -> permission check -> select relevant fields -> minimise PII
       -> build prompt -> provider -> validate -> human review
```

Rules:

- Send the **minimum** needed. A quotation draft needs destination, dates,
  traveller count and budget band — not a passport number.
- Passport, visa and identity numbers are **never** sent. They are stored masked
  and the context builder has no access to unmasked values.
- `AI_ALLOW_PII=false` (the default) keeps names and contact details out of
  prompts; templates receive placeholders that are substituted locally after the
  model returns.
- Generations that did include personal fields are flagged `contained_pii` so
  the exposure is auditable.
- Customer data is **not** used for model training. Any provider whose terms
  claim training rights over API inputs must be configured with training
  disabled, or not used.

## LIA — Lemuria Intelligent Assistant

LIA is scoped to controlled tools, not open database access:

```
user -> LIA -> orchestrator -> permission check -> tool -> business service -> data
```

The model never emits SQL and never writes directly. It selects from a
registered tool list; each tool is an ordinary service call subject to the same
RBAC as the equivalent screen. If the user cannot see a lead in the UI, LIA
cannot read it for them either.

Mutations go through the same services as the UI, which means the same
validation, the same state-transition rules and the same audit entries.

## Status

The interfaces, the governance model, the `ai_generations` review table and the
deterministic scoring engine are implemented. The provider adapters and LIA's
tool orchestration ship in a later Phase 1 slice. Until then `AI_PROVIDER`
defaults to `noop`, and nothing in the product claims an AI capability it does
not yet have.
