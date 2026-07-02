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

// Default channels
// Only channels made by me are active. The original Wii default channels are
// kept commented out so they can be re-enabled later; the non-Wii placeholder
// channels (about, projects, github, contact) were removed.
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

    // --- Mis canales ---
    {
        id: 'soportemii',
        title: 'Soporte Mii',
        assets: 'assets/channels/',
        channelart: 'channelart/',
        target: 'https://p.sergiocm.cv/soporte-mii/',
        previewart: true
    }
]

// Set channels if they aren't set
if (!localStorage.getItem('sergiocm-portfolio-channels')) {
    localStorage.setItem("sergiocm-portfolio-channels", JSON.stringify(def_channels));
}
var userChannels = JSON.parse(localStorage.getItem('sergiocm-portfolio-channels'));

// Keep the stored channel list exactly in sync with def_channels.
// localStorage caches the channels, so changes to def_channels wouldn't take
// effect until reset. This adds missing channels, refreshes existing ones, and
// removes any stored channel that's no longer in def_channels (e.g. commented
// out or deleted) so those stop showing up.
(function syncDefaultChannels() {
    var changed = false;
    // Add or update channels defined in def_channels.
    for (const channel of def_channels) {
        var existing = userChannels.findIndex((element) => element.id === channel.id);
        if (existing === -1) {
            userChannels.push(channel);
            changed = true;
        } else if (JSON.stringify(userChannels[existing]) !== JSON.stringify(channel)) {
            userChannels[existing] = channel;
            changed = true;
        }
    }
    // Remove stored channels that are no longer defined in def_channels.
    for (var i = userChannels.length - 1; i >= 0; i--) {
        if (!def_channels.find((element) => element.id === userChannels[i].id)) {
            userChannels.splice(i, 1);
            changed = true;
        }
    }
    if (changed) {
        localStorage.setItem("sergiocm-portfolio-channels", JSON.stringify(userChannels));
        console.log(`default channels synced:`, userChannels);
    }
})();

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

// Reset channels
function resetChannels(confirm) {
    if (confirm == true) {
        localStorage.setItem("sergiocm-portfolio-channels", JSON.stringify(def_channels));
        userChannels = JSON.parse(localStorage.getItem('sergiocm-portfolio-channels'));
        console.log(`channels reset (recarga la página):`, userChannels);
    } else {
        console.error(`resetChannels: llama con resetChannels(true) para confirmar.`)
    }
}