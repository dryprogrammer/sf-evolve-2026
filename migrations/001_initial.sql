CREATE TABLE IF NOT EXISTS factory_state (
  scope text PRIMARY KEY,
  version integer NOT NULL CHECK (version >= 0),
  document jsonb NOT NULL,
  CHECK ((document->>'version')::integer = version),
  CHECK (jsonb_array_length(jsonb_path_query_array(document, '$.rounds[*] ? (@.state == "open")')) <= 1)
);
CREATE TABLE IF NOT EXISTS factory_drafts (
  scope text NOT NULL REFERENCES factory_state(scope),
  author_id text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  snapshot_id text NOT NULL,
  text text NOT NULL CHECK (char_length(text) <= 10000),
  PRIMARY KEY (scope, author_id)
);
CREATE TABLE IF NOT EXISTS factory_receipts (
  scope text NOT NULL REFERENCES factory_state(scope),
  author_id text NOT NULL,
  command_key text NOT NULL,
  digest text NOT NULL,
  result_version integer NOT NULL,
  PRIMARY KEY (scope, author_id, command_key)
);
