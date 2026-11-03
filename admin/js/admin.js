/*
    Admin panel.

    Edits the same shape the portfolio reads (db/projects.json) and saves it
    through the small API in admin/server.js. Every project keeps its GitHub
    data and the user's edits apart, so a field is either "de GitHub" or
    "editado" and can be reset back with one click.
*/

'use strict';

const P = window.PortfolioProjects;

// Raw state as stored on disk, plus the snapshot used to detect edits.
let state = { githubUser: '', settings: {}, projects: [] };
let baseline = '';

let filter = 'all';
let search = '';
// Which cards are expanded; kept across re-renders.
const openCards = new Set();

const el = (id) => document.getElementById(id);

const ICON_PICKS = [
    '\u{1F4E6}', '\u{1F3AE}', '\u{1F310}', '\u{1F4C4}', '\u{1F6D2}',
    '\u{1F4CB}', '\u{1F6E0}', '\u{1F5A7}', '\u{1F4BB}', '\u{1F916}',
    '☕', '\u{1F40D}', '⚡', '\u{1F48E}', '\u{1F3A8}',
    '\u{1F4CA}', '\u{1F511}', '\u{1F9EA}', '\u{1F680}', '⭐'
];

const EDITABLE = ['title', 'description', 'target', 'language', 'color', 'icon', 'style'];

/* --------------------------------------------------------------- helpers -- */

function toast(message, kind = '', ms = 4200) {
    const node = document.createElement('div');
    node.className = `toast ${kind}`.trim();
    node.textContent = message;
    el('toasts').appendChild(node);
    setTimeout(() => {
        node.style.opacity = '0';
        setTimeout(() => node.remove(), 250);
    }, ms);
}

async function api(path, options = {}) {
    const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    const data = await res.json().catch(() => ({}));

    // The session expired while the tab was open: back to the login page,
    // remembering where we were.
    if (res.status === 401) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.href = `/admin/login.html?next=${next}`;
        throw new Error(data.error || 'Sesión caducada.');
    }

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

// Shows who is signed in, when the server has a login configured at all.
async function loadSession() {
    try {
        const info = await api('/api/session');
        if (!info.authEnabled) return;

        el('session').hidden = false;
        el('who').textContent = info.user || '';
        el('logoutBtn').addEventListener('click', async () => {
            if (isDirty() && !window.confirm(
                'Tienes cambios sin guardar. ¿Salir de todas formas?')) return;
            await api('/api/logout', { method: 'POST' }).catch(() => {});
            location.href = '/admin/login.html';
        });
    } catch { /* no session endpoint: older server, nothing to show */ }
}

function isDirty() {
    return snapshot() !== baseline;
}

// Only the parts that get saved, so cosmetic state can't look like an edit.
function snapshot() {
    return JSON.stringify({
        githubUser: state.githubUser,
        settings: state.settings,
        projects: state.projects.map((p) => ({
            id: p.id,
            repo: p.repo || '',
            overrides: p.overrides || {},
            enabled: p.enabled !== false,
            order: p.order,
            useOwnArt: !!p.useOwnArt
        }))
    });
}

function markDirty() {
    const dirty = isDirty();
    el('saveBtn').disabled = !dirty;
    el('savebar').classList.toggle('on', dirty);
}

function adoptState(data) {
    state = {
        githubUser: data.githubUser || '',
        syncedAt: data.syncedAt || null,
        settings: data.settings || {},
        projects: (data.projects || []).map((p) => ({ ...p, overrides: { ...(p.overrides || {}) } }))
    };
    baseline = snapshot();
    el('githubUser').value = state.githubUser;
}

function find(id) {
    return state.projects.find((p) => p.id === id);
}

// The default a field falls back to when it has no override.
function defaultFor(project, key) {
    const stripped = { ...project, overrides: {} };
    return P.resolve(stripped)[key];
}

function relDate(iso) {
    if (!iso) return '';
    const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
    if (Number.isNaN(days)) return '';
    if (days <= 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 30) return `hace ${days} días`;
    const months = Math.floor(days / 30);
    if (months < 12) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
    const years = Math.floor(days / 365);
    return `hace ${years} ${years === 1 ? 'año' : 'años'}`;
}

// Channel art URL for the preview, resolved from the admin folder.
function artUrl(resolved) {
    return '../' + P.toChannel(resolved).art;
}

/* ---------------------------------------------------------------- render -- */

function matchesSearch(resolved) {
    if (!search) return true;
    const q = search.toLowerCase();
    return [resolved.title, resolved.repo, resolved.description, resolved.language]
        .join(' ').toLowerCase().includes(q);
}

function render() {
    const all = P.resolveAll(state.projects).sort((a, b) => a.order - b.order);

    // Stats always count everything, not just what the filters show.
    const active = all.filter((p) => p.enabled && !p.missing).length;
    const off = all.filter((p) => !p.enabled).length;
    el('stats').innerHTML = `
        <span class="stat"><b>${all.length}</b> proyectos</span>
        <span class="stat"><b>${active}</b> en el portfolio</span>
        <span class="stat"><b>${off}</b> desactivados</span>
    `;

    const shown = all.filter((p) => {
        if (filter === 'on' && !p.enabled) return false;
        if (filter === 'off' && p.enabled) return false;
        return matchesSearch(p);
    });

    const list = el('list');

    if (!all.length) {
        list.innerHTML = `
            <div class="empty">
                <div class="big">&#127918;</div>
                <p><strong>Todavía no hay proyectos.</strong></p>
                <p>Pulsa <strong>Sincronizar con GitHub</strong> para traer los
                   repositorios de <strong>${escapeHtml(state.githubUser)}</strong>
                   y convertirlos en canales.</p>
            </div>`;
        return;
    }

    if (!shown.length) {
        list.innerHTML = `
            <div class="empty">
                <div class="big">&#128269;</div>
                <p>Ningún proyecto coincide con el filtro.</p>
            </div>`;
        return;
    }

    const cards = document.createElement('div');
    cards.className = 'cards';
    shown.forEach((resolved, index) => {
        cards.appendChild(buildCard(resolved, index, shown.length));
    });

    list.replaceChildren(cards);
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function buildCard(resolved, index, count) {
    const project = find(resolved.id);
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = resolved.id;
    if (!resolved.enabled) card.classList.add('off');
    if (resolved.missing) card.classList.add('missing');
    if (openCards.has(resolved.id)) card.classList.add('open');

    const tags = [];
    if (resolved.language) {
        tags.push(`<span class="tag"><span class="swatch"
            style="background:${escapeHtml(resolved.color)}"></span>${escapeHtml(resolved.language)}</span>`);
    }
    if (resolved.stars > 0) tags.push(`<span class="tag">&#9733; ${resolved.stars}</span>`);
    if (resolved.pushedAt) tags.push(`<span class="tag">${escapeHtml(relDate(resolved.pushedAt))}</span>`);
    if (resolved.useOwnArt) tags.push(`<span class="tag art">arte propio</span>`);
    if (resolved.archived) tags.push(`<span class="tag">archivado</span>`);
    if (resolved.fork) tags.push(`<span class="tag">fork</span>`);
    if (resolved.missing) {
        tags.push(`<span class="tag alert">ya no está en GitHub</span>`);
    }
    if (resolved.customized.length) {
        tags.push(`<span class="tag art">${resolved.customized.length} campo${
            resolved.customized.length === 1 ? '' : 's'} editado${
            resolved.customized.length === 1 ? '' : 's'}</span>`);
    }

    card.innerHTML = `
        <div class="card-head">
            <div class="preview">
                <iframe src="${escapeHtml(artUrl(resolved))}" loading="lazy"
                        title="Vista previa de ${escapeHtml(resolved.title)}"
                        tabindex="-1"></iframe>
            </div>

            <div class="head-text">
                <div class="name">
                    <span class="js-name">${escapeHtml(resolved.title)}</span>
                </div>
                <div class="sub">${escapeHtml(resolved.description || 'Sin descripción')}</div>
                <div class="tags">${tags.join('')}</div>
            </div>

            <div class="head-actions">
                <div class="order-btns">
                    <button class="js-up" title="Subir" ${index === 0 ? 'disabled' : ''}>&#9650;</button>
                    <button class="js-down" title="Bajar" ${index === count - 1 ? 'disabled' : ''}>&#9660;</button>
                </div>

                <label class="switch" title="Mostrar u ocultar este canal en el portfolio">
                    <input type="checkbox" class="js-enabled" ${resolved.enabled ? 'checked' : ''} />
                    <span class="track"></span>
                    <span class="state">${resolved.enabled ? 'Activo' : 'Desactivado'}</span>
                </label>

                <button class="btn ghost js-toggle" title="Editar">
                    ${openCards.has(resolved.id) ? 'Cerrar' : 'Editar'}
                </button>
            </div>
        </div>

        <div class="card-body">
            <div class="grid-fields">
                ${fieldText(project, 'title', 'Título del canal')}
                ${fieldText(project, 'language', 'Lenguaje / etiqueta')}
                ${fieldStyle(project)}
                ${fieldColor(project)}
                ${fieldIcon(project)}
                ${fieldTextarea(project, 'description', 'Descripción')}
                ${fieldText(project, 'target', 'Enlace al pulsar Start', 'wide')}
            </div>

            <div class="card-foot">
                <label class="switch" style="gap:7px">
                    <input type="checkbox" class="js-ownart" ${resolved.useOwnArt ? 'checked' : ''} />
                    <span class="track"></span>
                    <span>Usar arte propio de <code>channelart/${escapeHtml(resolved.id)}/</code></span>
                </label>

                <div class="spacer"></div>

                ${resolved.repoUrl
                    ? `<a href="${escapeHtml(resolved.repoUrl)}" target="_blank" rel="noopener">Ver repo &#8599;</a>`
                    : ''}
                ${resolved.homepage
                    ? `<a href="${escapeHtml(resolved.homepage)}" target="_blank" rel="noopener">Ver demo &#8599;</a>`
                    : ''}
                ${resolved.missing
                    ? `<button class="link-danger js-remove">Quitar del panel</button>`
                    : `<button class="link-danger js-exclude">Excluir de la sincronización</button>`}
            </div>
        </div>
    `;

    wireCard(card, resolved);
    return card;
}

/* ---------------------------------------------------------------- fields -- */

// Style and icon aren't GitHub data -- they're derived here -- so they say
// "automático" rather than claiming to come from the repo.
const DERIVED = new Set(['style', 'icon']);

function originLabel(key) {
    return DERIVED.has(key) ? 'automático' : 'de GitHub';
}

function labelRow(project, key, label) {
    const custom = !!(project.overrides && project.overrides[key]);
    return `
        <span class="label-row">
            ${escapeHtml(label)}
            <span class="origin ${custom ? 'custom' : ''} js-origin-${key}">${
                custom ? 'editado' : originLabel(key)}</span>
            <button type="button" class="reset-field ${custom ? 'on' : ''} js-reset-${key}"
                    data-key="${key}">volver al ${
                        DERIVED.has(key) ? 'automático' : 'valor de GitHub'}</button>
        </span>`;
}

function fieldText(project, key, label, extra = '') {
    const resolved = P.resolve(project);
    return `
        <label class="field ${extra}">
            ${labelRow(project, key, label)}
            <input type="text" class="js-field" data-key="${key}"
                   value="${escapeHtml(resolved[key] || '')}"
                   placeholder="${escapeHtml(defaultFor(project, key) || '')}" />
        </label>`;
}

function fieldTextarea(project, key, label) {
    const resolved = P.resolve(project);
    return `
        <label class="field wide">
            ${labelRow(project, key, label)}
            <textarea class="js-field" data-key="${key}"
                      placeholder="${escapeHtml(defaultFor(project, key) || 'Sin descripción')}"
                      >${escapeHtml(resolved[key] || '')}</textarea>
        </label>`;
}

function fieldColor(project) {
    const resolved = P.resolve(project);
    return `
        <label class="field">
            ${labelRow(project, 'color', 'Color del canal')}
            <span class="color-row">
                <input type="color" class="js-color" value="${escapeHtml(resolved.color)}" />
                <input type="text" class="js-field" data-key="color"
                       value="${escapeHtml(resolved.color)}" spellcheck="false" />
            </span>
        </label>`;
}

function fieldStyle(project) {
    const resolved = P.resolve(project);
    return `
        <label class="field">
            ${labelRow(project, 'style', 'Estilo del canal')}
            <select class="js-field" data-key="style">
                ${P.STYLES.map((s) => `
                    <option value="${escapeHtml(s.id)}" ${
                        s.id === resolved.style ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
                ).join('')}
            </select>
        </label>`;
}

function fieldIcon(project) {
    const resolved = P.resolve(project);
    return `
        <label class="field">
            ${labelRow(project, 'icon', 'Icono de fondo')}
            <span class="icon-row">
                <input type="text" class="js-field" data-key="icon"
                       value="${escapeHtml(resolved.icon)}" />
                <span class="icon-picks">
                    ${ICON_PICKS.map((icon) =>
                        `<button type="button" class="js-pick" data-icon="${escapeHtml(icon)}"
                         >${escapeHtml(icon)}</button>`).join('')}
                </span>
            </span>
        </label>`;
}

/* ----------------------------------------------------------------- wiring -- */

function wireCard(card, resolved) {
    const id = resolved.id;
    const project = find(id);

    // Expand / collapse.
    const toggle = () => {
        if (openCards.has(id)) openCards.delete(id);
        else openCards.add(id);
        card.classList.toggle('open');
        card.querySelector('.js-toggle').textContent =
            openCards.has(id) ? 'Cerrar' : 'Editar';
    };
    card.querySelector('.js-toggle').addEventListener('click', toggle);
    card.querySelector('.preview').addEventListener('click', toggle);

    // Enabled / "desactivado".
    card.querySelector('.js-enabled').addEventListener('change', (ev) => {
        project.enabled = ev.target.checked;
        card.classList.toggle('off', !project.enabled);
        card.querySelector('.switch .state').textContent =
            project.enabled ? 'Activo' : 'Desactivado';
        // The counters in the toolbar move with it.
        refreshStats();
        markDirty();
    });

    card.querySelector('.js-ownart').addEventListener('change', (ev) => {
        project.useOwnArt = ev.target.checked;
        refreshPreview(card, id);
        markDirty();
        if (ev.target.checked) {
            toast(`"${resolved.title}" usará channelart/${id}/channel.html. `
                + `Si esa carpeta no existe, el canal saldrá en blanco.`, 'warn', 6000);
        }
    });

    // Reorder.
    card.querySelector('.js-up').addEventListener('click', () => move(id, -1));
    card.querySelector('.js-down').addEventListener('click', () => move(id, 1));

    // Text fields.
    card.querySelectorAll('.js-field').forEach((input) => {
        input.addEventListener('input', () => {
            setOverride(card, id, input.dataset.key, input.value);
        });
    });

    // Colour picker mirrors the hex field.
    const colorPicker = card.querySelector('.js-color');
    if (colorPicker) {
        const hexInput = card.querySelector('.js-field[data-key="color"]');
        colorPicker.addEventListener('input', () => {
            hexInput.value = colorPicker.value;
            setOverride(card, id, 'color', colorPicker.value);
        });
    }

    // Icon shortcuts.
    card.querySelectorAll('.js-pick').forEach((button) => {
        button.addEventListener('click', () => {
            const input = card.querySelector('.js-field[data-key="icon"]');
            input.value = button.dataset.icon;
            setOverride(card, id, 'icon', button.dataset.icon);
        });
    });

    // Per-field reset back to the GitHub value.
    card.querySelectorAll('.reset-field').forEach((button) => {
        button.addEventListener('click', (ev) => {
            ev.preventDefault();
            const key = button.dataset.key;
            delete project.overrides[key];

            const fresh = P.resolve(project);
            const input = card.querySelector(`.js-field[data-key="${key}"]`);
            if (input) input.value = fresh[key] || '';
            if (key === 'color' && colorPicker) colorPicker.value = fresh.color;

            refreshFieldState(card, id, key);
            refreshHead(card, id);
            refreshPreview(card, id);
            markDirty();
        });
    });

    const exclude = card.querySelector('.js-exclude');
    if (exclude) {
        exclude.addEventListener('click', () => {
            const repo = project.repo || project.id;
            if (!window.confirm(
                `¿Excluir "${repo}" del panel?\n\n`
                + `Se quitará de la lista y las próximas sincronizaciones `
                + `ya no lo volverán a traer. Se pierden los cambios hechos en él.`)) return;

            state.settings.excluded = state.settings.excluded || [];
            if (project.repo && !state.settings.excluded.includes(project.repo)) {
                state.settings.excluded.push(project.repo);
            }
            state.projects = state.projects.filter((p) => p.id !== id);
            reindex();
            render();
            markDirty();
            toast(`"${repo}" excluido. Guarda para confirmarlo.`, 'warn');
        });
    }

    const remove = card.querySelector('.js-remove');
    if (remove) {
        remove.addEventListener('click', () => {
            if (!window.confirm(`¿Quitar "${resolved.title}" del panel?`)) return;
            state.projects = state.projects.filter((p) => p.id !== id);
            reindex();
            render();
            markDirty();
        });
    }
}

/*
    Store (or clear) one edited field.

    Typing the GitHub value back by hand clears the override instead of pinning
    an identical custom value, so the "de GitHub" / "editado" badge stays honest.
*/
function setOverride(card, id, key, rawValue) {
    const project = find(id);
    const value = rawValue.trim();

    if (!value || value === String(defaultFor(project, key) || '')) {
        delete project.overrides[key];
    } else {
        project.overrides[key] = value;
    }

    refreshFieldState(card, id, key);
    refreshHead(card, id);
    refreshPreview(card, id);
    markDirty();
}

function refreshFieldState(card, id, key) {
    const project = find(id);
    const custom = !!project.overrides[key];

    const badge = card.querySelector(`.js-origin-${key}`);
    if (badge) {
        badge.textContent = custom ? 'editado' : originLabel(key);
        badge.classList.toggle('custom', custom);
    }

    const reset = card.querySelector(`.js-reset-${key}`);
    if (reset) reset.classList.toggle('on', custom);
}

// Keep the card header in step with the fields without a full re-render,
// which would blow away focus while typing.
function refreshHead(card, id) {
    const resolved = P.resolve(find(id));
    card.querySelector('.js-name').textContent = resolved.title;
    card.querySelector('.sub').textContent = resolved.description || 'Sin descripción';
}

// Reloading the art iframe on each keystroke flickers, so coalesce.
const previewTimers = new Map();
function refreshPreview(card, id) {
    clearTimeout(previewTimers.get(id));
    previewTimers.set(id, setTimeout(() => {
        const frame = card.querySelector('.preview iframe');
        if (frame) frame.src = artUrl(P.resolve(find(id)));
    }, 400));
}

function refreshStats() {
    const all = P.resolveAll(state.projects);
    const active = all.filter((p) => p.enabled && !p.missing).length;
    const off = all.filter((p) => !p.enabled).length;
    el('stats').innerHTML = `
        <span class="stat"><b>${all.length}</b> proyectos</span>
        <span class="stat"><b>${active}</b> en el portfolio</span>
        <span class="stat"><b>${off}</b> desactivados</span>
    `;
}

function reindex() {
    state.projects
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .forEach((p, i) => { p.order = i; });
}

/*
    Move a project one place up or down.

    The two projects swap positions AND their order numbers have to be
    rewritten from the new positions. Re-running reindex() here would sort by
    the old order values first and undo the swap, which is what made the
    arrows appear to do nothing.
*/
function move(id, delta) {
    const list = state.projects.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const from = list.findIndex((p) => p.id === id);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= list.length) return;

    [list[from], list[to]] = [list[to], list[from]];
    list.forEach((p, i) => { p.order = i; });
    state.projects = list;

    render();
    markDirty();
}

/* ---------------------------------------------------------------- actions -- */

async function save() {
    const buttons = [el('saveBtn'), el('savebarSave')];
    buttons.forEach((b) => { b.disabled = true; });

    try {
        reindex();
        state.githubUser = el('githubUser').value.trim() || state.githubUser;

        const data = await api('/api/state', {
            method: 'PUT',
            body: JSON.stringify({
                githubUser: state.githubUser,
                settings: state.settings,
                projects: state.projects
            })
        });

        adoptState(data);
        render();
        markDirty();

        const active = P.resolveAll(state.projects)
            .filter((p) => p.enabled && !p.missing).length;

        // The server drops values it can't accept. Saying "saved" while a
        // field quietly reverted is what made edits look like they vanished,
        // so name what was refused instead.
        const rejected = data.rejected || [];
        if (rejected.length) {
            toast(`Guardado, pero ${rejected.length} valor${rejected.length === 1 ? '' : 'es'} `
                + `no se guardó${rejected.length === 1 ? '' : 'n'}.`, 'warn', 9000);
            for (const r of rejected.slice(0, 4)) {
                toast(`"${r.id}" · ${r.key}: ${r.reason}`, 'err', 11000);
            }
        } else {
            toast(`Guardado en db/projects.json · ${active} canales en el portfolio.`, 'ok');
        }
    } catch (err) {
        toast(`No se pudo guardar: ${err.message}`, 'err', 7000);
    } finally {
        markDirty();
    }
}

async function sync() {
    const button = el('syncBtn');
    const label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = 'Sincronizando&hellip;';

    try {
        if (isDirty() && !window.confirm(
            'Tienes cambios sin guardar.\n\n'
            + 'La sincronización trabaja sobre lo que hay guardado en disco, '
            + 'así que esos cambios se perderán. ¿Continuar?')) {
            return;
        }

        const data = await api('/api/sync', {
            method: 'POST',
            body: JSON.stringify({ githubUser: el('githubUser').value.trim() })
        });

        adoptState(data);
        render();
        markDirty();

        const s = data.summary;
        const parts = [`${s.total} repos leídos`];
        if (s.added.length) parts.push(`${s.added.length} nuevos`);
        if (s.missing.length) parts.push(`${s.missing.length} ya no existen`);
        toast(parts.join(' · '), 'ok');

        if (s.added.length) {
            toast(`Nuevos canales: ${s.added.join(', ')}`, '', 7000);
        }
        if (s.missing.length) {
            toast(`Sin repo en GitHub: ${s.missing.join(', ')}. `
                + `Siguen en el panel pero no salen en el portfolio.`, 'warn', 8000);
        }
    } catch (err) {
        toast(err.message, 'err', 9000);
    } finally {
        button.disabled = false;
        button.innerHTML = label;
    }
}

async function load() {
    try {
        const data = await api('/api/state');
        adoptState(data);
        render();
        markDirty();
    } catch (err) {
        el('list').innerHTML = `
            <div class="empty">
                <div class="big">&#9888;</div>
                <p><strong>No se pudo contactar con el servidor del panel.</strong></p>
                <p>${escapeHtml(err.message)}</p>
                <p>Arráncalo con <code>node admin/server.js</code> y abre
                   <code>http://localhost:8000/admin/</code>.</p>
            </div>`;
    }
}

/* ------------------------------------------------------------------- init -- */

el('saveBtn').addEventListener('click', save);
el('savebarSave').addEventListener('click', save);
el('syncBtn').addEventListener('click', sync);

el('discardBtn').addEventListener('click', () => {
    if (!window.confirm('¿Descartar todos los cambios sin guardar?')) return;
    adoptState(JSON.parse(baseline));
    render();
    markDirty();
});

el('githubUser').addEventListener('input', () => {
    state.githubUser = el('githubUser').value.trim();
    markDirty();
});

el('search').addEventListener('input', (ev) => {
    search = ev.target.value.trim();
    render();
});

el('filter').addEventListener('click', (ev) => {
    const button = ev.target.closest('button[data-filter]');
    if (!button) return;
    filter = button.dataset.filter;
    el('filter').querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', b === button);
    });
    render();
});

// Ctrl/Cmd+S saves, like any editor.
window.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
        ev.preventDefault();
        if (isDirty()) save();
    }
});

window.addEventListener('beforeunload', (ev) => {
    if (isDirty()) {
        ev.preventDefault();
        ev.returnValue = '';
    }
});

loadSession();
load();
