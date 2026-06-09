CREATE SCHEMA IF NOT EXISTS "PH";

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
        EXECUTE format('ALTER TABLE public.%I SET SCHEMA "PH"', table_record.table_name);
    END LOOP;
END $$;

ALTER DATABASE thean_pharmacy SET search_path TO "PH", public;
ALTER ROLE postgres IN DATABASE thean_pharmacy SET search_path TO "PH", public;
