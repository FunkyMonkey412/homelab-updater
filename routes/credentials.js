const express = require('express');
const multer = require('multer');
const fs = require('fs');

const { dbGet, dbAll, dbRun } = require('../db');
const { encrypt } = require('../utils/crypto');

const router = express.Router();
const upload = multer({ dest: 'ssh-keys/' });

router.get('/', async (req, res) => {
    try {
        res.json(await dbAll('SELECT id, name, auth_type, username, credential_subtype, created_at FROM credentials ORDER BY name'));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', upload.single('ssh_key'), async (req, res) => {
    const { name, auth_type, username, password } = req.body;
    const isApiToken = auth_type === 'api_token';

    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!isApiToken && !username) return res.status(400).json({ error: 'username is required' });
    if (isApiToken && !password) return res.status(400).json({ error: 'API token value is required' });
    if (auth_type === 'password' && !password) return res.status(400).json({ error: 'Password is required for password auth' });
    if (auth_type === 'ssh_key' && !req.file) return res.status(400).json({ error: 'SSH key file is required for ssh_key auth' });

    const dbAuthType        = isApiToken ? 'password' : auth_type;
    const dbUsername        = isApiToken ? 'api-token' : username;
    const credential_subtype = isApiToken ? 'api_token' : null;
    const password_hash     = (isApiToken || auth_type === 'password') ? encrypt(password) : null;
    const ssh_key_path      = auth_type === 'ssh_key' ? req.file.path : null;

    try {
        const result = await dbRun(
            'INSERT INTO credentials (name, auth_type, username, password_hash, ssh_key_path, credential_subtype) VALUES (?, ?, ?, ?, ?, ?)',
            [name, dbAuthType, dbUsername, password_hash, ssh_key_path, credential_subtype]
        );
        res.json({ id: result.lastID, name, auth_type: isApiToken ? 'api_token' : auth_type, username: dbUsername, credential_subtype });
    } catch (err) {
        if (err.message.includes('UNIQUE'))
            return res.status(400).json({ error: 'A credential with that name already exists' });
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', upload.single('ssh_key'), async (req, res) => {
    const { name, auth_type, username, password } = req.body;
    try {
        const current = await dbGet('SELECT * FROM credentials WHERE id = ?', [req.params.id]);
        if (!current) return res.status(404).json({ error: 'Credential not found' });

        let password_hash = current.password_hash;
        let ssh_key_path = current.ssh_key_path;

        if (auth_type !== current.auth_type) {
            // Switching type — clear the old credential material
            if (current.ssh_key_path && fs.existsSync(current.ssh_key_path)) fs.unlinkSync(current.ssh_key_path);
            password_hash = null;
            ssh_key_path = null;
        }

        if (auth_type === 'password' && password) password_hash = encrypt(password);
        if (auth_type === 'ssh_key' && req.file) {
            if (ssh_key_path && fs.existsSync(ssh_key_path)) fs.unlinkSync(ssh_key_path);
            ssh_key_path = req.file.path;
        }

        await dbRun(
            'UPDATE credentials SET name=?, auth_type=?, username=?, password_hash=?, ssh_key_path=? WHERE id=?',
            [name, auth_type, username, password_hash, ssh_key_path, req.params.id]
        );
        res.json({ id: req.params.id, name, auth_type, username });
    } catch (err) {
        if (err.message.includes('UNIQUE'))
            return res.status(400).json({ error: 'A credential with that name already exists' });
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const cred = await dbGet('SELECT * FROM credentials WHERE id = ?', [req.params.id]);
        if (!cred) return res.status(404).json({ error: 'Credential not found' });
        if (cred.ssh_key_path && fs.existsSync(cred.ssh_key_path)) fs.unlinkSync(cred.ssh_key_path);
        await dbRun('DELETE FROM credentials WHERE id = ?', [req.params.id]);
        res.json({ message: 'Credential deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
