-- ============================================================
-- GramTrust - Safe Bavishya Procurement Schema Integration
-- IMPORTANT:
--   * Does NOT drop existing tables
--   * Does NOT alter existing document tables
--   * Adds only missing procurement structures
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Add AUDITOR to the existing UserRole enum
-- ------------------------------------------------------------

ALTER TYPE "UserRole"
ADD VALUE IF NOT EXISTS 'AUDITOR';

COMMIT;

-- PostgreSQL requires the enum value to be committed before
-- it can safely be used by subsequent statements.

BEGIN;

-- ------------------------------------------------------------
-- 2. Source snapshots
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "source_snapshots" (
    "id" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "resource_id" TEXT,
    "fetch_timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_data" JSONB NOT NULL,
    "sha256" TEXT NOT NULL,
    "record_count" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'VALID',
    "metadata" JSONB,
    "imported_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_snapshots_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "source_snapshots_imported_by_id_fkey"
        FOREIGN KEY ("imported_by_id")
        REFERENCES "users"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "source_snapshots_source_name_idx"
    ON "source_snapshots"("source_name");

CREATE INDEX IF NOT EXISTS "source_snapshots_sha256_idx"
    ON "source_snapshots"("sha256");

CREATE INDEX IF NOT EXISTS "source_snapshots_fetch_timestamp_idx"
    ON "source_snapshots"("fetch_timestamp" DESC);


-- ------------------------------------------------------------
-- 3. Tenders
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "tenders" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "organisation_chain" TEXT,
    "tender_type" TEXT,
    "tender_category" TEXT,
    "form_of_contract" TEXT,
    "product_category" TEXT,
    "state" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "panchayat" TEXT,
    "location" TEXT,
    "pincode" TEXT,
    "estimated_value" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'Published',
    "published_date" TIMESTAMP(3),
    "closing_date" TIMESTAMP(3),
    "opening_date" TIMESTAMP(3),
    "inviting_authority" TEXT,
    "period_of_work_days" INTEGER,
    "current_version_number" INTEGER NOT NULL DEFAULT 1,
    "current_hash" TEXT NOT NULL,
    "blockchain_status" TEXT NOT NULL DEFAULT 'Pending',
    "blockchain_tx_id" TEXT,
    "blockchain_verified" BOOLEAN NOT NULL DEFAULT FALSE,
    "ai_risk_score" INTEGER,
    "ai_risk_level" TEXT,
    "source_snapshot_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenders_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "tenders_tender_id_key"
        UNIQUE ("tender_id"),

    CONSTRAINT "tenders_source_snapshot_id_fkey"
        FOREIGN KEY ("source_snapshot_id")
        REFERENCES "source_snapshots"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "tenders_state_idx"
    ON "tenders"("state");

CREATE INDEX IF NOT EXISTS "tenders_district_idx"
    ON "tenders"("district");

CREATE INDEX IF NOT EXISTS "tenders_department_idx"
    ON "tenders"("department");

CREATE INDEX IF NOT EXISTS "tenders_status_idx"
    ON "tenders"("status");

CREATE INDEX IF NOT EXISTS "tenders_ai_risk_level_idx"
    ON "tenders"("ai_risk_level");

CREATE INDEX IF NOT EXISTS "tenders_blockchain_status_idx"
    ON "tenders"("blockchain_status");

CREATE INDEX IF NOT EXISTS "tenders_created_at_idx"
    ON "tenders"("created_at" DESC);


-- ------------------------------------------------------------
-- 4. Vendors
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "state" TEXT,
    "district" TEXT,
    "address" TEXT,
    "is_blacklisted" BOOLEAN NOT NULL DEFAULT FALSE,
    "current_version_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "vendors_gstin_key"
        UNIQUE ("gstin")
);

CREATE INDEX IF NOT EXISTS "vendors_name_idx"
    ON "vendors"("name");

CREATE INDEX IF NOT EXISTS "vendors_gstin_idx"
    ON "vendors"("gstin");

CREATE INDEX IF NOT EXISTS "vendors_state_idx"
    ON "vendors"("state");


-- ------------------------------------------------------------
-- 5. Tender versions
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "tender_versions" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "previous_version_id" TEXT,
    "source_snapshot_id" TEXT,
    "data" JSONB NOT NULL,
    "changed_by" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_reason" TEXT NOT NULL,
    "previous_hash" TEXT,
    "new_hash" TEXT NOT NULL,
    "blockchain_tx_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_versions_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "tender_versions_tender_id_fkey"
        FOREIGN KEY ("tender_id")
        REFERENCES "tenders"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT "tender_versions_previous_version_id_fkey"
        FOREIGN KEY ("previous_version_id")
        REFERENCES "tender_versions"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT "tender_versions_source_snapshot_id_fkey"
        FOREIGN KEY ("source_snapshot_id")
        REFERENCES "source_snapshots"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT "tender_versions_tender_id_version_number_key"
        UNIQUE ("tender_id", "version_number")
);

CREATE INDEX IF NOT EXISTS "tender_versions_tender_id_idx"
    ON "tender_versions"("tender_id");

CREATE INDEX IF NOT EXISTS "tender_versions_version_number_idx"
    ON "tender_versions"("version_number");

CREATE INDEX IF NOT EXISTS "tender_versions_new_hash_idx"
    ON "tender_versions"("new_hash");

CREATE INDEX IF NOT EXISTS "tender_versions_created_at_idx"
    ON "tender_versions"("created_at" DESC);


-- ------------------------------------------------------------
-- 6. Vendor versions
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "vendor_versions" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "previous_version_id" TEXT,
    "data" JSONB NOT NULL,
    "changed_by" TEXT NOT NULL,
    "change_reason" TEXT NOT NULL,
    "previous_hash" TEXT,
    "new_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_versions_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "vendor_versions_vendor_id_fkey"
        FOREIGN KEY ("vendor_id")
        REFERENCES "vendors"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT "vendor_versions_previous_version_id_fkey"
        FOREIGN KEY ("previous_version_id")
        REFERENCES "vendor_versions"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT "vendor_versions_vendor_id_version_number_key"
        UNIQUE ("vendor_id", "version_number")
);

CREATE INDEX IF NOT EXISTS "vendor_versions_vendor_id_idx"
    ON "vendor_versions"("vendor_id");

CREATE INDEX IF NOT EXISTS "vendor_versions_new_hash_idx"
    ON "vendor_versions"("new_hash");


-- ------------------------------------------------------------
-- 7. Bids
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "bids" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "vendor_id" TEXT,
    "vendor_name" TEXT NOT NULL,
    "vendor_gstin" TEXT,
    "bid_amount" DECIMAL(18,2) NOT NULL,
    "submission_date" TIMESTAMP(3),
    "technical_score" DOUBLE PRECISION,
    "financial_rank" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Submitted',
    "current_version_number" INTEGER NOT NULL DEFAULT 1,
    "current_hash" TEXT NOT NULL,
    "blockchain_tx_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bids_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "bids_tender_id_fkey"
        FOREIGN KEY ("tender_id")
        REFERENCES "tenders"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT "bids_vendor_id_fkey"
        FOREIGN KEY ("vendor_id")
        REFERENCES "vendors"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "bids_tender_id_idx"
    ON "bids"("tender_id");

CREATE INDEX IF NOT EXISTS "bids_vendor_id_idx"
    ON "bids"("vendor_id");

CREATE INDEX IF NOT EXISTS "bids_status_idx"
    ON "bids"("status");


-- ------------------------------------------------------------
-- 8. Bid versions
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "bid_versions" (
    "id" TEXT NOT NULL,
    "bid_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "previous_version_id" TEXT,
    "data" JSONB NOT NULL,
    "bid_amount" DECIMAL(18,2) NOT NULL,
    "status" TEXT NOT NULL,
    "changed_by" TEXT NOT NULL,
    "change_reason" TEXT NOT NULL,
    "previous_hash" TEXT,
    "new_hash" TEXT NOT NULL,
    "blockchain_tx_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bid_versions_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "bid_versions_bid_id_fkey"
        FOREIGN KEY ("bid_id")
        REFERENCES "bids"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT "bid_versions_previous_version_id_fkey"
        FOREIGN KEY ("previous_version_id")
        REFERENCES "bid_versions"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT "bid_versions_bid_id_version_number_key"
        UNIQUE ("bid_id", "version_number")
);

CREATE INDEX IF NOT EXISTS "bid_versions_bid_id_idx"
    ON "bid_versions"("bid_id");

CREATE INDEX IF NOT EXISTS "bid_versions_new_hash_idx"
    ON "bid_versions"("new_hash");


-- ------------------------------------------------------------
-- 9. Tender audit events
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "tender_audit_events" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actor_role" TEXT,
    "version_number" INTEGER,
    "details" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "blockchain_tx_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_audit_events_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "tender_audit_events_tender_id_fkey"
        FOREIGN KEY ("tender_id")
        REFERENCES "tenders"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "tender_audit_events_tender_id_idx"
    ON "tender_audit_events"("tender_id");

CREATE INDEX IF NOT EXISTS "tender_audit_events_event_type_idx"
    ON "tender_audit_events"("event_type");

CREATE INDEX IF NOT EXISTS "tender_audit_events_created_at_idx"
    ON "tender_audit_events"("created_at" DESC);


-- ------------------------------------------------------------
-- 10. Blockchain transactions
-- ------------------------------------------------------------
-- This table does not currently exist in your database.
-- Bavishya's current Prisma schema expects this structure.

CREATE TABLE IF NOT EXISTS "blockchain_transactions" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT,
    "tender_version_id" TEXT,
    "audit_event_id" TEXT,
    "tx_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "hash" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'gramtrust-channel',
    "chaincode" TEXT NOT NULL DEFAULT 'gramtrust',
    "block_number" BIGINT,
    "status" TEXT NOT NULL DEFAULT 'COMMITTED',
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blockchain_transactions_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "blockchain_transactions_tx_id_key"
        UNIQUE ("tx_id"),

    CONSTRAINT "blockchain_transactions_tender_id_fkey"
        FOREIGN KEY ("tender_id")
        REFERENCES "tenders"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT "blockchain_transactions_tender_version_id_fkey"
        FOREIGN KEY ("tender_version_id")
        REFERENCES "tender_versions"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT "blockchain_transactions_audit_event_id_fkey"
        FOREIGN KEY ("audit_event_id")
        REFERENCES "tender_audit_events"("id")
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "blockchain_transactions_tender_id_idx"
    ON "blockchain_transactions"("tender_id");

CREATE INDEX IF NOT EXISTS "blockchain_transactions_tx_id_idx"
    ON "blockchain_transactions"("tx_id");

CREATE INDEX IF NOT EXISTS "blockchain_transactions_hash_idx"
    ON "blockchain_transactions"("hash");

CREATE INDEX IF NOT EXISTS "blockchain_transactions_created_at_idx"
    ON "blockchain_transactions"("created_at" DESC);


-- ------------------------------------------------------------
-- 11. AI analyses
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ai_analyses" (
    "id" TEXT NOT NULL,
    "tender_id" TEXT NOT NULL,
    "risk_score" INTEGER NOT NULL,
    "risk_level" TEXT NOT NULL,
    "model_version" TEXT NOT NULL DEFAULT '1.0.0-isolation-forest',
    "features" JSONB NOT NULL,
    "flags" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "ai_analyses_tender_id_fkey"
        FOREIGN KEY ("tender_id")
        REFERENCES "tenders"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ai_analyses_tender_id_idx"
    ON "ai_analyses"("tender_id");

CREATE INDEX IF NOT EXISTS "ai_analyses_risk_score_idx"
    ON "ai_analyses"("risk_score");

CREATE INDEX IF NOT EXISTS "ai_analyses_risk_level_idx"
    ON "ai_analyses"("risk_level");

CREATE INDEX IF NOT EXISTS "ai_analyses_created_at_idx"
    ON "ai_analyses"("created_at" DESC);


COMMIT;

-- ============================================================
-- END
-- ============================================================