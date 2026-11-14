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

CREATE TABLE IF NOT EXISTS staff_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('submission', 'resubmission', 'payment')),
  revision integer NOT NULL,
  title text NOT NULL,
  service text NOT NULL,
  manual_review boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (application_id, kind, revision)
);

CREATE TABLE IF NOT EXISTS application_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('submitted', 'resubmitted', 'ai_review', 'needs_correction', 'approved', 'rejected', 'payment_confirmed', 'document_issued')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  details jsonb NOT NULL DEFAULT '{}',
  read_at timestamptz,
  UNIQUE (application_id, revision, kind)
);

CREATE TABLE IF NOT EXISTS staff_notification_reads (
  account_id integer REFERENCES accounts(id) ON DELETE CASCADE,
  notification_id bigint REFERENCES staff_notifications(id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, notification_id)
);

CREATE TABLE IF NOT EXISTS staff_notification_preferences (
  account_id integer PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  submission boolean NOT NULL DEFAULT true,
  resubmission boolean NOT NULL DEFAULT true,
  payment boolean NOT NULL DEFAULT true
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
      AND conname IN ('documents_service_requirement_check', 'documents_municipal_requirement_check', 'documents_tricycle_requirement_check')
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
    WHERE conrelid = 'applications'::regclass AND conname IN ('applications_municipal_service_check', 'applications_tricycle_service_check')
  ) THEN
    ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_service_check;
    ALTER TABLE applications ADD CONSTRAINT applications_municipal_service_check
      CHECK (service IN ('business_permit', 'mayors_clearance', 'zoning_clearance'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'documents'::regclass AND conname IN ('documents_municipal_requirement_check', 'documents_tricycle_requirement_check')
  ) THEN
    ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_service_requirement_check;
    ALTER TABLE documents ADD CONSTRAINT documents_municipal_requirement_check
      CHECK (requirement IN ('profile', 'premises', 'authorization', 'supporting', 'zoning_site', 'zoning_use', 'zoning_ownership'));
  END IF;
END $$;

ALTER TABLE applications ADD COLUMN IF NOT EXISTS vehicle_identifier text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'applications'::regclass AND conname = 'applications_tricycle_service_check'
  ) THEN
    ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_municipal_service_check;
    ALTER TABLE applications ADD CONSTRAINT applications_tricycle_service_check
      CHECK (service IN ('business_permit', 'mayors_clearance', 'zoning_clearance', 'tricycle_permit'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'documents'::regclass AND conname = 'documents_tricycle_requirement_check'
  ) THEN
    ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_municipal_requirement_check;
    ALTER TABLE documents ADD CONSTRAINT documents_tricycle_requirement_check
      CHECK (requirement IN ('profile', 'premises', 'authorization', 'supporting', 'zoning_site', 'zoning_use', 'zoning_ownership',
                             'tricycle_vehicle', 'tricycle_operator'));
  END IF;
END $$;
