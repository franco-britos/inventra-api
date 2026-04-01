DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'LocationType'
      AND e.enumlabel = 'truck'
  ) THEN
    ALTER TYPE "LocationType" RENAME VALUE 'truck' TO 'vehicle';
  END IF;
END
$$;
