const cron = require('node-cron');
const { dbAll, dbGet } = require('../db');
const { updateServer, rebootServer } = require('./update');
const { updateDockerGroup } = require('./docker');

const TZ = 'Europe/Amsterdam';

function isUpdateDue(startDate, interval, intervalUnit, lastUpdate) {
    if (!startDate || !interval || !intervalUnit) return false;
    const now = new Date();
    const start = new Date(startDate);
    if (now < start) return false;

    const msMap = { hours: 3600000, days: 86400000, weeks: 604800000, months: 2592000000 };
    const intervalMs = interval * (msMap[intervalUnit] || 0);
    if (!intervalMs) return false;

    if (lastUpdate) {
        const last = new Date(lastUpdate);
        if (last >= start) return (now - last) >= intervalMs;
    }
    return true;
}

function startScheduler() {
    cron.schedule('* * * * *', async () => {
        // Server groups
        try {
            const groups = await dbAll(
                'SELECT * FROM server_groups WHERE auto_update_interval IS NOT NULL AND auto_update_interval_unit IS NOT NULL'
            );
            for (const group of groups) {
                const row = await dbGet('SELECT MAX(last_update) as last_update FROM servers WHERE group_id = ?', [group.id]);
                if (!isUpdateDue(group.auto_update_start_date, group.auto_update_interval, group.auto_update_interval_unit, row?.last_update)) continue;

                const time = new Date().toLocaleString('nl-NL', { timeZone: TZ });
                console.log(`[scheduler] ${time} — Running scheduled update for group: ${group.name}`);

                const servers = await dbAll('SELECT * FROM servers WHERE group_id = ?', [group.id]);
                for (const server of servers) {
                    const result = await updateServer(server, null, 'automatic');
                    if (result.success && result.needsReboot && group.auto_reboot_if_required) {
                        console.log(`[scheduler] Auto-rebooting ${server.name}`);
                        await rebootServer(server);
                    }
                }
            }
        } catch (err) { console.error('[scheduler] Server group error:', err.message); }

        // Individual servers (no group)
        try {
            const servers = await dbAll('SELECT * FROM servers WHERE auto_update = 1 AND group_id IS NULL');
            for (const server of servers) {
                const row = await dbGet('SELECT last_update FROM servers WHERE id = ?', [server.id]);
                const lastUpdate = row?.last_update;
                const oneWeek = 604800000;
                if (!lastUpdate || (Date.now() - new Date(lastUpdate).getTime()) >= oneWeek) {
                    console.log(`[scheduler] Auto-updating individual server: ${server.name}`);
                    await updateServer(server, null, 'automatic');
                }
            }
        } catch (err) { console.error('[scheduler] Individual server error:', err.message); }

        // Docker groups
        try {
            const dockerGroups = await dbAll(
                'SELECT * FROM docker_groups WHERE auto_update_interval IS NOT NULL AND auto_update_interval_unit IS NOT NULL'
            );
            for (const group of dockerGroups) {
                const row = await dbGet(`
                    SELECT MAX(p.last_update) as last_update
                    FROM docker_compose_projects p JOIN docker_hosts h ON p.host_id = h.id
                    WHERE h.group_id = ?
                `, [group.id]);
                if (!isUpdateDue(group.auto_update_start_date, group.auto_update_interval, group.auto_update_interval_unit, row?.last_update)) continue;
                console.log(`[scheduler] Running scheduled Docker update for group: ${group.name}`);
                await updateDockerGroup(group.id, 'automatic');
            }
        } catch (err) { console.error('[scheduler] Docker group error:', err.message); }

    }, { timezone: TZ });

    console.log(`[scheduler] Auto-update scheduler started (checks every minute, TZ: ${TZ})`);
}

module.exports = { startScheduler, isUpdateDue };
