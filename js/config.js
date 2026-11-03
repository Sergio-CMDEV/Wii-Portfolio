// Default config
var def_config = {
    musicVol: 0.5,
    sfxVol: 0.2,
}

// Check if Local Storage is accessable
if (typeof(Storage) !== "undefined") {
    if (!localStorage.getItem('sergiocm-portfolio-settings')) {
        // Stringify the config cuz that's how it is.
        localStorage.setItem("sergiocm-portfolio-settings", JSON.stringify(def_config));
        // Reload the page so that everything works.
        location.reload();
    }
} else {
    alert('Local Storage is not support or disabled -- settings will not work!')
}

// User config
var userConfig = JSON.parse(localStorage.getItem('sergiocm-portfolio-settings'));
// Coerce volumes to numbers (older saves stored them as strings, which made
// Howler ignore them and play at full volume).
userConfig.musicVol = isNaN(parseFloat(userConfig.musicVol)) ? 0.5 : parseFloat(userConfig.musicVol);
userConfig.sfxVol = isNaN(parseFloat(userConfig.sfxVol)) ? 0.2 : parseFloat(userConfig.sfxVol);
localStorage.setItem("sergiocm-portfolio-settings", JSON.stringify(userConfig));
console.log(`user config:`, userConfig);

// ---------------------------------------------------------------- channels --
// Channels now come from 'db/projects.json', which the admin panel writes
// (see admin/README.md). The portfolio is still a static site: it just fetches
// that file and turns every enabled project into a Wii channel.
//
// 'def_channels' below is only a fallback, used when projects.json can't be
// read at all -- for instance when index.html is opened straight off the disk
// with file://, where fetch is blocked.

var def_channels = [
    /* --- Canales por defecto de la Wii (desactivados) ---
    {
        id: 'disc',
        title: 'Disc Channel',
        assets: 'assets/channels/',
        channelart: 'channelart/',
        disc: true
    },
    {
        id: 'mii',
        title: 'Mii Channel',
        assets: 'assets/channels/',
        channelart: 'channelart/'
    },
    {
        id: 'shop',
        title: 'Wii Shop Channel',
        assets: 'assets/channels/',
        channelart: 'channelart/',
        target: '/shop/index.html'
    },
    --- fin canales por defecto --- */

    // --- Reserva: canal con arte propio ---
    {
        id: 'soportemii',
        title: 'Soporte Mii',
        assets: 'assets/channels/',
        channelart: 'channelart/',
        target: 'https://p.sergiocm.cv/soporte-mii/',
        previewart: true
    }
]

// Site root, derived from this script's own URL ('<root>/js/config.js'), so the
// fetch below works from index.html and from pages in subfolders alike.
var siteRoot = (function () {
    var src = (document.currentScript && document.currentScript.src) || '';
    var match = src.match(/^(.*\/)js\/config\.js(?:\?.*)?$/);
    return match ? match[1] : '';
})();

// Channels rendered by index.html. Filled in by loadChannels().
var userChannels = [];

// index.html waits on this before placing the channels in the grid.
var channelsReady = loadChannels();

async function loadChannels() {
    // Pages that don't show the grid (settings, credits) don't load projects.js.
    if (typeof PortfolioProjects === 'undefined') {
        userChannels = [];
        return userChannels;
    }

    try {
        var res = await fetch(siteRoot + 'db/projects.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var data = await res.json();

        userChannels = PortfolioProjects.resolveAll(data.projects)
            // "Desactivado" in the panel, and repos that vanished from GitHub,
            // both just stop being channels.
            .filter(function (p) { return p.enabled && !p.missing; })
            .sort(function (a, b) { return a.order - b.order; })
            .map(PortfolioProjects.toChannel);

        console.log('canales desde db/projects.json:', userChannels);
    } catch (err) {
        console.warn('No se pudo leer db/projects.json (' + err.message
            + '); usando los canales de reserva de config.js.');
        userChannels = def_channels.slice();
    }

    return userChannels;
}

// The channel list used to be cached in localStorage; projects.json replaced
// that, so drop the stale key to avoid confusion when debugging.
try {
    localStorage.removeItem('sergiocm-portfolio-channels');
} catch (err) { /* storage disabled; nothing to clean up */ }

// Reset config
function resetConfig(confirm) {
    if (confirm == true) {
        localStorage.setItem("sergiocm-portfolio-settings", JSON.stringify(def_config));
        userConfig = JSON.parse(localStorage.getItem('sergiocm-portfolio-settings'));
        console.log(`config reset:`, userConfig);
    } else {
        console.error(`resetConfig: llama con resetConfig(true) para confirmar.`)
    }
}

// Reload the channels from db/projects.json without a full page refresh.
// (Channels are no longer stored in localStorage, so there's nothing to reset.)
async function reloadChannels() {
    await loadChannels();
    console.log(`canales recargados (recarga la página para verlos):`, userChannels);
    return userChannels;
}
