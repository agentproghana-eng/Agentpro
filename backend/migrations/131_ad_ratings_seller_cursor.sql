-- Denormalize advertisement ownership onto reviews so seller-wide review
-- streams can use a single ordered index instead of sorting review groups
-- from many advertisements.

ALTER TABLE ad_ratings
  ADD COLUMN IF NOT EXISTS seller_id UUID;

UPDATE ad_ratings ar
SET seller_id = a.posted_by
FROM advertisements a
WHERE a.id = ar.advertisement_id
  AND ar.seller_id IS DISTINCT FROM a.posted_by;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM ad_ratings
    WHERE seller_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce ad_ratings.seller_id: unresolved advertisement owner';
  END IF;
END $$;

ALTER TABLE ad_ratings
  ALTER COLUMN seller_id SET NOT NULL;

CREATE OR REPLACE FUNCTION set_ad_rating_seller_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT a.posted_by
  INTO NEW.seller_id
  FROM advertisements a
  WHERE a.id = NEW.advertisement_id;

  IF NEW.seller_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot resolve seller for advertisement %',
      NEW.advertisement_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ad_ratings_set_seller
  ON ad_ratings;

CREATE TRIGGER trg_ad_ratings_set_seller
BEFORE INSERT OR UPDATE OF advertisement_id
ON ad_ratings
FOR EACH ROW
EXECUTE FUNCTION set_ad_rating_seller_id();

CREATE INDEX IF NOT EXISTS idx_ad_ratings_seller_created_cursor
  ON ad_ratings (
    seller_id,
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_ad_ratings_seller_rating_created_cursor
  ON ad_ratings (
    seller_id,
    rating,
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_ad_ratings_ad_created_cursor
  ON ad_ratings (
    advertisement_id,
    created_at DESC,
    id DESC
  );
