SET search_path TO "PH", public;

ALTER TABLE pharmacy_products
    ADD COLUMN IF NOT EXISTS about               TEXT,
    ADD COLUMN IF NOT EXISTS ingredients         TEXT,
    ADD COLUMN IF NOT EXISTS health_benefits     TEXT,
    ADD COLUMN IF NOT EXISTS other_info          TEXT,
    ADD COLUMN IF NOT EXISTS disclaimer          TEXT DEFAULT 'All images are for representational purposes only. It is advised that you read the batch and manufacturing details, directions for use, allergen information, health and nutritional claims (wherever applicable), and other details mentioned on the label before consuming the product. For combo items, individual prices can be viewed on the page.',
    ADD COLUMN IF NOT EXISTS pack_of             INTEGER,
    ADD COLUMN IF NOT EXISTS net_weight          VARCHAR(60),
    ADD COLUMN IF NOT EXISTS calorie_count       VARCHAR(60),
    ADD COLUMN IF NOT EXISTS dietary_preference  VARCHAR(20),
    ADD COLUMN IF NOT EXISTS country_of_origin   VARCHAR(100) DEFAULT 'India',
    ADD COLUMN IF NOT EXISTS shelf_life          VARCHAR(100);
