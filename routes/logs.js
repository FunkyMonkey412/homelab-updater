const express = require('express');
const { dbAll, dbGet } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const { entity_type, update_type, limit = 100, offset = 0 } = req.query;
        let query = 'SELECT * FROM update_logs WHERE 1=1';
        const params = [];
        if (entity_type) { query += ' AND entity_type = ?'; params.push(entity_type); }
        if (update_type) { query += ' AND update_type = ?'; params.push(update_type); }
        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        let countQuery = 'SELECT COUNT(*) as total FROM update_logs WHERE 1=1';
        const countParams = [];
        if (entity_type) { countQuery += ' AND entity_type = ?'; countParams.push(entity_type); }
        if (update_type) { countQuery += ' AND update_type = ?'; countParams.push(update_type); }

        const [logs, countRow] = await Promise.all([dbAll(query, params), dbGet(countQuery, countParams)]);
        res.json({ logs, total: countRow.total });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
