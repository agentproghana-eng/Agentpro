// notification.routes.js
const express = require('express');
const notifRouter = express.Router();
const { authenticate } = require('../middleware/auth');
const { query } = require('../config/database');
const cursorHistoryController = require('../controllers/cursorHistoryController');

notifRouter.use(authenticate);

// Scale-safe notification history. The legacy page-number route remains
// available until all clients have migrated.
notifRouter.get(
  '/cursor',
  cursorHistoryController.listNotifications
);

notifRouter.get('/', async (req, res) => {
  const { page = 1, limit = 30, unread_only } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  try {
    const conditions = [`user_id = $1`];
    const params = [req.user.id];
    if (unread_only === 'true') conditions.push('is_read = FALSE');
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [data, count, unreadCount] = await Promise.all([
      query(`SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [...params, parseInt(limit), offset]),
      query(`SELECT COUNT(*) FROM notifications ${where}`, params),
      query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE`, [req.user.id]),
    ]);
    res.json({
      success: true,
      data: data.rows,
      meta: { total: parseInt(count.rows[0].count), unread: parseInt(unreadCount.rows[0].count) },
    });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to fetch notifications' }); }
});

notifRouter.patch('/mark-read', async (req, res) => {
  const { notification_ids } = req.body; // array of IDs, or 'all'
  try {
    if (notification_ids === 'all') {
      await query('UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE user_id = $1', [req.user.id]);
    } else {
      await query(
        'UPDATE notifications SET is_read = TRUE, read_at = NOW() WHERE id = ANY($1) AND user_id = $2',
        [notification_ids, req.user.id]
      );
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: 'Failed to update notifications' }); }
});

module.exports = notifRouter;
