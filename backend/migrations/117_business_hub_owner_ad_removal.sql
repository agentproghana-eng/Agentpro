-- Business Hub owners may retire an active listing before expiry
-- without physically deleting its payment, enquiry, view or audit history.

ALTER TYPE ad_status
ADD VALUE IF NOT EXISTS 'removed';
