-- CreateEnum
CREATE TYPE "PipelineStatus" AS ENUM ('AWAITING_INGESTION', 'AUTO_APPROVED', 'FLAGGED_FOR_REVIEW', 'COMMITTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ValidationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "raw_text" TEXT NOT NULL,
    "doc_type" VARCHAR(100) NOT NULL DEFAULT 'Unclassified',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_telemetry" (
    "id" BIGSERIAL NOT NULL,
    "document_id" UUID NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "word_count" INTEGER NOT NULL,
    "processing_ms" INTEGER NOT NULL,
    "model_version" VARCHAR(50) NOT NULL DEFAULT 'llama3:latest',

    CONSTRAINT "pipeline_telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_matrix" (
    "id" BIGSERIAL NOT NULL,
    "document_id" UUID NOT NULL,
    "system_status" "PipelineStatus" NOT NULL DEFAULT 'AWAITING_INGESTION',
    "priority_level" "ValidationPriority" NOT NULL DEFAULT 'NORMAL',
    "is_overridden" BOOLEAN NOT NULL DEFAULT false,
    "reviewed_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "verification_matrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "document_id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "performed_by" VARCHAR(100) NOT NULL DEFAULT 'SYSTEM_WORKER',
    "changed_from" VARCHAR(50),
    "changed_to" VARCHAR(50),
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_telemetry_document_id_key" ON "pipeline_telemetry"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_matrix_document_id_key" ON "verification_matrix"("document_id");

-- AddForeignKey
ALTER TABLE "pipeline_telemetry" ADD CONSTRAINT "pipeline_telemetry_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_matrix" ADD CONSTRAINT "verification_matrix_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
