CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_category" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"rate_bps" integer NOT NULL,
	"basis" varchar(12) DEFAULT 'GROSS' NOT NULL,
	"input_credit_allowed" boolean DEFAULT false NOT NULL,
	"applies_to_domestic" boolean,
	"is_provisional" boolean DEFAULT true NOT NULL,
	"authority_note" text,
	"effective_from" date,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "quotation_packages" ALTER COLUMN "gst_bps" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "base_cost" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "markup_override" bigint;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "discount_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "discount_override" bigint;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "discount_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "discount_reason" text;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "net_before_tax" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "tax_rate_id" uuid;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "tax_basis" varchar(12) DEFAULT 'GROSS' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "taxable_value" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "tax_is_provisional" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "margin_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "margin_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "traveller_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD COLUMN "per_person_price" bigint;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD COLUMN "total_discount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD COLUMN "total_net_before_tax" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD COLUMN "approval_triggers" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD COLUMN "tax_is_provisional" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "tax_rates_category_idx" ON "tax_rates" USING btree ("service_category","is_active");--> statement-breakpoint
CREATE INDEX "tax_rates_effective_idx" ON "tax_rates" USING btree ("effective_from","effective_to");