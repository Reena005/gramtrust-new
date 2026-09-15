-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'AUDITOR';

-- DropTable
DROP TABLE "document_records";

-- DropTable
DROP TABLE "tamper_logs";

-- CreateTable
CREATE TABLE "source_snapshots" (
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

    CONSTRAINT "source_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenders" (
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
    "blockchain_verified" BOOLEAN NOT NULL DEFAULT false,
    "ai_risk_score" INTEGER,
    "ai_risk_level" TEXT,
    "source_snapshot_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_versions" (
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

    CONSTRAINT "tender_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "pan" TEXT,
    "state" TEXT,
    "district" TEXT,
    "address" TEXT,
    "is_blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "current_version_number" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_versions" (
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

    CONSTRAINT "vendor_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
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

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bid_versions" (
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

    CONSTRAINT "bid_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_audit_events" (
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

    CONSTRAINT "tender_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockchain_transactions" (
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

    CONSTRAINT "blockchain_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
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

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_snapshots_source_name_idx" ON "source_snapshots"("source_name");

-- CreateIndex
CREATE INDEX "source_snapshots_sha256_idx" ON "source_snapshots"("sha256");

-- CreateIndex
CREATE INDEX "source_snapshots_fetch_timestamp_idx" ON "source_snapshots"("fetch_timestamp" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "tenders_tender_id_key" ON "tenders"("tender_id");

-- CreateIndex
CREATE INDEX "tenders_state_idx" ON "tenders"("state");

-- CreateIndex
CREATE INDEX "tenders_district_idx" ON "tenders"("district");

-- CreateIndex
CREATE INDEX "tenders_department_idx" ON "tenders"("department");

-- CreateIndex
CREATE INDEX "tenders_status_idx" ON "tenders"("status");

-- CreateIndex
CREATE INDEX "tenders_ai_risk_level_idx" ON "tenders"("ai_risk_level");

-- CreateIndex
CREATE INDEX "tenders_blockchain_status_idx" ON "tenders"("blockchain_status");

-- CreateIndex
CREATE INDEX "tenders_created_at_idx" ON "tenders"("created_at" DESC);

-- CreateIndex
CREATE INDEX "tender_versions_tender_id_idx" ON "tender_versions"("tender_id");

-- CreateIndex
CREATE INDEX "tender_versions_version_number_idx" ON "tender_versions"("version_number");

-- CreateIndex
CREATE INDEX "tender_versions_new_hash_idx" ON "tender_versions"("new_hash");

-- CreateIndex
CREATE INDEX "tender_versions_created_at_idx" ON "tender_versions"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "tender_versions_tender_id_version_number_key" ON "tender_versions"("tender_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_gstin_key" ON "vendors"("gstin");

-- CreateIndex
CREATE INDEX "vendors_name_idx" ON "vendors"("name");

-- CreateIndex
CREATE INDEX "vendors_gstin_idx" ON "vendors"("gstin");

-- CreateIndex
CREATE INDEX "vendors_state_idx" ON "vendors"("state");

-- CreateIndex
CREATE INDEX "vendor_versions_vendor_id_idx" ON "vendor_versions"("vendor_id");

-- CreateIndex
CREATE INDEX "vendor_versions_new_hash_idx" ON "vendor_versions"("new_hash");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_versions_vendor_id_version_number_key" ON "vendor_versions"("vendor_id", "version_number");

-- CreateIndex
CREATE INDEX "bids_tender_id_idx" ON "bids"("tender_id");

-- CreateIndex
CREATE INDEX "bids_vendor_id_idx" ON "bids"("vendor_id");

-- CreateIndex
CREATE INDEX "bids_status_idx" ON "bids"("status");

-- CreateIndex
CREATE INDEX "bid_versions_bid_id_idx" ON "bid_versions"("bid_id");

-- CreateIndex
CREATE INDEX "bid_versions_new_hash_idx" ON "bid_versions"("new_hash");

-- CreateIndex
CREATE UNIQUE INDEX "bid_versions_bid_id_version_number_key" ON "bid_versions"("bid_id", "version_number");

-- CreateIndex
CREATE INDEX "tender_audit_events_tender_id_idx" ON "tender_audit_events"("tender_id");

-- CreateIndex
CREATE INDEX "tender_audit_events_event_type_idx" ON "tender_audit_events"("event_type");

-- CreateIndex
CREATE INDEX "tender_audit_events_created_at_idx" ON "tender_audit_events"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_transactions_tx_id_key" ON "blockchain_transactions"("tx_id");

-- CreateIndex
CREATE INDEX "blockchain_transactions_tender_id_idx" ON "blockchain_transactions"("tender_id");

-- CreateIndex
CREATE INDEX "blockchain_transactions_tx_id_idx" ON "blockchain_transactions"("tx_id");

-- CreateIndex
CREATE INDEX "blockchain_transactions_hash_idx" ON "blockchain_transactions"("hash");

-- CreateIndex
CREATE INDEX "blockchain_transactions_created_at_idx" ON "blockchain_transactions"("created_at" DESC);

-- CreateIndex
CREATE INDEX "ai_analyses_tender_id_idx" ON "ai_analyses"("tender_id");

-- CreateIndex
CREATE INDEX "ai_analyses_risk_score_idx" ON "ai_analyses"("risk_score");

-- CreateIndex
CREATE INDEX "ai_analyses_risk_level_idx" ON "ai_analyses"("risk_level");

-- CreateIndex
CREATE INDEX "ai_analyses_created_at_idx" ON "ai_analyses"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_imported_by_id_fkey" FOREIGN KEY ("imported_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_versions" ADD CONSTRAINT "tender_versions_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_versions" ADD CONSTRAINT "tender_versions_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "tender_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_versions" ADD CONSTRAINT "tender_versions_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_versions" ADD CONSTRAINT "vendor_versions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_versions" ADD CONSTRAINT "vendor_versions_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "vendor_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_versions" ADD CONSTRAINT "bid_versions_bid_id_fkey" FOREIGN KEY ("bid_id") REFERENCES "bids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bid_versions" ADD CONSTRAINT "bid_versions_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "bid_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_audit_events" ADD CONSTRAINT "tender_audit_events_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "blockchain_transactions_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "blockchain_transactions_tender_version_id_fkey" FOREIGN KEY ("tender_version_id") REFERENCES "tender_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockchain_transactions" ADD CONSTRAINT "blockchain_transactions_audit_event_id_fkey" FOREIGN KEY ("audit_event_id") REFERENCES "tender_audit_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
