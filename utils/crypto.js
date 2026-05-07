const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEY_FILE = path.join(__dirname, '../data/encryption.key');
let _key = null;

function getKey() {
    if (_key) return _key;

    if (process.env.ENCRYPTION_KEY) {
        _key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
        return _key;
    }

    if (fs.existsSync(KEY_FILE)) {
        _key = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
        return _key;
    }

    const newKey = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
    fs.writeFileSync(KEY_FILE, newKey.toString('hex'), { mode: 0o600 });
    console.log('[crypto] Generated new encryption key at', KEY_FILE);
    _key = newKey;
    return _key;
}

function encrypt(plaintext) {
    if (!plaintext) return null;
    const key = getKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return 'aes:' + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decrypt(stored) {
    if (!stored) return null;

    // Legacy base64 format (pre-encryption) — still readable, will be re-encrypted on next save
    if (!stored.startsWith('aes:')) {
        try {
            return Buffer.from(stored, 'base64').toString('utf8');
        } catch {
            return null;
        }
    }

    try {
        const key = getKey();
        const data = Buffer.from(stored.slice(4), 'base64');
        const iv = data.subarray(0, 12);
        const tag = data.subarray(12, 28);
        const encrypted = data.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
    } catch (err) {
        console.error('[crypto] Decryption failed:', err.message);
        return null;
    }
}

module.exports = { encrypt, decrypt };
