const express = require('express');
const { dbGet, dbAll, dbRun } = require('../db');
const { sendTestNotification } = require('../services/notifications');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        res.json(await dbAll('SELECT * FROM webhooks ORDER BY name'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
    const { name, url, notify_success = 1, notify_failure = 1 } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'name and url are required' });
    try {
        new URL(url);
    } catch {
        return res.status(400).json({ error: 'Invalid webhook URL' });
    }
    try {
        const result = await dbRun(
            'INSERT INTO webhooks (name, url, enabled, notify_success, notify_failure) VALUES (?, ?, 1, ?, ?)',
            [name, url, notify_success ? 1 : 0, notify_failure ? 1 : 0]
        );
        res.json({ id: result.lastID, name, url });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
    const { name, url, enabled, notify_success, notify_failure } = req.body;
    if (url) {
        try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid webhook URL' }); }
    }
    try {
        const current = await dbGet('SELECT * FROM webhooks WHERE id = ?', [req.params.id]);
        if (!current) return res.status(404).json({ error: 'Webhook not found' });

        await dbRun(
            'UPDATE webhooks SET name=?, url=?, enabled=?, notify_success=?, notify_failure=? WHERE id=?',
            [
                name ?? current.name,
                url ?? current.url,
                enabled !== undefined ? (enabled ? 1 : 0) : current.enabled,
                notify_success !== undefined ? (notify_success ? 1 : 0) : current.notify_success,
                notify_failure !== undefined ? (notify_failure ? 1 : 0) : current.notify_failure,
                req.params.id
            ]
        );
        res.json({ id: req.params.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        const wh = await dbGet('SELECT id FROM webhooks WHERE id = ?', [req.params.id]);
        if (!wh) return res.status(404).json({ error: 'Webhook not found' });
        await dbRun('DELETE FROM webhooks WHERE id = ?', [req.params.id]);
        res.json({ message: 'Webhook deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/test', async (req, res) => {
    try {
        const wh = await dbGet('SELECT * FROM webhooks WHERE id = ?', [req.params.id]);
        if (!wh) return res.status(404).json({ error: 'Webhook not found' });
        await sendTestNotification(wh.url);
        res.json({ message: 'Test notification sent' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
