const { NodeSSH } = require('node-ssh');
const fs = require('fs');
const { decrypt } = require('../utils/crypto');
const { dbGet } = require('../db');

const SSH_ALGORITHMS = {
    kex: [
        'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521',
        'diffie-hellman-group14-sha256', 'diffie-hellman-group16-sha512',
        'diffie-hellman-group18-sha512', 'diffie-hellman-group14-sha1'
    ],
    cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm', 'aes256-gcm'],
    serverHostKey: ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
    hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1']
};

async function connectToServer(server) {
    const ssh = new NodeSSH();

    // Resolve auth from credential vault if credential_id is set
    let auth = server;
    if (server.credential_id) {
        const cred = await dbGet('SELECT * FROM credentials WHERE id = ?', [server.credential_id]);
        if (!cred) throw new Error(`Saved credential not found for ${server.name}`);
        auth = { ...server, username: cred.username, auth_type: cred.auth_type, password_hash: cred.password_hash, ssh_key_path: cred.ssh_key_path };
    }

    const config = {
        host: server.ip_address,
        port: server.port,
        username: auth.username,
        readyTimeout: 30000,
        strictVendor: false,
        algorithms: SSH_ALGORITHMS
    };

    if (auth.auth_type === 'password') {
        const password = decrypt(auth.password_hash);
        if (!password) throw new Error('No password found for password authentication');
        config.password = password;
    } else if (auth.auth_type === 'ssh_key') {
        if (!auth.ssh_key_path || !fs.existsSync(auth.ssh_key_path)) {
            throw new Error('SSH key file not found or invalid');
        }
        config.privateKey = fs.readFileSync(auth.ssh_key_path, 'utf8');
        if (config.privateKey.includes('ENCRYPTED')) {
            throw new Error('Encrypted SSH keys are not supported. Please use unencrypted keys.');
        }
    }

    try {
        await ssh.connect(config);
        return ssh;
    } catch (error) {
        if (error.message.includes('All configured authentication methods failed')) {
            throw new Error(
                server.auth_type === 'password'
                    ? `Password authentication failed for ${server.name}. Check credentials or SSH config.`
                    : `SSH key authentication failed for ${server.name}. Verify the key is authorized.`
            );
        }
        if (error.message.includes('ECONNREFUSED')) {
            throw new Error(`Connection refused to ${server.name}:${server.port}. Is SSH running?`);
        }
        if (error.message.includes('EHOSTUNREACH')) {
            throw new Error(`Host ${server.name} (${server.ip_address}) is unreachable.`);
        }
        if (error.message.includes('timeout')) {
            throw new Error(`Connection timeout to ${server.name}.`);
        }
        throw new Error(`Connection failed to ${server.name}: ${error.message}`);
    }
}

// Build a sudo-capable exec wrapper that feeds the password via stdin (no shell injection)
function makeSudoExec(ssh, sudoPasswordHash) {
    const sudoPassword = sudoPasswordHash ? decrypt(sudoPasswordHash) : null;

    return async function sudoExec(command, options = {}) {
        if (sudoPassword) {
            return ssh.execCommand(`sudo -S -p "" ${command}`, {
                ...options,
                stdin: sudoPassword + '\n'
            });
        }
        return ssh.execCommand(`sudo ${command}`, options);
    };
}

module.exports = { connectToServer, makeSudoExec };
