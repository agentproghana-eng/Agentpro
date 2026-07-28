-- Adds the physical SIM slot index (0 or 1) used for each transaction,
-- captured client-side from Android's SubscriptionManager at the same
-- time as sim_iccid. Unlike ICCID, slot requires no special permission
-- and is available on virtually every device, so it works as a fallback
-- identifier on the growing number of Android versions/devices that
-- restrict ICCID access - weaker than ICCID (can't detect a swapped
-- physical SIM in the same slot), but far more consistently available.
ALTER TABLE transactions ADD COLUMN sim_slot INTEGER;
