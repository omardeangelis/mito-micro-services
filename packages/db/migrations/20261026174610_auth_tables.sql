CREATE TABLE "mito-deutsche_auth_account" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mito-deutsche_auth_session" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"token" varchar(255) NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mito-deutsche_auth_verification" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mito-deutsche_user" ADD COLUMN "email_confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mito-deutsche_user" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "mito-deutsche_user" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "mito-deutsche_auth_account" ADD CONSTRAINT "mito-deutsche_auth_account_user_id_mito-deutsche_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mito-deutsche_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mito-deutsche_auth_session" ADD CONSTRAINT "mito-deutsche_auth_session_user_id_mito-deutsche_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."mito-deutsche_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_account_provider_account_idx" ON "mito-deutsche_auth_account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "auth_account_user_id_idx" ON "mito-deutsche_auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_session_token_idx" ON "mito-deutsche_auth_session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "auth_session_user_id_idx" ON "mito-deutsche_auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier_idx" ON "mito-deutsche_auth_verification" USING btree ("identifier");