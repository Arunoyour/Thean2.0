CREATE SCHEMA IF NOT EXISTS "T";

DO $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I SET SCHEMA "T"', table_record.table_name);
    END LOOP;
END $$;

ALTER DATABASE thean SET search_path TO "T", public;
ALTER ROLE postgres IN DATABASE thean SET search_path TO "T", public;
