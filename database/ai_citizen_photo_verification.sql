-- Store AI-assisted citizen photo verification results for existing GramTrust projects.
CREATE TABLE IF NOT EXISTS ai_citizen_photo_verification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id VARCHAR NOT NULL,
    citizen_user_id VARCHAR,
    reference_image_path TEXT NOT NULL,
    citizen_image_path TEXT NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    similarity_score NUMERIC,
    result VARCHAR(50) NOT NULL,
    reason TEXT,
    citizen_latitude NUMERIC,
    citizen_longitude NUMERIC,
    capture_timestamp TIMESTAMP,
    gps_distance_meters NUMERIC,
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE ai_citizen_photo_verification IS
    'Stores AI-assisted citizen photo verification results associated with GramTrust projects.';

COMMENT ON COLUMN ai_citizen_photo_verification.project_id IS
    'Existing GramTrust project identifier/code returned by the project API.';

COMMENT ON COLUMN ai_citizen_photo_verification.citizen_user_id IS
    'Authenticated citizen user identifier when available.';

COMMENT ON COLUMN ai_citizen_photo_verification.reference_image_path IS
    'Path to the official/reference project image.';

COMMENT ON COLUMN ai_citizen_photo_verification.citizen_image_path IS
    'Path to the citizen-uploaded image.';

COMMENT ON COLUMN ai_citizen_photo_verification.similarity_score IS
    'CLIP image-to-image cosine similarity; not proof that images depict the same location.';

COMMENT ON COLUMN ai_citizen_photo_verification.result IS
    'Application-level result: VERIFIED, REVIEW_REQUIRED, or INSUFFICIENT_EVIDENCE.';

COMMENT ON COLUMN ai_citizen_photo_verification.citizen_latitude IS
    'Optional latitude extracted from citizen image metadata.';

COMMENT ON COLUMN ai_citizen_photo_verification.citizen_longitude IS
    'Optional longitude extracted from citizen image metadata.';

COMMENT ON COLUMN ai_citizen_photo_verification.capture_timestamp IS
    'Optional capture timestamp extracted from citizen image metadata.';

COMMENT ON COLUMN ai_citizen_photo_verification.gps_distance_meters IS
    'Reserved for a future distance calculation when trusted project coordinates are available.';

CREATE INDEX IF NOT EXISTS idx_ai_citizen_photo_verification_project
ON ai_citizen_photo_verification(project_id);

CREATE INDEX IF NOT EXISTS idx_ai_citizen_photo_verification_citizen
ON ai_citizen_photo_verification(citizen_user_id);

CREATE INDEX IF NOT EXISTS idx_ai_citizen_photo_verification_created_at
ON ai_citizen_photo_verification(created_at);
