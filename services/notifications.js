const https = require('https');
const { URL } = require('url');
const { dbAll } = require('../db');

function buildEmbed({ entity_type, entity_name, update_type, success, message }) {
    const icon = success ? '✅' : '❌';
    const typeLabel = entity_type === 'docker' ? 'Docker' : 'Server';
    return {
        embeds: [{
            title: `${icon} ${typeLabel} update: ${entity_name}`,
            description: message,
            color: success ? 3066993 : 15158332,
            fields: [
                { name: 'Trigger', value: update_type === 'automatic' ? '🕐 Automatic' : '👤 Manual', inline: true },
                { name: 'Status', value: success ? 'Success' : 'Failed', inline: true }
            ],
            timestamp: new Date().toISOString(),
            footer: { text: 'homelab-updater' }
        }]
    };
}

function postToDiscord(webhookUrl, payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        let parsed;
        try { parsed = new URL(webhookUrl); } catch { return reject(new Error('Invalid webhook URL')); }

        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            },
            timeout: 10000
        };

        const req = https.request(options, res => {
            res.resume();
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.statusCode);
            else reject(new Error(`Discord returned HTTP ${res.statusCode}`));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
        req.write(body);
        req.end();
    });
}

async function notifyUpdate(event) {
    let webhooks;
    try {
        webhooks = await dbAll('SELECT * FROM webhooks WHERE enabled = 1');
    } catch (err) {
        console.error('[notifications] Failed to load webhooks:', err.message);
        return;
    }

    for (const wh of webhooks) {
        if (event.success && !wh.notify_success) continue;
        if (!event.success && !wh.notify_failure) continue;
        try {
            await postToDiscord(wh.url, buildEmbed(event));
        } catch (err) {
            console.error(`[notifications] Failed to send to "${wh.name}": ${err.message}`);
        }
    }
}

async function sendTestNotification(webhookUrl) {
    const payload = {
        embeds: [{
            title: '🔔 Test notification',
            description: 'Your homelab-updater webhook is configured correctly.',
            color: 3447003,
            timestamp: new Date().toISOString(),
            footer: { text: 'homelab-updater' }
        }]
    };
    await postToDiscord(webhookUrl, payload);
}

module.exports = { notifyUpdate, sendTestNotification };
