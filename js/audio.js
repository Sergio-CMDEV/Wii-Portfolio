// Old HTML audio files
{/* <audio id="startup" src="audio/startup.mp3"></audio>
<audio id="bg-music" src="audio/bg-music.mp3" loop></audio>
<audio id="hover" src="audio/button-hover.mp3"></audio>
<audio id="select" src="audio/button-select.mp3"></audio>
<audio id="zip" src="audio/zip.mp3"></audio>
<audio id="back" src="audio/back.mp3"></audio>
<audio id="start" src="audio/start.mp3"></audio>
<audio id="chSpec" src=""></audio>
<audio id="homeIn" src="audio/home-in.mp3"></audio>
<audio id="homeOut" src="audio/home-out.mp3"></audio>
<audio id="rm1" src="audio/returntomenu-1.mp3"></audio>
<audio id="rm2" src="audio/returntomenu-2.mp3"></audio>
<audio id="nextprev" src="audio/nextprev.mp3"></audio>
<audio id="letterIn" src="audio/letter-in.mp3"></audio> */}

// User config
// audio.js loads before config.js, so fall back to defaults if settings
// aren't stored yet (otherwise the null crash below stops playSFX from being defined).
var userConfig = JSON.parse(localStorage.getItem('sergiocm-portfolio-settings')) || { musicVol: 0.5, sfxVol: 0.2 };
// Older saves stored volumes as strings; Howler ignores non-number volumes
// (and plays at full blast). Coerce to numbers so volume control actually works.
userConfig.musicVol = isNaN(parseFloat(userConfig.musicVol)) ? 0.5 : parseFloat(userConfig.musicVol);
userConfig.sfxVol = isNaN(parseFloat(userConfig.sfxVol)) ? 0.2 : parseFloat(userConfig.sfxVol);

// BG Music
var introBgMusic;
var bgMusic = new Howl({
    src: `audio/bg-music.mp3`,
    volume: userConfig.musicVol,
    loop: true
});

/**
 * Function to change the current background music.
 *
 * @param {string} fileLocation - The location of the background music file.
 * @param {string} introLocation - The location of the intro file for the song. Will autoplay when provided.
 * @return {void} This function does not return any value.
 */
// Set BG Music
function setBGMusic(fileLocation, introLocation) {
    bgMusic = new Howl({
        src: `${fileLocation}`,
        volume: userConfig.musicVol,
        loop: true
    });

    if (introLocation) {
        introBgMusic = new Howl({
            src: `${introLocation}`,
            volume: userConfig.musicVol,
            autoplay: true
        });

        introBgMusic.on('end', () => {
            bgMusicToggle();
        });
    }
}

// Toggle BG Music
function bgMusicToggle(forceToggle) {
    // If forceToggle is on
    if (forceToggle) {
        if (forceToggle == false) {
            bgMusic.pause();
        } else if (forceToggle == true) {
            bgMusic.play();
        }
    // If BG Music is playing
    } else if (bgMusic.playing() == true) {
        bgMusic.pause();
    // Or, if it's paused
    } else if (bgMusic.playing() == false) {
        bgMusic.play();
    // Else nothing else!
    } else {
        alert('how the hell the bgmusic get called to stop but it aint even here???');
    }
}

// Toggle BG Music Intro
function bgMusicIntroToggle(forceToggle) {
    // If forceToggle is on
    if (forceToggle) {
        if (forceToggle == false) {
            introBgMusic.pause();
        } else if (forceToggle == true) {
            introBgMusic.play();
        }
    // If BG Music is playing
    } else if (introBgMusic.playing() == true) {
        introBgMusic.pause();
    // Or, if it's paused
    } else if (introBgMusic.playing() == false) {
        introBgMusic.play();
    // Else nothing else!
    } else {
        alert('how the hell the introBgMusic get called to stop but it aint even here???');
    }
}

// Get bgMusic state
function getBGMusicState() {
    return {
        // introBgMusic only exists if setBGMusic() was called with an intro.
        // Guard against undefined so the pause menu doesn't crash on right-click.
        intro: introBgMusic ? introBgMusic.playing() : false,
        main: bgMusic ? bgMusic.playing() : false
    };
}

// Play Music
function playMusic(name, vol, loop) {
    // If bgMusic is playing, pause it.
    if (bgMusic.playing() == true) {
        bgMusic.pause();
    }
    // Fail if no file name or vol is set.
    if (!name) return alert('You must provide a file name from the "audio/" dir.!');
    if (vol === undefined || vol === null || isNaN(vol)) return alert('You must provide a volume value!');
    // Actual Howl
    var music = new Howl({
        src: `audio/${name}`,
        volume: vol,
        // If loop is true, then loop this, duh.
        loop: function () {
            if (loop == true) {
                true;
            } 
        },
        autoplay: true
    });
}

// Play one SFX
function playSFX(name, vol) {
    // Fail if no file name or vol is set.
    if (!name) return alert('You must provide a file name from the "audio/" dir.!');
    if (vol === undefined || vol === null || isNaN(vol)) return alert('You must provide a volume value!');
    // Actual Howl
    var sfx = new Howl({
        src: `audio/${name}`, // Relative so it also works under file://
        volume: vol,
        autoplay: true
    });
}

// Apply the current userConfig volumes to anything already playing.
function applyVolumes() {
    if (typeof bgMusic !== 'undefined' && bgMusic) bgMusic.volume(userConfig.musicVol);
    if (typeof introBgMusic !== 'undefined' && introBgMusic) introBgMusic.volume(userConfig.musicVol);
    var ch = document.getElementById('chSpec');
    if (ch) ch.volume = Math.max(0, Math.min(1, userConfig.musicVol));
}

// React to settings changes (incl. from another tab, e.g. the Settings page)
// so volume updates live without needing a reload.
window.addEventListener('storage', function (e) {
    if (e.key === 'sergiocm-portfolio-settings' && e.newValue) {
        var cfg = JSON.parse(e.newValue);
        userConfig.musicVol = isNaN(parseFloat(cfg.musicVol)) ? userConfig.musicVol : parseFloat(cfg.musicVol);
        userConfig.sfxVol = isNaN(parseFloat(cfg.sfxVol)) ? userConfig.sfxVol : parseFloat(cfg.sfxVol);
        applyVolumes();
    }
});

// Play Multiple SFX (names must be in a Array!)
function playSFXMulti(vol, names) {
    // If names is a Array
    if (Array.isArray(names)) {
        names.forEach(name => {
            var sfx = new Howl({
                src: `audio/${name}`,
                volume: vol,
                autoplay: true
            });
        });
    // Else report back saying I ain't doing it!
    } else {
        alert('playSFXMulti: Your files must in a array!')
    }
}