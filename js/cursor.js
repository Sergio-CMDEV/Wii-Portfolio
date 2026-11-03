/*
    Wii pointer.

    The pointer used to be a plain CSS `cursor: url(...)`, but Chrome ignores
    custom cursors larger than 32x32 whenever the pointer gets near the edge of
    the frame -- a mitigation against cursors that fake UI outside the page.
    assets/cursor.png is 65x91, so the Windows arrow came back over the Wii and
    mail buttons in the bottom corners, and over anything else near an edge.
    Shrinking the image under 32x32 would fix it but leave a pointer a third of
    the size.

    So the pointer is drawn as an ordinary element instead, which no size or
    edge rule applies to. The CSS cursor stays as the fallback: this script
    only takes over once it has run, so with JavaScript off the old behaviour
    is still there.

    Channel art lives in iframes, and a parent page gets no mousemove while the
    pointer is over one. They are same-origin, so their documents are listened
    to directly and their coordinates offset into page space -- no change
    needed in the art files themselves.
*/

(function () {
    'use strict';

    // Where the tip of the pointer image sits, as a fraction of its size.
    var HOTSPOT_X = 0.28;
    var HOTSPOT_Y = 0.08;

    var root = document.documentElement;
    var pointer = null;
    var frames = [];

    // Site root from this script's own URL ('<root>/js/cursor.js'), so the
    // image resolves from index.html and from pages in subfolders alike.
    var CURSOR_SRC = (function () {
        var src = (document.currentScript && document.currentScript.src) || '';
        var match = src.match(/^(.*\/)js\/cursor\.js(?:\?.*)?$/);
        return (match ? match[1] : '') + 'assets/cursor.png';
    })();

    function build() {
        var style = document.createElement('style');
        // Only applied once this script runs, so the CSS cursor remains the
        // fallback if it doesn't.
        style.textContent =
            '.js-cursor, .js-cursor * { cursor: none !important; }' +
            '#wii-pointer {' +
            '  position: fixed; top: 0; left: 0; z-index: 2147483647;' +
            '  width: 65px; height: 91px; pointer-events: none;' +
            '  background: url("' + CURSOR_SRC + '") no-repeat center / contain;' +
            '  will-change: transform; opacity: 0;' +
            '  transition: opacity 120ms;' +
            '}' +
            '#wii-pointer.on { opacity: 1; }';
        document.head.appendChild(style);

        pointer = document.createElement('div');
        pointer.id = 'wii-pointer';
        document.body.appendChild(pointer);

        root.classList.add('js-cursor');
    }

    function moveTo(x, y) {
        if (!pointer) return;
        pointer.style.transform =
            'translate(' + (x - 65 * HOTSPOT_X) + 'px,' + (y - 91 * HOTSPOT_Y) + 'px)';
        if (!pointer.classList.contains('on')) pointer.classList.add('on');
    }

    function hide() {
        if (pointer) pointer.classList.remove('on');
    }

    // Listen on a document, mapping its coordinates into the top page.
    function track(doc, frameEl) {
        if (!doc || frames.indexOf(doc) !== -1) return;
        frames.push(doc);

        doc.addEventListener('mousemove', function (ev) {
            if (frameEl) {
                var box = frameEl.getBoundingClientRect();
                // The art iframes are scaled by the tile's CSS, so the inner
                // coordinates have to be scaled the same way, not just offset.
                var sx = box.width / (frameEl.offsetWidth || box.width);
                var sy = box.height / (frameEl.offsetHeight || box.height);
                moveTo(box.left + ev.clientX * sx, box.top + ev.clientY * sy);
            } else {
                moveTo(ev.clientX, ev.clientY);
            }
        }, { passive: true });

        try {
            doc.documentElement.classList.add('js-cursor');
        } catch (err) { /* document went away */ }
    }

    // Pick up iframes as they appear and once they've loaded.
    function attachFrames() {
        var list = document.getElementsByTagName('iframe');
        for (var i = 0; i < list.length; i++) {
            (function (frame) {
                if (frame.dataset.wiiCursor) return;
                frame.dataset.wiiCursor = '1';

                var hook = function () {
                    try {
                        track(frame.contentDocument, frame);
                    } catch (err) {
                        // Cross-origin: nothing we can do, and nothing to fix,
                        // since those aren't our channel art.
                        delete frame.dataset.wiiCursor;
                    }
                };

                frame.addEventListener('load', hook);
                // Already loaded by the time we got here.
                if (frame.contentDocument
                    && frame.contentDocument.readyState === 'complete') hook();
            })(list[i]);
        }
    }

    function start() {
        build();
        track(document, null);

        document.addEventListener('mouseleave', hide);
        document.addEventListener('mouseenter', function (ev) {
            moveTo(ev.clientX, ev.clientY);
        });
        window.addEventListener('blur', hide);

        attachFrames();
        // Channels are added after the projects file loads, and more appear
        // when a page is added to the grid, so keep watching.
        new MutationObserver(attachFrames)
            .observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
