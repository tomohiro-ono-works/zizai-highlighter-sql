-- DuckDB fixture
SELECT
  100_000 AS amount,
  $$SELECT is text here$$ AS body,
  $tag$WHERE is text here$tag$ AS tagged_body,
  $1 AS parameter;
