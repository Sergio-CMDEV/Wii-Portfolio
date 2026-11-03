// Channel rendering.
//
// The channel list itself comes from 'db/projects.json' (see js/config.js and
// admin/README.md). The helpers below only draw channels into the Wii grid;
// addChannel/removeChannel stay as in-memory console helpers for quick tests.

// Channels per page in the main menu grid (4 columns x 3 rows).
var CHANNELS_PER_PAGE = 12;

// Append another page of blank slots to the grid.
// Lets the menu hold any number of projects instead of the 24 that are in the
// markup; without it, extra channels would silently never be drawn.
function addChannelPage() {
    var grid = document.querySelector('.grid');
    var page = document.createElement('div');
    page.className = 'ch-c';

    for (var i = 0; i < CHANNELS_PER_PAGE; i++) {
        var slot = document.createElement('div');
        slot.className = 'ch blank';
        page.appendChild(slot);
    }

    // Keep the page before the 'next' arrow so the arrow stays on the right.
    var next = grid.querySelector('.next');
    if (next) grid.insertBefore(page, next);
    else grid.appendChild(page);

    return page.firstChild;
}

// Add channel (in-memory only -- use the admin panel to add a real project).
// Defaults: addChannel('id', 'Title', 'path-to-assets', 'path-to-channelart')
// (Everything else is optional)
function addChannel(id, title, assets, channelart, target, videoformat) {
    // Check stuff that's required
    function def_cmd() {
        console.log(`Defaults: addChannel('id', 'Title', 'path-to-assets[/]', 'path-to-channelart[/]', [optional: 'target-to-html', 'video-format (recommend webp!)'] )`);
    }
    function logErr(msg, defcmd) {
        if (defcmd == true) def_cmd();
        console.error(`addChannel: ${msg}`);
        return { err: true, msg: msg };
    }
    if (!id) {
        let msg = `You must supply a id!`;
        return logErr(msg, true);
    // Also check for each channel that the users has, make sure the "id" isn't taken.
    } else if (userChannels.find((element) => element.id === id)) {
        let msg = `You already have a channel with that id!`;
        return logErr(msg);
    } else if (!title) {
        let msg = `You must supply a title!`;
        return logErr(msg, true);
    } else if (!assets) {
        let msg = `You must supply the assets directory! (Don't include the id with this var)`;
        return logErr(msg, true);
    } else if (!assets.endsWith('/')) {
        let msg = `Your assets folder doesn't end with a "/"! Please fix that!`;
        return logErr(msg, true);
    } else if (!channelart) {
        let msg = `You must supply the channelart directory! (Don't include the id with this var)`;
        return logErr(msg, true);
    } else if (!channelart.endsWith('/')) {
        let msg = `Your channelart folder doesn't end with a "/"! Please fix that!`;
        return logErr(msg, true);

    // Pass!!!!!!
    } else {
        // Channel.
        var channel = {
            id: id,
            title: title,
            assets: assets,
            channelart: channelart
        }
        // If there's a target, add it.
        if (target) {
            channel.target = target;
        }
        if (videoformat) {
            channel.videoformat = videoformat;
        }

        // Push to the live list and draw it right away.
        userChannels.push(channel);
        makeChannel(channel);
        console.log(`canal añadido (solo en memoria): `, channel);
        return 'Para que sea permanente, añádelo desde el panel de admin (/admin/).';
    }
}

function makeChannel(channeljson) {
    // Get the first blank channel, adding a page when the grid is full.
    var target = document.getElementsByClassName('ch blank')[0];
    if (!target) {
        target = addChannelPage();
    }

    // First, we remove the "blank" class name & add "occupied".
    target.classList.remove('blank');
    target.classList.add('occupied');

    // Now, we inject stuff from the channel config in the target.
    target.setAttribute('data-id' , channeljson.id);
    // Add target href if channel has a target
    if (channeljson.target) {
        target.setAttribute('data-href', channeljson.target)
    }
    // If is a disc channel
    hasDisc = '';
    if (channeljson.disc == true) {
        hasDisc = 'id="discTag"';

        target.insertAdjacentHTML(`afterbegin`,

        `
        <img src="channelart/disc/disc.png" class="spinnin" />
        `
        )
    }

    // Channel art: an explicit 'art' URL (used by the generated project
    // channels, which share one template and pass their look as query params),
    // or the classic per-channel folder.
    var artUrl = channeljson.art
        || `${channeljson.channelart}${channeljson.id}/channel.html`;

    // Main inject
    target.insertAdjacentHTML('afterbegin',

    `
    <iframe src="${artUrl}" title="${escapeAttr(channeljson.title)}" loading="lazy"></iframe>
    <div class="onhover" onmouseover="playSFX('button-hover.mp3', userConfig.sfxVol)" onclick="zip()"></div>
    <span class="tag" ${hasDisc}>${escapeHtml(channeljson.title)}</span>
    `
    )
}

// Titles are editable in the admin panel, so escape them before they go into
// the markup above.
function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, '&quot;');
}

// Remove channel (from the live grid; the panel is what makes it permanent).
function removeChannel(id) {
    // Find channel by id.
    var channel = userChannels.findIndex((element) => element.id === id);

    // If couldn't find the channel
    if (channel === -1) {
        console.error('removeChannel: Couldn\'t find a channel with that id!');
        return;
    }

    // Remove class name 'occupied'
    var targetDiv = $(`[data-id="${id}"]`)[0];
    targetDiv.classList.remove('occupied');
    // Remove all child nodes
    while (targetDiv.firstChild) {
        targetDiv.removeChild(targetDiv.firstChild);
    }
    // Make it blank
    targetDiv.classList.add('blank');
    // Move it to the bottom to re-align all the other channels
    targetDiv.parentNode.appendChild(targetDiv);

    // Splice from userChannels
    userChannels.splice(channel, 1)
    console.log(`canal '${id}' quitado de la vista: `, userChannels);
    console.log(`Para desactivarlo de verdad, usa el panel de admin (/admin/).`);
}
