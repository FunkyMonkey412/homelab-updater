const express = require('express');
const path = require('path');
const fs = require('fs');

const { runMigrations } = require('./db');
const { startScheduler } = require('./services/scheduler');
const { router: serversRouter } = require('./routes/servers');
const { router: groupsRouter } = require('./routes/groups');
const { router: dockerRouter } = require('./routes/docker');
const logsRouter = require('./routes/logs');
const dashboardRouter = require('./routes/dashboard');
const credentialsRouter = require('./routes/credentials');
const webhooksRouter = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use('/api/servers', serversRouter);
app.use('/api/groups', groupsRouter);
app.use('/api/docker', dockerRouter);
app.use('/api/logs', logsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/credentials', credentialsRouter);
app.use('/api/webhooks', webhooksRouter);

// Keep original schedule-status path working
app.get('/api/schedule-status', (req, res) => res.redirect('/api/dashboard/schedule-status'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

async function start() {
    // Ensure data dir exists
    fs.mkdirSync('./data', { recursive: true });

    try {
        await runMigrations();
        console.log('[db] Migrations complete');
    } catch (err) {
        console.error('[db] Migration error:', err.message);
        process.exit(1);
    }

    startScheduler();

    app.listen(PORT, () => {
        const tz = process.env.TZ || 'System default';
        const now = new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' });
        console.log(`[server] Server Manager running on port ${PORT}`);
        console.log(`[server] Timezone: ${tz}  |  Amsterdam time: ${now}`);
    });
}

start();
