const express = require('express');
const { dbGet, dbAll } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const [
            serverStats,
            needsReboot,
            dockerHostCount,
            dockerProjectStats,
            recentLogs
        ] = await Promise.all([
            dbAll(`SELECT status, COUNT(*) as count FROM servers GROUP BY status`),
            dbGet(`SELECT COUNT(*) as count FROM servers WHERE needs_reboot = 1`),
            dbGet(`SELECT COUNT(*) as count FROM docker_hosts`),
            dbAll(`SELECT status, COUNT(*) as count FROM docker_compose_projects GROUP BY status`),
            dbAll(`SELECT * FROM update_logs ORDER BY timestamp DESC LIMIT 10`)
        ]);

        // Pivot server stats
        const servers = { total: 0, updated: 0, failed: 0, unknown: 0 };
        for (const row of serverStats) {
            servers[row.status] = row.count;
            servers.total += row.count;
        }

        // Pivot docker project stats
        const projects = { total: 0, updated: 0, failed: 0, unknown: 0 };
        for (const row of dockerProjectStats) {
            projects[row.status] = row.count;
            projects.total += row.count;
        }

        res.json({
            servers: { ...servers, needsReboot: needsReboot.count },
            dockerHosts: dockerHostCount.count,
            dockerProjects: projects,
            recentLogs
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Schedule status endpoint (kept from original for compatibility)
router.get('/schedule-status', async (req, res) => {
    try {
        const { isUpdateDue } = require('../services/scheduler');
        const now = new Date();
        const groups = await dbAll('SELECT * FROM server_groups WHERE auto_update_interval IS NOT NULL');
        res.json({
            currentTime: { amsterdam: now.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' }), utc: now.toISOString() },
            groups: groups.map(g => ({
                name: g.name,
                schedule: `Every ${g.auto_update_interval} ${g.auto_update_interval_unit}`,
                startDate: g.auto_update_start_date,
                isDue: isUpdateDue(g.auto_update_start_date, g.auto_update_interval, g.auto_update_interval_unit, null)
            }))
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
