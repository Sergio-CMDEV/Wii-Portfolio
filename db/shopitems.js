var shopItems;
setTimeout(() => {
    shopItems = {
        vconsole: [],
        wiiware: [],
        channels: [
            {
                id: "homebrew",
                title: "Homebrew Channel",
                assets: "assets/channels/",
                channelart: "channelart/",
                publisher: "SergioCM",
            },
            {
                id: "bottomgear",
                title: "BOTTOM GEAR™",
                assets: "assets/channels/",
                channelart: "channelart/",
                publisher: "SergioCM",
            }
        ],
        downloaded: userChannels,
    }
}, 100);