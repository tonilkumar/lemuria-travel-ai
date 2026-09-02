CREATE TYPE "public"."ai_review_status" AS ENUM('GENERATED', 'EDITED', 'APPROVED', 'REJECTED', 'SENT');--> statement-breakpoint
CREATE TYPE "public"."communication_channel" AS ENUM('WHATSAPP', 'EMAIL', 'PHONE', 'SMS', 'IN_PERSON');--> statement-breakpoint
CREATE TYPE "public"."communication_direction" AS ENUM('INBOUND', 'OUTBOUND');--> statement-breakpoint
CREATE TYPE "public"."customer_tier" AS ENUM('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('PASSPORT', 'VISA', 'PHOTO', 'IDENTITY_PROOF', 'QUOTATION', 'ITINERARY', 'INVOICE', 'RECEIPT', 'TICKET', 'TRAVEL_DOCUMENT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."followup_status" AS ENUM('PENDING', 'COMPLETED', 'OVERDUE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."followup_type" AS ENUM('CALL', 'WHATSAPP', 'EMAIL', 'MEETING', 'DOCUMENT_COLLECTION', 'QUOTATION_FOLLOWUP', 'PAYMENT_FOLLOWUP', 'VISA_FOLLOWUP', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."lead_classification" AS ENUM('HOT', 'WARM', 'COLD');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('OPEN', 'IN_PROGRESS', 'QUOTATION_SENT', 'CONVERTED', 'LOST', 'NO_RESPONSE');--> statement-breakpoint
CREATE TYPE "public"."passport_application_type" AS ENUM('NEW', 'RENEWAL', 'TATKAL');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."quotation_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."visa_workflow_step" AS ENUM('CASE_CREATED', 'DOCUMENTS_REQUIRED', 'DOCUMENTS_SUBMITTED', 'DOCUMENTS_VERIFIED', 'APPOINTMENT_SCHEDULED', 'APPLICATION_SUBMITTED', 'BIOMETRICS_COMPLETED', 'PROCESSING', 'DECISION_RECEIVED', 'PASSPORT_COLLECTED', 'DELIVERED_TO_CUSTOMER', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(64) NOT NULL,
	"resource" varchar(32) NOT NULL,
	"action" varchar(32) NOT NULL,
	"description" text,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_token_id" uuid,
	"user_agent" text,
	"ip_address" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(32) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by_id" uuid,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_code" varchar(32),
	"full_name" varchar(160) NOT NULL,
	"email" varchar(254) NOT NULL,
	"phone" varchar(20),
	"designation" varchar(120),
	"avatar_url" text,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"password_changed_at" timestamp with time zone,
	"mfa_secret" text,
	"mfa_enabled_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"failed_login_attempts" varchar(8) DEFAULT '0' NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_employee_code_unique" UNIQUE("employee_code")
);
--> statement-breakpoint
CREATE TABLE "destinations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"country_code" varchar(2),
	"region" varchar(80),
	"is_domestic" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lead_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(80) NOT NULL,
	"colour" varchar(9),
	"icon" varchar(40),
	"score_weight" integer DEFAULT 50 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(80) NOT NULL,
	"requires_reference" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(80) NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "supplier_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(80) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "travel_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(80) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visa_checklist_template_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"label" varchar(200) NOT NULL,
	"description" text,
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visa_checklist_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visa_country_id" uuid NOT NULL,
	"visa_type_id" uuid,
	"name" varchar(120) NOT NULL,
	"applies_when" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visa_countries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"name" varchar(120) NOT NULL,
	"processing_days_min" integer,
	"processing_days_max" integer,
	"embassy_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visa_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visa_country_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"validity_days" integer,
	"entry_type" varchar(20),
	"government_fee_paise" integer,
	"service_fee_paise" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"relationship" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"primary_customer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"meal_preference" varchar(40),
	"seat_preference" varchar(40),
	"hotel_category" varchar(40),
	"room_preference" varchar(40),
	"interests" jsonb DEFAULT '[]'::jsonb,
	"dietary_restrictions" text,
	"accessibility_needs" text,
	"preferred_language" varchar(40),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_code" varchar(32) NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"name_normalised" varchar(160) NOT NULL,
	"salutation" varchar(12),
	"date_of_birth" date,
	"gender" varchar(20),
	"nationality" varchar(60) DEFAULT 'Indian',
	"primary_phone" varchar(20) NOT NULL,
	"alternate_phone" varchar(20),
	"email" varchar(254),
	"address_line1" text,
	"address_line2" text,
	"city" varchar(80),
	"state" varchar(80),
	"postal_code" varchar(16),
	"country" varchar(80) DEFAULT 'India',
	"tier" "customer_tier" DEFAULT 'BRONZE' NOT NULL,
	"relationship_score" integer DEFAULT 0 NOT NULL,
	"owner_id" uuid,
	"group_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"first_booking_at" date,
	"last_booking_at" date,
	"last_activity_at" date,
	"total_bookings" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"customer_id" uuid,
	"assigned_to_id" uuid,
	"type" "followup_type" NOT NULL,
	"status" "followup_status" DEFAULT 'PENDING' NOT NULL,
	"priority" "priority" DEFAULT 'MEDIUM' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_id" uuid,
	"outcome" text,
	"previous_followup_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lead_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_user_id" uuid,
	"to_user_id" uuid,
	"assigned_by_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"classification" "lead_classification" NOT NULL,
	"reason" text,
	"factors" jsonb,
	"is_manual" boolean DEFAULT false NOT NULL,
	"ai_provider" varchar(40),
	"ai_model" varchar(80),
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_status" "lead_status",
	"to_status" "lead_status" NOT NULL,
	"reason" text,
	"changed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_code" varchar(32) NOT NULL,
	"customer_id" uuid,
	"customer_name" varchar(160) NOT NULL,
	"name_normalised" varchar(160) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" varchar(254),
	"destination" varchar(160),
	"travel_date" date,
	"travel_date_flexible" boolean DEFAULT false NOT NULL,
	"travellers_adults" integer DEFAULT 1 NOT NULL,
	"travellers_children" integer DEFAULT 0 NOT NULL,
	"travel_type_id" uuid,
	"budget_amount" bigint,
	"budget_currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"lead_source_id" uuid NOT NULL,
	"status" "lead_status" DEFAULT 'OPEN' NOT NULL,
	"lost_reason" text,
	"score" integer DEFAULT 0 NOT NULL,
	"classification" "lead_classification" DEFAULT 'COLD' NOT NULL,
	"score_reason" text,
	"scored_at" timestamp with time zone,
	"score_is_manual" boolean DEFAULT false NOT NULL,
	"assigned_to_id" uuid,
	"assigned_at" timestamp with time zone,
	"created_by_id" uuid,
	"next_followup_at" timestamp with time zone,
	"last_contact_at" timestamp with time zone,
	"last_contact_channel" varchar(20),
	"converted_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid,
	"customer_id" uuid,
	"body" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "document_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(20) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"checksum_sha256" varchar(64),
	"replaced_reason" text,
	"uploaded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_code" varchar(32) NOT NULL,
	"customer_id" uuid,
	"entity_type" varchar(40),
	"entity_id" uuid,
	"type" "document_type" NOT NULL,
	"title" varchar(200) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" varchar(64),
	"storage_driver" varchar(16) NOT NULL,
	"storage_key" text NOT NULL,
	"is_encrypted" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"expires_on" date,
	"reference_number_masked" varchar(40),
	"uploaded_by_id" uuid,
	"verified_by_id" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quotation_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"requested_by_id" uuid,
	"decided_by_id" uuid,
	"decision" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"trigger_reason" varchar(60),
	"comments" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"category" varchar(40) NOT NULL,
	"description" varchar(300) NOT NULL,
	"supplier_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_cost" bigint DEFAULT 0 NOT NULL,
	"total_cost" bigint DEFAULT 0 NOT NULL,
	"day_number" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quotation_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"supplier_cost" bigint DEFAULT 0 NOT NULL,
	"other_cost" bigint DEFAULT 0 NOT NULL,
	"markup_amount" bigint DEFAULT 0 NOT NULL,
	"markup_bps" integer DEFAULT 0 NOT NULL,
	"gst_bps" integer DEFAULT 500 NOT NULL,
	"gst_amount" bigint DEFAULT 0 NOT NULL,
	"selling_price" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quotation_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"status" "quotation_status" DEFAULT 'DRAFT' NOT NULL,
	"intro_text" text,
	"inclusions" jsonb DEFAULT '[]'::jsonb,
	"exclusions" jsonb DEFAULT '[]'::jsonb,
	"terms_text" text,
	"total_supplier_cost" bigint DEFAULT 0 NOT NULL,
	"total_other_cost" bigint DEFAULT 0 NOT NULL,
	"total_markup" bigint DEFAULT 0 NOT NULL,
	"total_taxable" bigint DEFAULT 0 NOT NULL,
	"total_gst" bigint DEFAULT 0 NOT NULL,
	"total_selling_price" bigint DEFAULT 0 NOT NULL,
	"margin_amount" bigint DEFAULT 0 NOT NULL,
	"margin_bps" integer DEFAULT 0 NOT NULL,
	"ai_generation_id" uuid,
	"pdf_document_id" uuid,
	"created_by_id" uuid,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_code" varchar(32) NOT NULL,
	"lead_id" uuid,
	"customer_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"destination" varchar(160),
	"travel_start_date" date,
	"travel_end_date" date,
	"travellers_adults" integer DEFAULT 1 NOT NULL,
	"travellers_children" integer DEFAULT 0 NOT NULL,
	"current_version_id" uuid,
	"status" "quotation_status" DEFAULT 'DRAFT' NOT NULL,
	"valid_until" date,
	"owner_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "itineraries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itinerary_code" varchar(32) NOT NULL,
	"customer_id" uuid,
	"lead_id" uuid,
	"quotation_id" uuid,
	"title" varchar(200) NOT NULL,
	"destination" varchar(160),
	"start_date" date,
	"end_date" date,
	"duration_days" integer,
	"travellers_adults" integer DEFAULT 1 NOT NULL,
	"travellers_children" integer DEFAULT 0 NOT NULL,
	"interests" jsonb DEFAULT '[]'::jsonb,
	"owner_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "itinerary_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"date" date,
	"title" varchar(200) NOT NULL,
	"description" text,
	"city" varchar(120),
	"hotel_name" varchar(200),
	"meal_plan" varchar(40),
	"activities" jsonb DEFAULT '[]'::jsonb,
	"transport" jsonb DEFAULT '[]'::jsonb,
	"image_urls" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "itinerary_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"itinerary_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"variant" varchar(20) DEFAULT 'SALES' NOT NULL,
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"cover_title" varchar(200),
	"cover_image_url" text,
	"summary_text" text,
	"inclusions" jsonb DEFAULT '[]'::jsonb,
	"exclusions" jsonb DEFAULT '[]'::jsonb,
	"travel_tips" jsonb DEFAULT '[]'::jsonb,
	"ai_generation_id" uuid,
	"pdf_document_id" uuid,
	"published_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_passports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"passport_number_masked" varchar(40) NOT NULL,
	"passport_number_hash" varchar(64),
	"full_name_on_passport" varchar(200),
	"nationality" varchar(60) DEFAULT 'Indian',
	"issued_on" date,
	"expires_on" date,
	"place_of_issue" varchar(120),
	"document_id" uuid,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "passport_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_code" varchar(32) NOT NULL,
	"customer_id" uuid NOT NULL,
	"application_type" "passport_application_type" NOT NULL,
	"status" varchar(30) DEFAULT 'DOCUMENTS_PENDING' NOT NULL,
	"application_number" varchar(40),
	"appointment_at" timestamp with time zone,
	"appointment_location" varchar(200),
	"police_verification_status" varchar(30),
	"police_verification_at" timestamp with time zone,
	"government_fee" bigint DEFAULT 0 NOT NULL,
	"service_fee" bigint DEFAULT 0 NOT NULL,
	"fee_collected" bigint DEFAULT 0 NOT NULL,
	"assigned_to_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "passport_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passport_case_id" uuid NOT NULL,
	"from_status" varchar(30),
	"to_status" varchar(30) NOT NULL,
	"notes" text,
	"changed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visa_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_code" varchar(32) NOT NULL,
	"customer_id" uuid NOT NULL,
	"visa_country_id" uuid NOT NULL,
	"visa_type_id" uuid,
	"checklist_template_id" uuid,
	"current_step" "visa_workflow_step" DEFAULT 'CASE_CREATED' NOT NULL,
	"travel_date" date,
	"appointment_at" timestamp with time zone,
	"appointment_location" varchar(200),
	"decision" varchar(20),
	"decision_at" timestamp with time zone,
	"decision_notes" text,
	"visa_number_masked" varchar(40),
	"visa_valid_from" date,
	"visa_valid_to" date,
	"government_fee" bigint DEFAULT 0 NOT NULL,
	"service_fee" bigint DEFAULT 0 NOT NULL,
	"fee_collected" bigint DEFAULT 0 NOT NULL,
	"assigned_to_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visa_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visa_case_id" uuid NOT NULL,
	"label" varchar(200) NOT NULL,
	"description" text,
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"document_id" uuid,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"verified_by_id" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "visa_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visa_case_id" uuid NOT NULL,
	"from_step" "visa_workflow_step",
	"to_step" "visa_workflow_step" NOT NULL,
	"notes" text,
	"changed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"channel" "communication_channel" NOT NULL,
	"direction" "communication_direction" NOT NULL,
	"external_id" varchar(128),
	"body" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"template_id" uuid,
	"status" varchar(20) DEFAULT 'QUEUED' NOT NULL,
	"failure_reason" text,
	"sent_by_id" uuid,
	"ai_generation_id" uuid,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "communication_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"channel" "communication_channel" NOT NULL,
	"category" varchar(40),
	"subject" varchar(300),
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"provider_template_name" varchar(120),
	"provider_approval_status" varchar(30),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "communication_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "communication_channel" NOT NULL,
	"customer_id" uuid,
	"lead_id" uuid,
	"external_address" varchar(254) NOT NULL,
	"subject" varchar(300),
	"last_message_at" timestamp with time zone,
	"unread_count" varchar(8) DEFAULT '0' NOT NULL,
	"assigned_to_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_code" varchar(32) NOT NULL,
	"customer_id" uuid NOT NULL,
	"lead_id" uuid,
	"quotation_id" uuid,
	"quotation_version_id" uuid,
	"itinerary_id" uuid,
	"status" varchar(20) DEFAULT 'CONFIRMED' NOT NULL,
	"travel_start_date" date,
	"travel_end_date" date,
	"total_amount" bigint DEFAULT 0 NOT NULL,
	"amount_received" bigint DEFAULT 0 NOT NULL,
	"amount_outstanding" bigint DEFAULT 0 NOT NULL,
	"supplier_cost_total" bigint DEFAULT 0 NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"owner_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_code" varchar(32) NOT NULL,
	"booking_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"payment_method_id" uuid,
	"reference_number" varchar(120),
	"paid_on" date NOT NULL,
	"notes" text,
	"is_refund" boolean DEFAULT false NOT NULL,
	"reverses_payment_id" uuid,
	"receipt_document_id" uuid,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "supplier_payables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"description" varchar(300),
	"amount" bigint DEFAULT 0 NOT NULL,
	"amount_paid" bigint DEFAULT 0 NOT NULL,
	"due_on" date,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "supplier_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"service_name" varchar(200) NOT NULL,
	"category" varchar(40),
	"destination" varchar(160),
	"unit" varchar(40),
	"rate" bigint DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_code" varchar(32) NOT NULL,
	"name" varchar(200) NOT NULL,
	"supplier_type_id" uuid,
	"contact_person" varchar(160),
	"phone" varchar(20),
	"email" varchar(254),
	"city" varchar(80),
	"country" varchar(80),
	"gst_number" varchar(20),
	"payment_terms" varchar(120),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(40) NOT NULL,
	"entity_type" varchar(40),
	"entity_id" uuid,
	"provider" varchar(40) NOT NULL,
	"model" varchar(80) NOT NULL,
	"prompt_summary" text,
	"output_text" text,
	"edited_text" text,
	"status" "ai_review_status" DEFAULT 'GENERATED' NOT NULL,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"contained_pii" boolean DEFAULT false NOT NULL,
	"requested_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_email" varchar(254),
	"action" varchar(60) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" uuid,
	"entity_code" varchar(40),
	"changed_fields" jsonb,
	"old_values" jsonb,
	"new_values" jsonb,
	"summary" text,
	"ip_address" varchar(45),
	"user_agent" text,
	"request_id" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(40) NOT NULL,
	"year" integer NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"channel" varchar(20) NOT NULL,
	"subject" varchar(200),
	"body" text NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"entity_type" varchar(40),
	"entity_id" uuid,
	"link_path" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_checklist_template_items" ADD CONSTRAINT "visa_checklist_template_items_template_id_visa_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."visa_checklist_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_checklist_templates" ADD CONSTRAINT "visa_checklist_templates_visa_country_id_visa_countries_id_fk" FOREIGN KEY ("visa_country_id") REFERENCES "public"."visa_countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_checklist_templates" ADD CONSTRAINT "visa_checklist_templates_visa_type_id_visa_types_id_fk" FOREIGN KEY ("visa_type_id") REFERENCES "public"."visa_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_types" ADD CONSTRAINT "visa_types_visa_country_id_visa_countries_id_fk" FOREIGN KEY ("visa_country_id") REFERENCES "public"."visa_countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_group_id_customer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_primary_customer_id_customers_id_fk" FOREIGN KEY ("primary_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_preferences" ADD CONSTRAINT "customer_preferences_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_scores" ADD CONSTRAINT "lead_scores_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_travel_type_id_travel_types_id_fk" FOREIGN KEY ("travel_type_id") REFERENCES "public"."travel_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_lead_source_id_lead_sources_id_fk" FOREIGN KEY ("lead_source_id") REFERENCES "public"."lead_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_log" ADD CONSTRAINT "document_access_log_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_access_log" ADD CONSTRAINT "document_access_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_approvals" ADD CONSTRAINT "quotation_approvals_version_id_quotation_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."quotation_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_approvals" ADD CONSTRAINT "quotation_approvals_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_approvals" ADD CONSTRAINT "quotation_approvals_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_package_id_quotation_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."quotation_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_packages" ADD CONSTRAINT "quotation_packages_version_id_quotation_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."quotation_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itineraries" ADD CONSTRAINT "itineraries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_version_id_itinerary_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."itinerary_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_versions" ADD CONSTRAINT "itinerary_versions_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_versions" ADD CONSTRAINT "itinerary_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_passports" ADD CONSTRAINT "customer_passports_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_passports" ADD CONSTRAINT "customer_passports_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_cases" ADD CONSTRAINT "passport_cases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_cases" ADD CONSTRAINT "passport_cases_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_cases" ADD CONSTRAINT "passport_cases_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_status_history" ADD CONSTRAINT "passport_status_history_passport_case_id_passport_cases_id_fk" FOREIGN KEY ("passport_case_id") REFERENCES "public"."passport_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passport_status_history" ADD CONSTRAINT "passport_status_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_visa_country_id_visa_countries_id_fk" FOREIGN KEY ("visa_country_id") REFERENCES "public"."visa_countries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_visa_type_id_visa_types_id_fk" FOREIGN KEY ("visa_type_id") REFERENCES "public"."visa_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_checklist_template_id_visa_checklist_templates_id_fk" FOREIGN KEY ("checklist_template_id") REFERENCES "public"."visa_checklist_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_checklist_items" ADD CONSTRAINT "visa_checklist_items_visa_case_id_visa_cases_id_fk" FOREIGN KEY ("visa_case_id") REFERENCES "public"."visa_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_checklist_items" ADD CONSTRAINT "visa_checklist_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_checklist_items" ADD CONSTRAINT "visa_checklist_items_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_status_history" ADD CONSTRAINT "visa_status_history_visa_case_id_visa_cases_id_fk" FOREIGN KEY ("visa_case_id") REFERENCES "public"."visa_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_status_history" ADD CONSTRAINT "visa_status_history_changed_by_id_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_thread_id_communication_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."communication_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_quotation_version_id_quotation_versions_id_fk" FOREIGN KEY ("quotation_version_id") REFERENCES "public"."quotation_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_itinerary_id_itineraries_id_fk" FOREIGN KEY ("itinerary_id") REFERENCES "public"."itineraries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_document_id_documents_id_fk" FOREIGN KEY ("receipt_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payables" ADD CONSTRAINT "supplier_payables_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payables" ADD CONSTRAINT "supplier_payables_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_rates" ADD CONSTRAINT "supplier_rates_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_supplier_type_id_supplier_types_id_fk" FOREIGN KEY ("supplier_type_id") REFERENCES "public"."supplier_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_idx" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique_idx" ON "users" USING btree ("email") WHERE "users"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "users_active_idx" ON "users" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "destinations_name_idx" ON "destinations" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_sources_key_idx" ON "lead_sources" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_key_idx" ON "payment_methods" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "settings_key_idx" ON "settings" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_types_key_idx" ON "supplier_types" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "travel_types_key_idx" ON "travel_types" USING btree ("key");--> statement-breakpoint
CREATE INDEX "visa_checklist_items_template_idx" ON "visa_checklist_template_items" USING btree ("template_id","sort_order");--> statement-breakpoint
CREATE INDEX "visa_checklist_templates_country_idx" ON "visa_checklist_templates" USING btree ("visa_country_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visa_countries_code_idx" ON "visa_countries" USING btree ("country_code");--> statement-breakpoint
CREATE UNIQUE INDEX "visa_types_country_key_idx" ON "visa_types" USING btree ("visa_country_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_group_members_unique_idx" ON "customer_group_members" USING btree ("group_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_preferences_customer_idx" ON "customer_preferences" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_code_idx" ON "customers" USING btree ("customer_code");--> statement-breakpoint
CREATE INDEX "customers_phone_idx" ON "customers" USING btree ("primary_phone");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customers_name_normalised_idx" ON "customers" USING btree ("name_normalised");--> statement-breakpoint
CREATE INDEX "customers_owner_idx" ON "customers" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "customers_tier_idx" ON "customers" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "followups_lead_idx" ON "followups" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "followups_customer_idx" ON "followups" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "followups_assigned_status_due_idx" ON "followups" USING btree ("assigned_to_id","status","due_at");--> statement-breakpoint
CREATE INDEX "followups_status_due_idx" ON "followups" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "lead_assignments_lead_idx" ON "lead_assignments" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_scores_lead_idx" ON "lead_scores" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_status_history_lead_idx" ON "lead_status_history" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "leads_code_idx" ON "leads" USING btree ("lead_code");--> statement-breakpoint
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "leads_email_idx" ON "leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "leads_name_normalised_idx" ON "leads" USING btree ("name_normalised");--> statement-breakpoint
CREATE INDEX "leads_customer_idx" ON "leads" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "leads_status_created_idx" ON "leads" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "leads_assigned_status_idx" ON "leads" USING btree ("assigned_to_id","status");--> statement-breakpoint
CREATE INDEX "leads_classification_idx" ON "leads" USING btree ("classification");--> statement-breakpoint
CREATE INDEX "leads_source_idx" ON "leads" USING btree ("lead_source_id");--> statement-breakpoint
CREATE INDEX "leads_next_followup_idx" ON "leads" USING btree ("next_followup_at");--> statement-breakpoint
CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notes_lead_idx" ON "notes" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "notes_customer_idx" ON "notes" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "document_access_log_document_idx" ON "document_access_log" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "document_versions_document_idx" ON "document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "documents_code_idx" ON "documents" USING btree ("document_code");--> statement-breakpoint
CREATE INDEX "documents_customer_type_idx" ON "documents" USING btree ("customer_id","type");--> statement-breakpoint
CREATE INDEX "documents_entity_idx" ON "documents" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "documents_expiry_idx" ON "documents" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "quotation_approvals_version_idx" ON "quotation_approvals" USING btree ("version_id","created_at");--> statement-breakpoint
CREATE INDEX "quotation_items_package_idx" ON "quotation_items" USING btree ("package_id","sort_order");--> statement-breakpoint
CREATE INDEX "quotation_packages_version_idx" ON "quotation_packages" USING btree ("version_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_versions_unique_idx" ON "quotation_versions" USING btree ("quotation_id","version_number");--> statement-breakpoint
CREATE INDEX "quotation_versions_quotation_idx" ON "quotation_versions" USING btree ("quotation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_code_idx" ON "quotations" USING btree ("quotation_code");--> statement-breakpoint
CREATE INDEX "quotations_customer_idx" ON "quotations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "quotations_lead_idx" ON "quotations" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "quotations_status_idx" ON "quotations" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "itineraries_code_idx" ON "itineraries" USING btree ("itinerary_code");--> statement-breakpoint
CREATE INDEX "itineraries_customer_idx" ON "itineraries" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "itineraries_quotation_idx" ON "itineraries" USING btree ("quotation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "itinerary_days_unique_idx" ON "itinerary_days" USING btree ("version_id","day_number");--> statement-breakpoint
CREATE UNIQUE INDEX "itinerary_versions_unique_idx" ON "itinerary_versions" USING btree ("itinerary_id","variant","version_number");--> statement-breakpoint
CREATE INDEX "itinerary_versions_itinerary_idx" ON "itinerary_versions" USING btree ("itinerary_id");--> statement-breakpoint
CREATE INDEX "customer_passports_customer_idx" ON "customer_passports" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_passports_expiry_idx" ON "customer_passports" USING btree ("expires_on");--> statement-breakpoint
CREATE UNIQUE INDEX "passport_cases_code_idx" ON "passport_cases" USING btree ("case_code");--> statement-breakpoint
CREATE INDEX "passport_cases_customer_idx" ON "passport_cases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "passport_cases_status_idx" ON "passport_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "passport_status_history_case_idx" ON "passport_status_history" USING btree ("passport_case_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "visa_cases_code_idx" ON "visa_cases" USING btree ("case_code");--> statement-breakpoint
CREATE INDEX "visa_cases_customer_idx" ON "visa_cases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "visa_cases_step_idx" ON "visa_cases" USING btree ("current_step");--> statement-breakpoint
CREATE INDEX "visa_cases_assigned_idx" ON "visa_cases" USING btree ("assigned_to_id","current_step");--> statement-breakpoint
CREATE INDEX "visa_cases_travel_date_idx" ON "visa_cases" USING btree ("travel_date");--> statement-breakpoint
CREATE INDEX "visa_checklist_items_case_idx" ON "visa_checklist_items" USING btree ("visa_case_id","sort_order");--> statement-breakpoint
CREATE INDEX "visa_status_history_case_idx" ON "visa_status_history" USING btree ("visa_case_id","created_at");--> statement-breakpoint
CREATE INDEX "communication_messages_thread_idx" ON "communication_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_messages_external_idx" ON "communication_messages" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "communication_messages_status_idx" ON "communication_messages" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_templates_key_idx" ON "communication_templates" USING btree ("key","channel");--> statement-breakpoint
CREATE INDEX "communication_threads_customer_idx" ON "communication_threads" USING btree ("customer_id","last_message_at");--> statement-breakpoint
CREATE INDEX "communication_threads_lead_idx" ON "communication_threads" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "communication_threads_address_idx" ON "communication_threads" USING btree ("channel","external_address");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_code_idx" ON "bookings" USING btree ("booking_code");--> statement-breakpoint
CREATE INDEX "bookings_customer_idx" ON "bookings" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "bookings_travel_dates_idx" ON "bookings" USING btree ("travel_start_date");--> statement-breakpoint
CREATE INDEX "bookings_outstanding_idx" ON "bookings" USING btree ("amount_outstanding");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_code_idx" ON "payments" USING btree ("payment_code");--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id","paid_on");--> statement-breakpoint
CREATE INDEX "payments_customer_idx" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payments_paid_on_idx" ON "payments" USING btree ("paid_on");--> statement-breakpoint
CREATE INDEX "supplier_payables_booking_idx" ON "supplier_payables" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "supplier_payables_supplier_idx" ON "supplier_payables" USING btree ("supplier_id","status");--> statement-breakpoint
CREATE INDEX "supplier_rates_supplier_idx" ON "supplier_rates" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "supplier_rates_validity_idx" ON "supplier_rates" USING btree ("valid_from","valid_to");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_code_idx" ON "suppliers" USING btree ("supplier_code");--> statement-breakpoint
CREATE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ai_generations_entity_idx" ON "ai_generations" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "ai_generations_status_idx" ON "ai_generations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ai_generations_kind_idx" ON "ai_generations" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "code_sequences_scope_year_idx" ON "code_sequences" USING btree ("scope","year");--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification_idx" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_templates_event_channel_idx" ON "notification_templates" USING btree ("event_type","channel");--> statement-breakpoint
CREATE INDEX "notifications_recipient_idx" ON "notifications" USING btree ("recipient_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "notifications_event_idx" ON "notifications" USING btree ("event_type");