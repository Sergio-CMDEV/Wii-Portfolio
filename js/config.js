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
var def_channels = [
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
        id: 'about',
        title: 'about me',
        assets: 'assets/channels/',
        channelart: 'channelart/',
        target: '/about/index.html'
    },
    {
        id: 'projects',
        title: 'Projects',
        assets: 'assets/channels/',
        channelart: 'channelart/',
        target: '/projects/index.html'
    },
    {
        id: 'github',
        title: 'GitHub',
        assets: 'assets/channels/',
        channelart: 'channelart/',
        target: 'https://github.com/Sergio-CMDEV'
    },
    {
        id: 'shop',
        title: 'Wii Shop Channel',
        assets: 'assets/channels/',
        channelart: 'channelart/',
        target: '/shop/index.html'
    },
    {
        id: 'contact',
        title: 'Contact',
        assets: 'assets/channels/',
        channelart: 'channelart/',
        target: '/contact/index.html'
    },
    {
        id: 'soportemii',
        title: 'Soporte Mii',
        assets: 'assets/channels/',
        channelart: 'channelart/',
        target: '/soportemii/index.html',
        previewart: true
    }
]

// Set channels if they aren't set
if (!localStorage.getItem('sergiocm-portfolio-channels')) {
    localStorage.setItem("sergiocm-portfolio-channels", JSON.stringify(def_channels));
}
var userChannels = JSON.parse(localStorage.getItem('sergiocm-portfolio-channels'));

// Keep the stored channel list in sync with def_channels.
// localStorage caches the channels, so changes to def_channels (new channels
// or edits to existing ones, like the preview type) wouldn't take effect until
// the user reset them. This adds missing channels and refreshes the properties
// of existing default channels, while leaving any user-added channels intact.
(function syncDefaultChannels() {
    var changed = false;
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