-- Stable logical identity for durable notification delivery.
--
-- The transactional outbox remains at-least-once. FCM cannot participate
-- in the PostgreSQL transaction, so a crash after FCM accepts a message
-- but before persistence can still cause a network-level redelivery.
--
-- delivery_key allows the backend and clients to suppress those retries
-- as the same logical notification.

ALTER TABLE notifications
  ADD COLUMN delivery_key VARCHAR(255);

CREATE UNIQUE INDEX uq_notifications_delivery_key
  ON notifications (delivery_key)
  WHERE delivery_key IS NOT NULL;
