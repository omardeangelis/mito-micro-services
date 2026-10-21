DO $$ BEGIN
 CREATE TYPE "public"."blacklist_status" AS ENUM('blacklisted', 'whitelisted', 'review');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."source_value" AS ENUM('spontaneo', 'passaparola', 'inbound', 'outbound', 'call center', 'post vendita', 'digital', 'banca', 'mito', 'wave', 'internal');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."State" AS ENUM('Liquidata', 'Rifiutata', 'Chiusa', 'Estinta anticipata', 'Rinunciata', 'Stornata');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."UserRole" AS ENUM('ADMIN', 'OPERATORE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."CustomerRole" AS ENUM('Intestatario', 'Coobbligato', 'Garante');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_chat" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mito-deutsche_chat_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"send_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_read" boolean
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mito-deutsche_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 10000 CACHE 1),
	"operator_id" integer NOT NULL,
	"chat_id" integer NOT NULL,
	"send_date" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"notify_date" timestamp with time zone,
	"content" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_customers" (
	"id" varchar PRIMARY KEY DEFAULT 'sDch0YehFZjFYwXd7eTsn' NOT NULL,
	"fullname" varchar(255),
	"name" varchar(255),
	"sede" varchar(255),
	"surname" varchar(255),
	"fiscal_code" char(16),
	"vat_code" varchar(255),
	"email" varchar(255),
	"birthday_date" timestamp with time zone,
	"age" smallint,
	"phone_number" varchar(20),
	"address" varchar(255),
	"cap" varchar(5),
	"blacklist_status" "blacklist_status" DEFAULT 'whitelisted' NOT NULL,
	"comune" varchar(100),
	"provincia" varchar(100),
	"temp_id" varchar(255) NOT NULL,
	"file_name" varchar(255),
	"unique_hash" varchar(255) NOT NULL,
	"reddito" numeric,
	"occupazione" varchar(255),
	"ambito_lavorativo" varchar(255),
	"tipo_contratto" varchar(255),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT '2024-09-26T19:51:25.695Z' NOT NULL,
	"last_import_update" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"chat_id" integer,
	"operator_id" smallint,
	"source" "source_value" NOT NULL,
	CONSTRAINT "mito-deutsche_customers_temp_id_unique" UNIQUE("temp_id"),
	CONSTRAINT "mito-deutsche_customers_unique_hash_unique" UNIQUE("unique_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_practices" (
	"id" integer GENERATED ALWAYS AS IDENTITY (sequence name "mito-deutsche_practices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"pratica_id" varchar(255) PRIMARY KEY NOT NULL,
	"region" varchar(100),
	"des_punto_vendita" varchar(255),
	"des_convenzionato" varchar(255),
	"subagente" varchar(255),
	"importo_finanziato" numeric NOT NULL,
	"importo_erogato" numeric NOT NULL,
	"rate_totali" integer NOT NULL,
	"importo_rata" numeric NOT NULL,
	"rate_pagate" integer NOT NULL,
	"debito_residuo" numeric,
	"data_liquidazione" timestamp with time zone NOT NULL,
	"data_estinzione" timestamp with time zone,
	"importo_richiesto" numeric,
	"payment_method" varchar(255),
	"tasso_pratica" numeric,
	"state" "State" NOT NULL,
	"is_wave" boolean,
	"file_name" varchar(255),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT '2024-09-26T19:51:25.698Z' NOT NULL,
	"last_import_update" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"product_id" char(2),
	"operator_id" smallint,
	"chat_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_account" (
	"userId" varchar(255) NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"providerAccountId" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" varchar(255),
	"scope" varchar(255),
	"id_token" text,
	"session_state" varchar(255),
	CONSTRAINT "mito-deutsche_account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_session" (
	"sessionToken" varchar(255) PRIMARY KEY NOT NULL,
	"userId" varchar(255) NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_user" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255),
	"email" varchar(255) NOT NULL,
	"emailVerified" timestamp DEFAULT CURRENT_TIMESTAMP,
	"role" "UserRole" DEFAULT 'ADMIN' NOT NULL,
	"image" varchar(255),
	"preferences" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_verificationToken" (
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "mito-deutsche_verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mito-deutsche_products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"product_code" char(2) NOT NULL,
	"product_label" varchar,
	"product_type" varchar,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_operator" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mito-deutsche_operator_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"user_id" varchar(255) NOT NULL,
	"name" varchar(255),
	"surname" varchar(255),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "mito-deutsche_operator_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_alert" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mito-deutsche_alert_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"task_id" integer NOT NULL,
	"message" varchar
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mito-deutsche_task" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mito-deutsche_task_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1000 CACHE 1),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"state" "task_status" DEFAULT 'nessuno',
	"closed_at" timestamp with time zone,
	"customer_id" varchar,
	"operator_id" integer,
	"alert_id" integer,
	"priority" integer DEFAULT 0,
	"custom_priority" boolean DEFAULT false,
	"is_active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers_to_pratiche" (
	"customer_id" varchar NOT NULL,
	"pratica_id" varchar NOT NULL,
	"customer_role" "CustomerRole",
	CONSTRAINT "customers_to_pratiche_customer_id_pratica_id_pk" PRIMARY KEY("customer_id","pratica_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chat_to_operator" (
	"chat_id" integer NOT NULL,
	"operator_id" smallint NOT NULL,
	CONSTRAINT "chat_to_operator_chat_id_operator_id_pk" PRIMARY KEY("chat_id","operator_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_customers" ADD CONSTRAINT "mito-deutsche_customers_chat_id_mito-deutsche_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."mito-deutsche_chat"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_customers" ADD CONSTRAINT "mito-deutsche_customers_operator_id_mito-deutsche_operator_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."mito-deutsche_operator"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_practices" ADD CONSTRAINT "mito-deutsche_practices_operator_id_mito-deutsche_operator_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."mito-deutsche_operator"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_practices" ADD CONSTRAINT "mito-deutsche_practices_chat_id_mito-deutsche_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."mito-deutsche_chat"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_account" ADD CONSTRAINT "mito-deutsche_account_userId_mito-deutsche_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."mito-deutsche_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_session" ADD CONSTRAINT "mito-deutsche_session_userId_mito-deutsche_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."mito-deutsche_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_task" ADD CONSTRAINT "mito-deutsche_task_customer_id_mito-deutsche_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."mito-deutsche_customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_task" ADD CONSTRAINT "mito-deutsche_task_operator_id_mito-deutsche_operator_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."mito-deutsche_operator"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mito-deutsche_task" ADD CONSTRAINT "mito-deutsche_task_alert_id_mito-deutsche_alert_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."mito-deutsche_alert"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers_to_pratiche" ADD CONSTRAINT "customers_to_pratiche_customer_id_mito-deutsche_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."mito-deutsche_customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers_to_pratiche" ADD CONSTRAINT "customers_to_pratiche_pratica_id_mito-deutsche_practices_pratica_id_fk" FOREIGN KEY ("pratica_id") REFERENCES "public"."mito-deutsche_practices"("pratica_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_to_operator" ADD CONSTRAINT "chat_to_operator_chat_id_mito-deutsche_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."mito-deutsche_chat"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_to_operator" ADD CONSTRAINT "chat_to_operator_operator_id_mito-deutsche_operator_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."mito-deutsche_operator"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_chatId_idx" ON "mito-deutsche_messages" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "mito-deutsche_account" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "mito-deutsche_session" USING btree ("userId");