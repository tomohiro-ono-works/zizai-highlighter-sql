-- BigQuery fixture
SELECT
  r'''raw string''',
  b"bytes",
  @limit
FROM `project.dataset.table`
QUALIFY ROW_NUMBER() OVER (ORDER BY created_at DESC) <= 10;
