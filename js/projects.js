/*
    Shared project <-> channel logic.

    Loaded by the portfolio (index.html), by the admin panel, and required by
    the admin server, so the rules for turning a GitHub repo into a Wii channel
    live in exactly one place.

    A project keeps its GitHub data and the user's edits apart:

        {
            id:       "poketon",          // channel id, unique
            repo:     "poketon",          // GitHub repo name (absent if manual)
            github:   { ... },            // refreshed on every sync
            overrides:{ title: "..." },   // only what the user changed
            enabled:  true,               // the admin panel's on/off switch
            order:    0,                  // position in the Wii grid
            useOwnArt:false               // true -> channelart/<id>/ instead of
                                          //         the shared template
        }

    So re-syncing refreshes `github` without ever clobbering an edit, and the
    admin panel can show a field as "from GitHub" or "custom" and reset it.
*/
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PortfolioProjects = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {

    // GitHub's own language colours, for the ones that show up here.
    var LANG_COLORS = {
        'JavaScript': '#f1e05a',
        'TypeScript': '#3178c6',
        'HTML': '#e34c26',
        'CSS': '#563d7c',
        'SCSS': '#c6538c',
        'Java': '#b07219',
        'Kotlin': '#a97bff',
        'Python': '#3572a5',
        'C': '#555555',
        'C++': '#f34b7d',
        'C#': '#178600',
        'PHP': '#4f5d95',
        'Go': '#00add8',
        'Rust': '#dea584',
        'Ruby': '#701516',
        'Swift': '#f05138',
        'Dart': '#00b4ab',
        'Shell': '#89e051',
        'PowerShell': '#012456',
        'Vue': '#41b883',
        'Svelte': '#ff3e00',
        'Lua': '#000080',
        'Dockerfile': '#384d54',
        'Makefile': '#427819',
        'SQL': '#e38c00',
        'Jupyter Notebook': '#da5b0b'
    };

    // Watermark glyph per language; the name heuristics below can override it.
    var LANG_ICONS = {
        'JavaScript': '⚡',
        'TypeScript': '\u{1F537}',
        'HTML': '\u{1F310}',
        'CSS': '\u{1F3A8}',
        'SCSS': '\u{1F3A8}',
        'Java': '☕',
        'Kotlin': '\u{1F916}',
        'Python': '\u{1F40D}',
        'C': '⚙',
        'C++': '⚙',
        'C#': '\u{1F3AF}',
        'PHP': '\u{1F418}',
        'Go': '\u{1F439}',
        'Rust': '\u{1F980}',
        'Ruby': '\u{1F48E}',
        'Swift': '\u{1F985}',
        'Dart': '\u{1F3AF}',
        'Shell': '\u{1F41A}',
        'PowerShell': '\u{1F4BB}',
        'Dockerfile': '\u{1F433}',
        'SQL': '\u{1F5C4}'
    };

    // Matched against the repo name / description to pick a better glyph.
    var NAME_ICONS = [
        [/poke|pokemon|game|juego|flix|cobblemon/i, '\u{1F3AE}'],
        [/tienda|shop|store|ecommerce|carrito/i, '\u{1F6D2}'],
        [/cv|curriculum|resume|portfolio|webpage/i, '\u{1F4C4}'],
        [/cliente|crm|gestor|gestion|employee|empleado|rrhh/i, '\u{1F4CB}'],
        [/soporte|support|help|ayuda/i, '\u{1F6E0}'],
        [/api|server|backend|springboot|spring/i, '\u{1F5A7}'],
        [/examen|practica|test|evaluacion|ejercicio/i, '\u{1F4D0}'],
        [/git|flow|devops|ci/i, '\u{1F500}'],
        [/bot|discord|telegram/i, '\u{1F916}'],
        [/music|audio|sound|radio/i, '\u{1F3B5}'],
        [/chat|mensaje|message|social/i, '\u{1F4AC}']
    ];

    var DEFAULT_ICON = '\u{1F4E6}';
    var DEFAULT_COLOR = '#37bef4';

    /*
        Tile styles.

        The real Wii menu is mostly white channels with a coloured wordmark and
        a pattern, with only a few dark ones. One look for every project made
        the grid flat, so each channel gets a style and the default is spread
        across the list instead of being the same for all.
    */
    var STYLES = [
        // --- Claros ---
        { id: 'light',     name: 'Blanco limpio' },
        { id: 'arc',       name: 'Horizonte curvo' },
        { id: 'stripes',   name: 'Rayas diagonales' },
        { id: 'dots',      name: 'Cuadrícula de puntos' },
        { id: 'waves',     name: 'Olas' },
        { id: 'grid',      name: 'Rejilla en perspectiva' },
        { id: 'orbit',     name: 'Órbitas' },
        { id: 'cards',     name: 'Tarjetas' },
        { id: 'sunburst',  name: 'Rayos' },
        { id: 'blocks',    name: 'Mosaico' },
        { id: 'band',      name: 'Banda de color' },
        { id: 'ribbon',    name: 'Banderola' },
        { id: 'mountains', name: 'Montañas' },
        { id: 'clouds',    name: 'Nubes' },
        { id: 'hexes',     name: 'Panal' },
        { id: 'triangles', name: 'Triángulos' },
        { id: 'radar',     name: 'Radar' },
        { id: 'vinyl',     name: 'Vinilo' },
        { id: 'window',    name: 'Ventana de app' },
        { id: 'confetti',  name: 'Confeti' },
        { id: 'notebook',  name: 'Cuaderno' },
        { id: 'chevrons',  name: 'Galones' },
        { id: 'petals',    name: 'Pétalos' },
        { id: 'stack',     name: 'Capas isométricas' },
        { id: 'balloons',  name: 'Globos' },

        // --- Oscuros ---
        { id: 'bubbles',   name: 'Burbujas' },
        { id: 'dark',      name: 'Oscuro' },
        { id: 'terminal',  name: 'Terminal' },
        { id: 'starfield', name: 'Estrellas' },
        { id: 'aurora',    name: 'Aurora' },
        { id: 'blueprint', name: 'Plano técnico' },
        { id: 'circuit',   name: 'Circuito' },
        { id: 'neon',      name: 'Neón' }
    ];

    var STYLE_IDS = STYLES.map(function (s) { return s.id; });

    /*
        Stable per-project pick: the same project always gets the same style,
        but different names spread across the whole set.

        FNV-1a with a final avalanche step, rather than the usual hash*31:
        project names here share long prefixes ("webpage-cv",
        "webpage-eldermilion") and the weaker hash kept mapping them to the
        same style, so the grid came out with visible repeats.
    */
    function autoStyle(project) {
        var key = String(project.id || project.repo || '');
        var hash = 2166136261;
        for (var i = 0; i < key.length; i++) {
            hash ^= key.charCodeAt(i);
            hash = Math.imul(hash, 16777619) >>> 0;
        }
        hash = (hash ^ (hash >>> 15)) >>> 0;
        hash = Math.imul(hash, 2246822507) >>> 0;
        // ">>> 0" again: ^ yields a signed int, and a negative index would
        // read past the start of the array and hand back undefined.
        hash = (hash ^ (hash >>> 13)) >>> 0;
        return STYLE_IDS[hash % STYLE_IDS.length];
    }

    // Audio used by generated channels, since they have no music of their own.
    var DEFAULT_AUDIO = 'assets/channels/nintendo/audio.mp3';

    // The shared channel art template, and where generated channels look for
    // their (optional) own assets folder.
    var PROJECT_ART = 'channelart/_project/channel.html';
    var PROJECT_ASSETS = 'assets/channels/';

    function langColor(lang) {
        if (!lang) return DEFAULT_COLOR;
        return LANG_COLORS[lang] || DEFAULT_COLOR;
    }

    function iconFor(project) {
        var gh = project.github || {};
        var haystack = [project.repo || '', gh.description || ''].join(' ');
        for (var i = 0; i < NAME_ICONS.length; i++) {
            if (NAME_ICONS[i][0].test(haystack)) return NAME_ICONS[i][1];
        }
        if (gh.language && LANG_ICONS[gh.language]) return LANG_ICONS[gh.language];
        return DEFAULT_ICON;
    }

    // "App-tienda-springboot" -> "App Tienda Springboot"
    function prettifyName(name) {
        if (!name) return '';
        return String(name)
            .replace(/[-_.]+/g, ' ')
            // Split camelCase / PascalCase runs, but keep acronyms together.
            .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .map(function (word) {
                if (!word) return word;
                // Leave all-caps words (CRUD, POO, API) as they are.
                if (word.length > 1 && word === word.toUpperCase()) return word;
                return word.charAt(0).toUpperCase() + word.slice(1);
            })
            .join(' ');
    }

    // Wii channel tags are tiny; keep generated titles short enough to read.
    function shortTitle(name) {
        var pretty = prettifyName(name);
        if (pretty.length <= 30) return pretty;
        return pretty.slice(0, 29).trim() + '…';
    }

    /*
        Collapse a project's GitHub data and its overrides into the flat set of
        values the portfolio and the admin panel both render.
    */
    function resolve(project) {
        var gh = project.github || {};
        var ov = project.overrides || {};

        function pick(key, fallback) {
            return (ov[key] !== undefined && ov[key] !== null && ov[key] !== '')
                ? ov[key]
                : fallback;
        }

        var language = pick('language', gh.language || '');

        // A channel with its own hand-made art keeps its own folder's music too.
        var useOwnArt = !!project.useOwnArt;
        var defaultAudio = useOwnArt
            ? PROJECT_ASSETS + project.id + '/audio.mp3'
            : DEFAULT_AUDIO;

        return {
            id: project.id,
            repo: project.repo || '',
            source: project.repo ? 'github' : 'manual',
            enabled: project.enabled !== false,
            order: typeof project.order === 'number' ? project.order : 0,
            useOwnArt: useOwnArt,
            // Repo no longer reachable on GitHub (deleted, renamed or private).
            missing: !!project.missing,

            title: pick('title', shortTitle(project.repo || project.id)),
            description: pick('description', gh.description || ''),
            // Prefer a live demo (GitHub's "homepage" field) over the repo page.
            target: pick('target', gh.homepage || gh.url || ''),
            language: language,
            color: pick('color', langColor(language)),
            icon: pick('icon', iconFor(project)),
            style: pick('style', autoStyle(project)),
            audio: pick('audio', defaultAudio),

            stars: gh.stars || 0,
            archived: !!gh.archived,
            fork: !!gh.fork,
            pushedAt: gh.pushedAt || '',
            repoUrl: gh.url || '',
            homepage: gh.homepage || '',

            // Which fields the user has pinned to a custom value.
            customized: Object.keys(ov).filter(function (k) {
                return ov[k] !== undefined && ov[k] !== null && ov[k] !== '';
            })
        };
    }

    function resolveAll(projects) {
        return (projects || []).map(resolve);
    }

    /*
        Turn a resolved project into the channel object index.html consumes.

        `art` points every generated channel at the one shared template and
        passes the look in as query params, so no per-project art folder is
        needed. `previewart` makes the Start screen reuse the same scene.
    */
    function toChannel(resolved) {
        var art;

        if (resolved.useOwnArt) {
            // Hand-made art lives in its own folder, as the stock channels do.
            art = 'channelart/' + resolved.id + '/channel.html';
        } else {
            art = PROJECT_ART
                + '?title=' + encodeURIComponent(resolved.title)
                + '&lang=' + encodeURIComponent(resolved.language || '')
                + '&color=' + encodeURIComponent(resolved.color || DEFAULT_COLOR)
                + '&icon=' + encodeURIComponent(resolved.icon || DEFAULT_ICON)
                + '&style=' + encodeURIComponent(resolved.style || 'light')
                + '&stars=' + encodeURIComponent(resolved.stars || 0)
                // Only the big Start screen has room for it.
                + '&desc=' + encodeURIComponent(resolved.description || '');
        }

        var channel = {
            id: resolved.id,
            title: resolved.title,
            assets: PROJECT_ASSETS,
            channelart: 'channelart/',
            art: art,
            audio: resolved.audio,
            // The Start screen reuses the tile's own animated scene.
            previewart: true,
            project: true,
            description: resolved.description
        };

        if (resolved.target) {
            channel.target = resolved.target;
        }

        return channel;
    }

    // Channel ids end up in selectors and file paths, so keep them tame.
    function slugify(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48) || 'project';
    }

    // Reduce a GitHub API repo to just the fields that are stored.
    function fromApiRepo(repo) {
        return {
            name: repo.name,
            description: repo.description || '',
            language: repo.language || '',
            stars: repo.stargazers_count || 0,
            url: repo.html_url || '',
            homepage: (repo.homepage || '').trim(),
            topics: repo.topics || [],
            archived: !!repo.archived,
            fork: !!repo.fork,
            pushedAt: repo.pushed_at || '',
            createdAt: repo.created_at || ''
        };
    }

    return {
        LANG_COLORS: LANG_COLORS,
        LANG_ICONS: LANG_ICONS,
        STYLES: STYLES,
        STYLE_IDS: STYLE_IDS,
        autoStyle: autoStyle,
        DEFAULT_ICON: DEFAULT_ICON,
        DEFAULT_COLOR: DEFAULT_COLOR,
        DEFAULT_AUDIO: DEFAULT_AUDIO,
        PROJECT_ART: PROJECT_ART,
        langColor: langColor,
        iconFor: iconFor,
        prettifyName: prettifyName,
        shortTitle: shortTitle,
        resolve: resolve,
        resolveAll: resolveAll,
        toChannel: toChannel,
        slugify: slugify,
        fromApiRepo: fromApiRepo
    };
});
