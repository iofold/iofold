CREATE TABLE traces (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  source TEXT NOT NULL, -- 'langfuse'
  raw_data TEXT NOT NULL, -- JSON
  normalized_data TEXT, -- JSON in unified schema
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  rating TEXT NOT NULL, -- 'positive', 'negative', 'neutral'
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trace_id) REFERENCES traces(id)
);

CREATE TABLE evals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL, -- Python function
  version INTEGER DEFAULT 1,
  accuracy REAL,
  training_count INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE eval_executions (
  id TEXT PRIMARY KEY,
  eval_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  predicted_pass BOOLEAN NOT NULL,
  reason TEXT,
  execution_time_ms INTEGER,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (eval_id) REFERENCES evals(id),
  FOREIGN KEY (trace_id) REFERENCES traces(id)
);
