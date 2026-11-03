/*
    Authentication for the admin panel.

    Only needed when the panel is reachable over the network (running it on a
    server instead of your own machine). On loopback with no credentials set,
    the panel stays open -- it's a local tool and that's the common case.

    Credentials come from, in order:
      1. admin/auth.json, written by `node admin/server.js --set-password`
      2. ADMIN_USER + ADMIN_PASSWORD env vars (for systemd / containers)

    The password is never stored: only a scrypt hash with a random salt.
    Sessions live in memory, so restarting the server signs you out.
*/

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const readline = require('readline');

const AUTH_FILE = path.join(__dirname, 'auth.json');

// scrypt parameters. N=2^15 takes ~100ms here, which is slow enough to make
// guessing expensive and fast enough not to be felt on a real login.
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;   // 12 hours
const SESSION_COOKIE = 'wiiadmin_session';

// Brute-force limits, per client address.
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;            // 15 minutes

/* ---------------------------------------------------------------- hashing -- */

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const derived = crypto.scryptSync(password, salt, SCRYPT.keylen, {
        N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p,
        // scrypt needs its memory limit raised to match N.
        maxmem: 256 * 1024 * 1024
    });
    return { salt, hash: derived.toString('hex'), algo: 'scrypt', ...SCRYPT };
}

function verifyPassword(password, record) {
    try {
        const derived = crypto.scryptSync(password, record.salt,
            record.keylen || SCRYPT.keylen, {
                N: record.N || SCRYPT.N,
                r: record.r || SCRYPT.r,
                p: record.p || SCRYPT.p,
                maxmem: 256 * 1024 * 1024
            });
        const expected = Buffer.from(record.hash, 'hex');
        // Same length is required before comparing, and the comparison itself
        // must not leak how many bytes matched.
        if (derived.length !== expected.length) return false;
        return crypto.timingSafeEqual(derived, expected);
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------ credentials -- */

function loadCredentials() {
    // 1. auth.json
    try {
        const raw = fs.readFileSync(AUTH_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.user && parsed.hash && parsed.salt) {
            return { source: 'auth.json', ...parsed };
        }
    } catch { /* not configured this way */ }

    // 2. environment
    const user = process.env.ADMIN_USER;
    const password = process.env.ADMIN_PASSWORD;
    if (user && password) {
        return { source: 'env', user, ...hashPassword(password) };
    }

    return null;
}

async function saveCredentials(user, password) {
    const record = { user, ...hashPassword(password), updatedAt: new Date().toISOString() };
    await fsp.writeFile(AUTH_FILE, JSON.stringify(record, null, 4) + '\n', {
        encoding: 'utf8',
        // Readable only by the owner, where the OS honours it.
        mode: 0o600
    });
    return AUTH_FILE;
}

/* --------------------------------------------------------------- sessions -- */

const sessions = new Map();   // token -> { user, expires }

function createSession(user) {
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, { user, expires: Date.now() + SESSION_TTL_MS });
    return token;
}

function readSession(token) {
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expires < Date.now()) {
        sessions.delete(token);
        return null;
    }
    return session;
}

function destroySession(token) {
    if (token) sessions.delete(token);
}

// Drop expired sessions now and then so the map can't grow without bound.
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of sessions) {
        if (session.expires < now) sessions.delete(token);
    }
}, 60 * 60 * 1000).unref();

function parseCookies(header) {
    const out = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i === -1) continue;
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
}

function sessionCookie(token, { secure, maxAge }) {
    const bits = [
        `${SESSION_COOKIE}=${token}`,
        'Path=/',
        'HttpOnly',
        // Strict: the cookie is never sent from another site, which rules out
        // a page elsewhere making authenticated calls to the panel.
        'SameSite=Strict',
        `Max-Age=${maxAge}`
    ];
    if (secure) bits.push('Secure');
    return bits.join('; ');
}

/* ----------------------------------------------------------- rate limiting -- */

const attempts = new Map();   // address -> { count, until }

function clientAddress(req, behindProxy) {
    if (behindProxy) {
        const forwarded = req.headers['x-forwarded-for'];
        if (forwarded) return String(forwarded).split(',')[0].trim();
    }
    return req.socket.remoteAddress || 'unknown';
}

function lockoutRemaining(address) {
    const entry = attempts.get(address);
    if (!entry || entry.count < MAX_ATTEMPTS) return 0;
    const left = entry.until - Date.now();
    if (left <= 0) {
        attempts.delete(address);
        return 0;
    }
    return left;
}

function recordFailure(address) {
    const entry = attempts.get(address) || { count: 0, until: 0 };
    entry.count += 1;
    entry.until = Date.now() + LOCKOUT_MS;
    attempts.set(address, entry);
    return MAX_ATTEMPTS - entry.count;
}

function clearFailures(address) {
    attempts.delete(address);
}

/* --------------------------------------------------------- password prompt -- */

// Reads a line without echoing it, for --set-password.
function promptHidden(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true
        });
        let muted = false;
        const original = rl._writeToOutput.bind(rl);
        rl._writeToOutput = (text) => {
            if (muted) {
                // Keep the prompt visible, hide whatever is typed after it.
                if (text.startsWith(question)) original(text);
                return;
            }
            original(text);
        };
        rl.question(question, (answer) => {
            rl.close();
            process.stdout.write('\n');
            resolve(answer);
        });
        muted = true;
    });
}

function promptLine(question) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

module.exports = {
    AUTH_FILE,
    SESSION_COOKIE,
    MAX_ATTEMPTS,
    LOCKOUT_MS,
    hashPassword,
    verifyPassword,
    loadCredentials,
    saveCredentials,
    createSession,
    readSession,
    destroySession,
    parseCookies,
    sessionCookie,
    clientAddress,
    lockoutRemaining,
    recordFailure,
    clearFailures,
    promptHidden,
    promptLine
};
