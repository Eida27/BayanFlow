CREATE TABLE IF NOT EXISTS accounts (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('resident', 'staff'))
);
CREATE TABLE IF NOT EXISTS sessions (
  digest text PRIMARY KEY,
  account_id integer NOT NULL REFERENCES accounts(id),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS applications (
  id uuid PRIMARY KEY,
  resident_id integer NOT NULL REFERENCES accounts(id),
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('submitted', 'needs_correction', 'rejected', 'approved', 'paid')),
  revision integer NOT NULL DEFAULT 1,
  findings jsonb,
  ai_error text,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS documents (
  application_id uuid REFERENCES applications(id),
  revision integer NOT NULL,
  requirement text NOT NULL CHECK (requirement IN ('profile', 'premises', 'authorization')),
  pdf bytea NOT NULL,
  PRIMARY KEY (application_id, revision, requirement)
);
CREATE TABLE IF NOT EXISTS decisions (
  application_id uuid REFERENCES applications(id),
  revision integer NOT NULL,
  reviewer_id integer NOT NULL REFERENCES accounts(id),
  status text NOT NULL CHECK (status IN ('needs_correction', 'rejected', 'approved')),
  note text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, revision)
);
CREATE TABLE IF NOT EXISTS payments (
  application_id uuid PRIMARY KEY REFERENCES applications(id),
  reference_id text UNIQUE NOT NULL,
  amount numeric(78, 0) NOT NULL,
  payer text,
  contract text,
  authorization_block bigint,
  tx_hash text UNIQUE,
  confirmed_at timestamptz
);

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS service text NOT NULL DEFAULT 'business_permit',
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS purpose text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'documents'::regclass
      AND conname IN ('documents_service_requirement_check', 'documents_municipal_requirement_check')
  ) THEN
    ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_requirement_check;
    ALTER TABLE documents ADD CONSTRAINT documents_service_requirement_check
      CHECK (requirement IN ('profile', 'premises', 'authorization', 'supporting'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'applications'::regclass AND conname = 'applications_municipal_service_check'
  ) THEN
    ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_service_check;
    ALTER TABLE applications ADD CONSTRAINT applications_municipal_service_check
      CHECK (service IN ('business_permit', 'mayors_clearance', 'zoning_clearance'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'documents'::regclass AND conname = 'documents_municipal_requirement_check'
  ) THEN
    ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_service_requirement_check;
    ALTER TABLE documents ADD CONSTRAINT documents_municipal_requirement_check
      CHECK (requirement IN ('profile', 'premises', 'authorization', 'supporting', 'zoning_site', 'zoning_use', 'zoning_ownership'));
  END IF;
END $$;
