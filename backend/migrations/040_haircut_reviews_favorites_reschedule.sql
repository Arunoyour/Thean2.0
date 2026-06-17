-- Migration 040: Haircut reviews, favorites, and booking reschedule support.

SET search_path TO "HC";

CREATE TABLE IF NOT EXISTS "HC".haircut_reviews (
    review_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id  UUID NOT NULL UNIQUE,
    shop_id     UUID NOT NULL,
    customer_id UUID NOT NULL,
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_haircut_reviews_shop ON "HC".haircut_reviews (shop_id, created_at DESC);

CREATE TABLE IF NOT EXISTS "HC".customer_haircut_favorites (
    customer_id UUID NOT NULL,
    shop_id     UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (customer_id, shop_id)
);

ALTER TABLE "HC".haircut_bookings
    ADD COLUMN IF NOT EXISTS reschedule_count INT NOT NULL DEFAULT 0;
