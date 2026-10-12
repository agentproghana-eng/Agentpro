-- Count views from visitors who are not signed in (for example people
-- browsing agentproghana.com) without storing IP addresses or device data.
--
-- viewer_hash is a one-way hash of the visitor's pseudonymous web identity,
-- the advertisement and the calendar day. It is only used to count one view
-- per visitor per 30 minutes, cannot be reversed to a person or an IP
-- address, and cannot be linked across advertisements or days.

ALTER TABLE advertisement_views
  ADD COLUMN IF NOT EXISTS viewer_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_advertisement_views_ad_hash
  ON advertisement_views (advertisement_id, viewer_hash, viewed_at DESC)
  WHERE viewer_hash IS NOT NULL;
