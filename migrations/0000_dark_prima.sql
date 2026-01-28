CREATE TABLE IF NOT EXISTS "claim_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"processor_id" uuid NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"assigned_by" uuid,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "claim_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"old_status" varchar(50),
	"new_status" varchar(50) NOT NULL,
	"changed_by" uuid NOT NULL,
	"change_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"claim_number" varchar(100) NOT NULL,
	"patient_id" uuid NOT NULL,
	"provider_id" uuid NOT NULL,
	"assigned_processor_id" uuid,
	"diagnosis_code" varchar(50) NOT NULL,
	"diagnosis_description" text,
	"amount" numeric(12, 2) NOT NULL,
	"status" varchar(50) DEFAULT 'submitted' NOT NULL,
	"submission_date" timestamp DEFAULT now() NOT NULL,
	"review_date" timestamp,
	"approval_date" timestamp,
	"payment_date" timestamp,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"is_locked" boolean DEFAULT false NOT NULL,
	"locked_by" uuid,
	"locked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "claims_claim_number_unique" UNIQUE("claim_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "diagnosis_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "diagnosis_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_queues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue_name" varchar(100) NOT NULL,
	"job_id" varchar(255) NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" varchar(50) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0,
	"max_attempts" integer DEFAULT 3,
	"run_after" timestamp DEFAULT now(),
	"started_at" timestamp,
	"completed_at" timestamp,
	"failed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patient_status_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"status_type" varchar(50) NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb,
	"triggered_job_id" varchar(255),
	"job_status" varchar(50) DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"date_of_birth" timestamp NOT NULL,
	"email" varchar(255),
	"phone" varchar(20),
	"address" text,
	"insurance_member_id" varchar(100),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"license_number" varchar(100),
	"tax_id" varchar(100),
	"address" text,
	"phone" varchar(20),
	"email" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"role" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "claim_processor_idx" ON "claim_assignments" ("claim_id","processor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_processor_idx" ON "claim_assignments" ("processor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "history_claim_idx" ON "claim_status_history" ("claim_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "history_changed_at_idx" ON "claim_status_history" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_claim_idx" ON "claims" ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claim_patient_idx" ON "claims" ("patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claim_provider_idx" ON "claims" ("provider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claim_status_idx" ON "claims" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "claim_number_idx" ON "claims" ("claim_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "date_range_idx" ON "claims" ("submission_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "processor_idx" ON "claims" ("assigned_processor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_status_date_idx" ON "claims" ("organization_id","status","submission_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "diagnosis_code_idx" ON "diagnosis_codes" ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queue_job_idx" ON "job_queues" ("queue_name","job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queue_org_status_idx" ON "job_queues" ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "queue_run_after_idx" ON "job_queues" ("run_after");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_org_patient_idx" ON "patient_status_changes" ("organization_id","patient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_occurred_at_idx" ON "patient_status_changes" ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_job_status_idx" ON "patient_status_changes" ("job_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_patient_idx" ON "patients" ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_id_idx" ON "patients" ("insurance_member_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_provider_idx" ON "providers" ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_email_idx" ON "users" ("organization_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "org_role_idx" ON "users" ("organization_id","role");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "claim_assignments" ADD CONSTRAINT "claim_assignments_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "claim_assignments" ADD CONSTRAINT "claim_assignments_processor_id_users_id_fk" FOREIGN KEY ("processor_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "claim_assignments" ADD CONSTRAINT "claim_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "claim_status_history" ADD CONSTRAINT "claim_status_history_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "claim_status_history" ADD CONSTRAINT "claim_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "claims" ADD CONSTRAINT "claims_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "claims" ADD CONSTRAINT "claims_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "claims" ADD CONSTRAINT "claims_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "claims" ADD CONSTRAINT "claims_assigned_processor_id_users_id_fk" FOREIGN KEY ("assigned_processor_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "claims" ADD CONSTRAINT "claims_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_queues" ADD CONSTRAINT "job_queues_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patient_status_changes" ADD CONSTRAINT "patient_status_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patient_status_changes" ADD CONSTRAINT "patient_status_changes_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patients" ADD CONSTRAINT "patients_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "providers" ADD CONSTRAINT "providers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "providers" ADD CONSTRAINT "providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
