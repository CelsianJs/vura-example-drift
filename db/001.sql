CREATE SCHEMA IF NOT EXISTS drift_demo;
CREATE TABLE IF NOT EXISTS drift_demo.workspaces (id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS drift_demo.sessions (token_hash char(64) PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES drift_demo.workspaces(id) ON DELETE CASCADE, csrf_hash char(64) NOT NULL, csrf_token varchar(43) NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS drift_demo.items (workspace_id uuid NOT NULL REFERENCES drift_demo.workspaces(id) ON DELETE CASCADE, id varchar(80) NOT NULL, data jsonb NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 501), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(workspace_id,id));
CREATE TABLE IF NOT EXISTS drift_demo.events (sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES drift_demo.workspaces(id) ON DELETE CASCADE, item_id varchar(80) NOT NULL, version integer NOT NULL CHECK(version BETWEEN 2 AND 501), patch jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id,item_id,version), FOREIGN KEY(workspace_id,item_id) REFERENCES drift_demo.items(workspace_id,id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS events_workspace_sequence ON drift_demo.events(workspace_id,sequence);
CREATE INDEX IF NOT EXISTS sessions_expiry ON drift_demo.sessions(expires_at);
