const { dbRun } = require('../db');
const { connectToServer, makeSudoExec } = require('./ssh');
const { notifyUpdate } = require('./notifications');

async function logUpdate(entity_type, entity_id, entity_name, update_type, success, message, details = null) {
    try {
        await dbRun(
            `INSERT INTO update_logs (entity_type, entity_id, entity_name, update_type, success, message, details)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [entity_type, entity_id, entity_name, update_type, success ? 1 : 0, message, details]
        );
    } catch (err) {
        console.error('[update] Failed to log update:', err.message);
    }
}

async function updateServer(server, progressCallback = null, updateType = 'manual') {
    const details = { updateOutput: '', upgradeOutput: '', autoremoveOutput: '', packagesUpgraded: [], errors: [] };

    const emit = (stage, message) => progressCallback?.({ stage, message });

    try {
        emit('connecting', `Connecting to ${server.name}...`);
        const ssh = await connectToServer(server);
        const sudoExec = makeSudoExec(ssh, server.sudo_password_hash);

        // Step 1: apt-get update
        emit('updating', 'Updating package list...');
        const updateResult = await sudoExec('apt-get update -q', {
            onStdout: chunk => { details.updateOutput += chunk.toString(); },
            onStderr: chunk => { details.updateOutput += chunk.toString(); }
        });
        if (updateResult.code !== 0) throw new Error(`apt-get update failed: ${updateResult.stderr}`);

        // Step 2: apt-get upgrade
        emit('upgrading', 'Upgrading packages...');
        const upgradeResult = await sudoExec('DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -q', {
            onStdout: chunk => {
                const out = chunk.toString();
                details.upgradeOutput += out;
                emit('upgrading', out.trim().slice(-120));
            },
            onStderr: chunk => { details.upgradeOutput += chunk.toString(); }
        });
        if (upgradeResult.code !== 0) throw new Error(`apt-get upgrade failed: ${upgradeResult.stderr}`);

        // Step 3: apt-get autoremove
        emit('autoremove', 'Removing unused packages...');
        const autoremoveResult = await sudoExec('DEBIAN_FRONTEND=noninteractive apt-get autoremove -y -q', {
            onStdout: chunk => { details.autoremoveOutput += chunk.toString(); },
            onStderr: chunk => { details.autoremoveOutput += chunk.toString(); }
        });
        if (autoremoveResult.code !== 0) {
            console.warn(`[update] apt-get autoremove warning for ${server.name}: ${autoremoveResult.stderr}`);
        }

        // Extract upgraded package list
        const pkgMatch = details.upgradeOutput.match(/The following packages will be upgraded:\s*([\s\S]*?)\n\d+ upgraded/);
        if (pkgMatch) {
            details.packagesUpgraded = pkgMatch[1].trim().split(/\s+/).filter(Boolean);
        }
        const countMatch = details.upgradeOutput.match(/(\d+) upgraded/);
        const upgradeCount = countMatch ? parseInt(countMatch[1]) : 0;

        // Check reboot requirement
        const rebootCheck = await sudoExec('sh -c \'[ -f /var/run/reboot-required ] && echo REBOOT_REQUIRED || echo NO_REBOOT\'');
        const needsReboot = rebootCheck.stdout.includes('REBOOT_REQUIRED');

        await dbRun('UPDATE servers SET status = ?, last_update = ?, needs_reboot = ? WHERE id = ?',
            ['updated', new Date().toISOString(), needsReboot ? 1 : 0, server.id]);

        ssh.dispose();

        const message = upgradeCount > 0
            ? `${upgradeCount} package(s) upgraded${needsReboot ? ' — reboot recommended' : ''}`
            : `No packages to upgrade${needsReboot ? ' — reboot recommended' : ''}`;

        emit('completed', message);

        await logUpdate('server', server.id, server.name, updateType, true, message,
            JSON.stringify({
                packagesUpgraded: details.packagesUpgraded,
                upgradeCount,
                needsReboot,
                updateOutput: details.updateOutput.slice(-2000),
                upgradeOutput: details.upgradeOutput.slice(-2000),
                autoremoveOutput: details.autoremoveOutput.slice(-2000)
            })
        );
        notifyUpdate({ entity_type: 'server', entity_name: server.name, update_type: updateType, success: true, message });

        return { success: true, message, needsReboot };

    } catch (error) {
        console.error(`[update] ${server.name}: ${error.message}`);
        await dbRun('UPDATE servers SET status = ? WHERE id = ?', ['failed', server.id]);
        emit('failed', `Update failed: ${error.message}`);

        await logUpdate('server', server.id, server.name, updateType, false, error.message,
            JSON.stringify({ error: error.message, ...details })
        );
        notifyUpdate({ entity_type: 'server', entity_name: server.name, update_type: updateType, success: false, message: error.message });

        return { success: false, message: error.message };
    }
}

async function rebootServer(server) {
    try {
        const ssh = await connectToServer(server);
        const sudoExec = makeSudoExec(ssh, server.sudo_password_hash);
        await sudoExec('reboot');
        ssh.dispose();
        return { success: true, message: 'Server reboot initiated' };
    } catch (error) {
        return { success: false, message: error.message };
    }
}

module.exports = { updateServer, rebootServer, logUpdate };
