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
