const express = require('express');
const { dbGet, dbAll, dbRun } = require('../db');
const { updateServer, rebootServer } = require('../services/update');

const router = express.Router();
const groupSessions = new Map();

router.get('/', async (req, res) => {
    try { res.json(await dbAll('SELECT * FROM server_groups ORDER BY name')); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
    try {
        const g = await dbGet('SELECT * FROM server_groups WHERE id = ?', [req.params.id]);
        if (!g) return res.status(404).json({ error: 'Group not found' });
        res.json(g);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
    const { name, description, auto_update_interval, auto_update_interval_unit, auto_update_start_date, auto_reboot_if_required } = req.body;
    try {
        const result = await dbRun(
            `INSERT INTO server_groups (name, description, auto_update_interval, auto_update_interval_unit, auto_update_start_date, auto_reboot_if_required)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, description, auto_update_interval, auto_update_interval_unit, auto_update_start_date, auto_reboot_if_required || 0]
        );
        res.json({ id: result.lastID, name, description });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
    const { name, description, auto_update_interval, auto_update_interval_unit, auto_update_start_date, auto_reboot_if_required } = req.body;
    try {
        await dbRun(
            `UPDATE server_groups SET name=?, description=?, auto_update_interval=?, auto_update_interval_unit=?,
             auto_update_start_date=?, auto_reboot_if_required=? WHERE id=?`,
            [name, description, auto_update_interval, auto_update_interval_unit, auto_update_start_date,
             auto_reboot_if_required || 0, req.params.id]
        );
        res.json({ id: req.params.id, name, description });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
    try {
        await dbRun('DELETE FROM server_groups WHERE id = ?', [req.params.id]);
        res.json({ message: 'Group deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SSE Group Update ──────────────────────────────────────────────────────────

router.get('/:id/update-stream', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    groupSessions.set(req.params.id, res);
    res.write(`data: ${JSON.stringify({ stage: 'initializing', message: 'Preparing group update...' })}\n\n`);
    req.on('close', () => groupSessions.delete(req.params.id));
});

router.post('/:id/update', async (req, res) => {
    try {
        const group = await dbGet('SELECT * FROM server_groups WHERE id = ?', [req.params.id]);
        if (!group) return res.status(404).json({ error: 'Group not found' });

        const servers = await dbAll('SELECT * FROM servers WHERE group_id = ?', [req.params.id]);

        const emit = (data) => {
            const sseRes = groupSessions.get(req.params.id);
            if (sseRes) sseRes.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        const results = [];
        emit({ stage: 'starting', message: `Updating ${servers.length} server(s)...`, total: servers.length });

        for (let i = 0; i < servers.length; i++) {
            const server = servers[i];
            emit({ stage: 'server_start', server: server.name, current: i + 1, total: servers.length });

            const result = await updateServer(server, (progress) => {
                emit({ stage: 'server_progress', server: server.name, ...progress });
            });
            results.push({ server: server.name, ...result });

            if (result.success && result.needsReboot && group.auto_reboot_if_required) {
                emit({ stage: 'server_progress', server: server.name, message: 'Rebooting...' });
                await rebootServer(server);
            }
        }

        const successCount = results.filter(r => r.success).length;
        emit({ stage: 'finished', results, message: `${successCount}/${servers.length} servers updated` });

        const sseRes = groupSessions.get(req.params.id);
        if (sseRes) { sseRes.end(); groupSessions.delete(req.params.id); }

        res.json({ group_id: req.params.id, results });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = { router, groupSessions };
