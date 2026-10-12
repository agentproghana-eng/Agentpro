-- Seller notifications for new enquiries and saves on their advertisements.

ALTER TYPE notification_type
ADD VALUE IF NOT EXISTS 'ad_enquiry';

ALTER TYPE notification_type
ADD VALUE IF NOT EXISTS 'ad_saved';
