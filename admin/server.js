#!/usr/bin/env node
/*
    Admin server for the Wii portfolio.

    Serves the portfolio itself plus the admin panel at /admin, and exposes a
    small API that reads and writes db/projects.json -- the file the portfolio
    loads to build its channels.

    No dependencies: Node's own http/fs/fetch only.

        node admin/server.js                    # http://localhost:8000/
        node admin/server.js --port 9000
        GITHUB_TOKEN=xxx node admin/server.js   # private repos / higher rate limit

        node admin/server.js --set-password     # set the admin login
        node admin/server.js --host 0.0.0.0     # reachable from the network

    Binds to 127.0.0.1 by default, since it writes files. Serving it on the
    network requires a password (see --set-password); the server refuses to
    start otherwise.
*/

'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const Projects = require('../js/projects.js');
const Auth = require('./auth.js');

const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'db', 'projects.json');

const DEFAULT_USER = 'Sergio-CMDEV';

const argv = process.argv.slice(2);
function argValue(name, fallback) {
    const i = argv.indexOf(name);
    return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}
function argFlag(name) {
    return argv.includes(name);
}

const PORT = parseInt(argValue('--port', process.env.PORT || '8000'), 10);
const HOST = argValue('--host', process.env.HOST || '127.0.0.1');
// Behind nginx/Caddy: trust X-Forwarded-For for rate limiting and mark the
// session cookie Secure, since the browser is really talking HTTPS.
const BEHIND_PROXY = argFlag('--behind-proxy');

const LOOPBACK = ['127.0.0.1', '::1', 'localhost'];
const IS_LOCAL_ONLY = LOOPBACK.includes(HOST);

// Credentials, if any have been configured.
const CREDENTIALS = Auth.loadCredentials();
const AUTH_ON = !!CREDENTIALS;

// Pages and endpoints that must stay reachable without a session.
const PUBLIC_ADMIN = new Set(['/admin/login.html', '/admin/css/admin.css']);
const PUBLIC_API = new Set(['/api/login', '/api/session']);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.webmanifest': 'application/manifest+json',
    '.xcf': 'application/octet-stream'
};

/* ------------------------------------------------------------------ db ---- */

const DEFAULT_STATE = {
    githubUser: DEFAULT_USER,
    syncedAt: null,
    settings: {
        includeForks: false,
        includeArchived: true,
        // The profile README repo (same name as the user) isn't a project.
        excludeProfileRepo: true,
        // Repo names that should never be imported.
        excluded: []
    },
    projects: []
};

async function readState() {
    try {
        const raw = await fsp.readFile(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            ...DEFAULT_STATE,
            ...parsed,
            settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
            projects: Array.isArray(parsed.projects) ? parsed.projects : []
        };
    } catch (err) {
        if (err.code === 'ENOENT') return { ...DEFAULT_STATE };
        throw err;
    }
}

async function writeState(state) {
    await fsp.mkdir(path.dirname(DB_FILE), { recursive: true });
    // Write to a temp file and rename, so a crash can't leave a half file
    // that the portfolio would then fail to parse.
    const tmp = DB_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(state, null, 4) + '\n', 'utf8');
    await fsp.rename(tmp, DB_FILE);
}

/* -------------------------------------------------------------- github ---- */

async function fetchRepos(user, token) {
    const headers = {
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'wii-portfolio-admin',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const repos = [];
    for (let page = 1; page <= 10; page++) {
        const url = `https://api.github.com/users/${encodeURIComponent(user)}`
            + `/repos?per_page=100&sort=updated&page=${page}`;
        const res = await fetch(url, { headers });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            let detail = '';
            try {
                detail = JSON.parse(body).message || '';
            } catch { /* keep detail empty */ }

            if (res.status === 404) {
                throw new Error(`GitHub: no existe el usuario "${user}".`);
            }
            if (res.status === 403 && /rate limit/i.test(detail)) {
                throw new Error(
                    'GitHub: límite de peticiones alcanzado (60/hora sin token). '
                    + 'Arranca el servidor con GITHUB_TOKEN=tu_token para subirlo a 5000/hora.'
                );
            }
            throw new Error(`GitHub respondió ${res.status}${detail ? ': ' + detail : ''}`);
        }

        const batch = await res.json();
        repos.push(...batch);
        if (batch.length < 100) break;
    }
    return repos;
}

/*
    Merge freshly fetched repos into the stored projects.

    Overrides, enabled and order always survive: only each project's `github`
    block is refreshed. A repo that is no longer on GitHub (deleted, renamed or
    made private) is flagged `missing` instead of being dropped, so the edits
    made to it aren't lost.
*/
function mergeRepos(state, repos) {
    const settings = state.settings;
    const excluded = new Set((settings.excluded || []).map((n) => n.toLowerCase()));

    const keep = repos.filter((repo) => {
        if (excluded.has(repo.name.toLowerCase())) return false;
        if (!settings.includeForks && repo.fork) return false;
        if (!settings.includeArchived && repo.archived) return false;
        if (settings.excludeProfileRepo
            && repo.name.toLowerCase() === String(state.githubUser).toLowerCase()) return false;
        return true;
    });

    const projects = state.projects.map((p) => ({ ...p }));
    const byRepo = new Map();
    projects.forEach((p) => {
        if (p.repo) byRepo.set(p.repo.toLowerCase(), p);
    });

    const usedIds = new Set(projects.map((p) => p.id));
    let maxOrder = projects.reduce(
        (max, p) => Math.max(max, typeof p.order === 'number' ? p.order : 0), -1);

    const summary = { added: [], updated: [], missing: [], total: keep.length };

    for (const repo of keep) {
        const existing = byRepo.get(repo.name.toLowerCase());
        const github = Projects.fromApiRepo(repo);

        if (existing) {
            existing.github = github;
            delete existing.missing;
            summary.updated.push(repo.name);
        } else {
            // New repo: unique channel id, appended at the end, on by default.
            let id = Projects.slugify(repo.name);
            let n = 2;
            while (usedIds.has(id)) id = `${Projects.slugify(repo.name)}-${n++}`;
            usedIds.add(id);

            projects.push({
                id,
                repo: repo.name,
                github,
                overrides: {},
                enabled: true,
                order: ++maxOrder
            });
            summary.added.push(repo.name);
        }
    }

    // Flag GitHub-backed projects whose repo didn't come back this time.
    const seen = new Set(keep.map((r) => r.name.toLowerCase()));
    for (const p of projects) {
        if (p.repo && !seen.has(p.repo.toLowerCase())) {
            p.missing = true;
            summary.missing.push(p.repo);
        }
    }

    projects.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    projects.forEach((p, i) => { p.order = i; });

    return {
        state: { ...state, projects, syncedAt: new Date().toISOString() },
        summary
    };
}

/* ----------------------------------------------------------- validation ---- */

const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;
const OVERRIDE_KEYS = ['title', 'description', 'target', 'language', 'color', 'icon',
    'style', 'audio'];

function cleanString(value, max) {
    if (typeof value !== 'string') return '';
    return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

/*
    Rebuild the incoming payload field by field.

    The browser is the only client, but the result is written to disk and then
    rendered by the portfolio, so nothing is trusted as-is: unknown keys are
    dropped, strings are bounded, and a target has to be a URL the portfolio
    can actually navigate to.
*/
function sanitizeState(incoming, current, rejected = []) {
    const settings = incoming.settings || {};
    const out = {
        githubUser: cleanString(incoming.githubUser, 80) || current.githubUser,
        syncedAt: current.syncedAt,
        settings: {
            includeForks: !!settings.includeForks,
            includeArchived: settings.includeArchived !== false,
            excludeProfileRepo: settings.excludeProfileRepo !== false,
            excluded: Array.isArray(settings.excluded)
                ? settings.excluded.map((n) => cleanString(n, 100)).filter(Boolean).slice(0, 200)
                : []
        },
        projects: []
    };

    const seenIds = new Set();
    const list = Array.isArray(incoming.projects) ? incoming.projects.slice(0, 200) : [];

    list.forEach((raw, index) => {
        if (!raw || typeof raw !== 'object') return;

        let id = Projects.slugify(raw.id || raw.repo || `project-${index}`);
        let n = 2;
        while (seenIds.has(id)) id = `${id}-${n++}`;
        seenIds.add(id);

        const overrides = {};
        const rawOverrides = raw.overrides && typeof raw.overrides === 'object'
            ? raw.overrides : {};

        /*
            Rebuild the overrides, dropping anything that doesn't validate.

            A rejected value used to vanish while the panel still reported a
            successful save, which looked exactly like "the change didn't
            stick". Every drop is now recorded and sent back so the panel can
            say what it refused and why.
        */
        for (const key of OVERRIDE_KEYS) {
            let value = cleanString(rawOverrides[key], key === 'description' ? 400 : 200);
            if (!value) continue;

            const drop = (reason) => {
                rejected.push({ id, key, value: value.slice(0, 80), reason });
            };

            if (key === 'color' && !HEX.test(value)) {
                drop('no es un color hexadecimal (#rgb o #rrggbb)');
                continue;
            }
            if (key === 'style' && !Projects.STYLE_IDS.includes(value)) {
                // Usually means the server is running older code than the
                // panel: js/projects.js is loaded once, at startup.
                drop('estilo desconocido para el servidor; reinícialo');
                continue;
            }
            if (key === 'target') {
                // Only absolute http(s) URLs, or a site-relative path.
                const absolute = /^https?:\/\//i.test(value);
                if (!absolute && !/^[\w./-]+$/.test(value)) {
                    drop('debe ser una URL http(s) o una ruta del propio sitio');
                    continue;
                }
                if (absolute) {
                    try { new URL(value); } catch {
                        drop('la URL no es válida');
                        continue;
                    }
                }
            }
            if (key === 'audio') {
                // Must stay inside the site; no protocol, no parent escapes.
                if (!/^[\w./-]+$/.test(value) || value.includes('..')) {
                    drop('debe ser una ruta dentro del sitio');
                    continue;
                }
            }
            if (key === 'icon') {
                value = Array.from(value).slice(0, 4).join('');
            }
            overrides[key] = value;
        }

        const project = {
            id,
            overrides,
            enabled: raw.enabled !== false,
            order: Number.isFinite(raw.order) ? raw.order : index,
            useOwnArt: !!raw.useOwnArt
        };

        const repo = cleanString(raw.repo, 120);
        if (repo) project.repo = repo;

        // `github` is never written by the panel: keep whatever sync stored.
        const prior = current.projects.find(
            (p) => p.id === id || (repo && p.repo && p.repo.toLowerCase() === repo.toLowerCase()));
        if (prior && prior.github) project.github = prior.github;
        if (prior && prior.missing) project.missing = true;

        out.projects.push(project);
    });

    out.projects.sort((a, b) => a.order - b.order);
    out.projects.forEach((p, i) => { p.order = i; });

    return out;
}

/* ---------------------------------------------------------------- http ---- */

function sendJson(res, status, payload) {
    const body = JSON.stringify(payload);
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store'
    });
    res.end(body);
}

function readBody(req, limit = 1024 * 512) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error('Payload demasiado grande'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (!text) return resolve({});
            try {
                resolve(JSON.parse(text));
            } catch {
                reject(new Error('JSON inválido'));
            }
        });
        req.on('error', reject);
    });
}

function withResolved(state) {
    return { ...state, resolved: Projects.resolveAll(state.projects) };
}

/* ---------------------------------------------------------------- auth ---- */

// Only the panel and its API are protected. The portfolio itself is the public
// site, so it stays open -- that's the whole point of serving it.
function needsAuth(pathname) {
    if (!AUTH_ON) return false;
    if (pathname.startsWith('/api/')) return !PUBLIC_API.has(pathname);
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
        return !PUBLIC_ADMIN.has(pathname);
    }
    return false;
}

function currentSession(req) {
    const cookies = Auth.parseCookies(req.headers.cookie);
    return Auth.readSession(cookies[Auth.SESSION_COOKIE]);
}

async function handleLogin(req, res) {
    const address = Auth.clientAddress(req, BEHIND_PROXY);

    const locked = Auth.lockoutRemaining(address);
    if (locked > 0) {
        const minutes = Math.ceil(locked / 60000);
        return sendJson(res, 429, {
            error: `Demasiados intentos fallidos. Prueba otra vez en ${minutes} min.`
        });
    }

    const body = await readBody(req, 4096);
    const user = typeof body.user === 'string' ? body.user : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const userOk = user === CREDENTIALS.user;
    // Verify the password either way, so a wrong username doesn't answer
    // faster than a wrong password and reveal which one was wrong.
    const passOk = Auth.verifyPassword(password, CREDENTIALS);

    if (!userOk || !passOk) {
        const left = Auth.recordFailure(address);
        console.warn(`login fallido desde ${address} (quedan ${Math.max(0, left)})`);
        return sendJson(res, 401, {
            error: left > 0
                ? `Usuario o contraseña incorrectos. Te queda${left === 1 ? '' : 'n'} `
                    + `${left} intento${left === 1 ? '' : 's'}.`
                : 'Usuario o contraseña incorrectos. Acceso bloqueado temporalmente.'
        });
    }

    Auth.clearFailures(address);
    const token = Auth.createSession(CREDENTIALS.user);
    res.setHeader('Set-Cookie', Auth.sessionCookie(token, {
        secure: BEHIND_PROXY,
        maxAge: 12 * 60 * 60
    }));
    console.log(`login correcto desde ${address}`);
    return sendJson(res, 200, { ok: true, user: CREDENTIALS.user });
}

function handleLogout(req, res) {
    const cookies = Auth.parseCookies(req.headers.cookie);
    Auth.destroySession(cookies[Auth.SESSION_COOKIE]);
    res.setHeader('Set-Cookie', Auth.sessionCookie('', {
        secure: BEHIND_PROXY,
        maxAge: 0
    }));
    return sendJson(res, 200, { ok: true });
}

/* ----------------------------------------------------------------- api ---- */

async function handleApi(req, res, url) {
    const route = url.pathname;

    if (route === '/api/login' && req.method === 'POST') {
        if (!AUTH_ON) return sendJson(res, 400, { error: 'No hay login configurado.' });
        return handleLogin(req, res);
    }

    if (route === '/api/logout' && req.method === 'POST') {
        return handleLogout(req, res);
    }

    // Lets the panel show who is signed in, and whether it needs to at all.
    if (route === '/api/session' && req.method === 'GET') {
        const session = AUTH_ON ? currentSession(req) : null;
        return sendJson(res, 200, {
            authEnabled: AUTH_ON,
            user: session ? session.user : null
        });
    }

    if (route === '/api/state' && req.method === 'GET') {
        return sendJson(res, 200, withResolved(await readState()));
    }

    if (route === '/api/state' && req.method === 'PUT') {
        const current = await readState();
        const incoming = await readBody(req);
        const rejected = [];
        const next = sanitizeState(incoming, current, rejected);
        await writeState(next);
        if (rejected.length) {
            console.warn('valores rechazados al guardar:', rejected);
        }
        return sendJson(res, 200, { ...withResolved(next), rejected });
    }

    if (route === '/api/sync' && req.method === 'POST') {
        const body = await readBody(req);
        const current = await readState();
        const user = cleanString(body.githubUser, 80) || current.githubUser;
        const token = process.env.GITHUB_TOKEN || '';

        const repos = await fetchRepos(user, token);
        const { state, summary } = mergeRepos({ ...current, githubUser: user }, repos);
        await writeState(state);

        return sendJson(res, 200, { ...withResolved(state), summary, tokenUsed: !!token });
    }

    return sendJson(res, 404, { error: 'Ruta de API desconocida' });
}

async function serveStatic(req, res, url) {
    // Resolve inside ROOT and verify, so no path can escape the site folder.
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (rel === '') rel = 'index.html';

    let full = path.resolve(ROOT, rel);
    if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
        res.writeHead(403).end('403');
        return;
    }

    let stat = null;
    try {
        stat = await fsp.stat(full);
    } catch { /* fall through to 404 */ }

    if (stat && stat.isDirectory()) {
        full = path.join(full, 'index.html');
        try {
            stat = await fsp.stat(full);
        } catch {
            stat = null;
        }
    }

    if (!stat || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`404: ${rel}`);
        return;
    }

    res.writeHead(200, {
        'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size,
        // Never cache, so edits always show up on reload.
        'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    fs.createReadStream(full).pipe(res);
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    try {
        // Gate the panel before anything else looks at the request.
        if (needsAuth(url.pathname) && !currentSession(req)) {
            if (url.pathname.startsWith('/api/')) {
                return sendJson(res, 401, { error: 'Necesitas iniciar sesión.' });
            }
            // Send the browser to the login page, remembering where it wanted
            // to go so it lands back there afterwards.
            const next = encodeURIComponent(url.pathname + url.search);
            res.writeHead(302, {
                Location: `/admin/login.html?next=${next}`,
                'Cache-Control': 'no-store'
            });
            return res.end();
        }

        if (url.pathname.startsWith('/api/')) {
            await handleApi(req, res, url);
        } else {
            await serveStatic(req, res, url);
        }
    } catch (err) {
        console.error(`${req.method} ${url.pathname} ->`, err.message);
        if (!res.headersSent) sendJson(res, 500, { error: err.message });
        else res.end();
    }
});

/* -------------------------------------------------------- set-password ---- */

async function setPassword() {
    console.log('\n  Contraseña del panel de admin\n');

    const current = Auth.loadCredentials();
    if (current && current.source === 'auth.json') {
        console.log(`  Ya hay un usuario configurado: ${current.user}`);
        console.log('  Continuar lo reemplaza.\n');
    }

    const user = (await Auth.promptLine('  Usuario: ')).trim()
        || (current ? current.user : 'admin');

    const password = await Auth.promptHidden('  Contraseña: ');
    if (password.length < 8) {
        console.error('\n  La contraseña debe tener al menos 8 caracteres.\n');
        process.exit(1);
    }

    const repeat = await Auth.promptHidden('  Repite la contraseña: ');
    if (password !== repeat) {
        console.error('\n  Las contraseñas no coinciden.\n');
        process.exit(1);
    }

    const file = await Auth.saveCredentials(user, password);
    console.log(`\n  Guardado en ${path.relative(ROOT, file)} (usuario: ${user}).`);
    console.log('  Ese fichero está en .gitignore: no lo subas.\n');
    console.log('  Arranca el panel con:');
    console.log('    node admin/server.js --host 0.0.0.0\n');
    process.exit(0);
}

/* --------------------------------------------------------------- start ---- */

if (argFlag('--set-password')) {
    setPassword();
} else {
    // Reachable from the network without a password would mean anyone on it
    // could rewrite the channels, so refuse rather than start open.
    if (!IS_LOCAL_ONLY && !AUTH_ON) {
        console.error(`\n  No arranco en ${HOST} sin contraseña.\n`);
        console.error('  Cualquiera que llegue a este puerto podría cambiar tus canales.');
        console.error('  Configura el acceso primero:\n');
        console.error('    node admin/server.js --set-password\n');
        console.error('  O déjalo solo en local (por defecto):\n');
        console.error('    node admin/server.js\n');
        process.exit(1);
    }

    server.listen(PORT, HOST, () => {
        const shown = IS_LOCAL_ONLY ? 'localhost' : HOST;
        console.log(`\n  Wii Portfolio`);
        console.log(`  portfolio : http://${shown}:${PORT}/`);
        console.log(`  admin     : http://${shown}:${PORT}/admin/`);
        console.log(`  datos     : db/projects.json`);
        console.log(process.env.GITHUB_TOKEN
            ? `  GitHub    : usando GITHUB_TOKEN`
            : `  GitHub    : sin token (60 peticiones/hora)`);

        if (AUTH_ON) {
            console.log(`  acceso    : con login (usuario ${CREDENTIALS.user}, `
                + `desde ${CREDENTIALS.source})`);
        } else {
            console.log(`  acceso    : sin login (solo local)`);
        }

        // On a public interface over plain HTTP the password travels in clear.
        if (!IS_LOCAL_ONLY && !BEHIND_PROXY) {
            console.warn(`\n  AVISO: estás sirviendo en HTTP plano en ${HOST}.`);
            console.warn('  La contraseña viaja sin cifrar. Ponlo detrás de nginx/Caddy');
            console.warn('  con HTTPS y arranca con --behind-proxy, o úsalo solo en');
            console.warn('  una red de confianza (VPN, Tailscale, túnel SSH).');
        }

        console.log(`\n  Ctrl+C para parar\n`);
    });
}
