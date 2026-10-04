-- Persist AI work-verification analysis results for GramTrust projects.
-- The existing database schema enables pgcrypto, which provides
-- gen_random_uuid() on PostgreSQL versions where it is not built in.
CREATE TABLE IF NOT EXISTS ai_work_verification_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR NOT NULL,
    image_path TEXT NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    reported_completion NUMERIC,
    predicted_stage VARCHAR(100),
    similarity_score NUMERIC,
    result VARCHAR(50) NOT NULL,
    reason TEXT,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ai_work_verification_results IS
    'Stores AI work-verification analysis results associated with GramTrust projects.';

CREATE INDEX IF NOT EXISTS idx_ai_work_verification_project
ON ai_work_verification_results(project_id);

CREATE INDEX IF NOT EXISTS idx_ai_work_verification_created_at
ON ai_work_verification_results(created_at);
