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

    var HIDE_RULE = '.js-cursor, .js-cursor * { cursor: none !important; }';

    function build() {
        var style = document.createElement('style');
        // Only applied once this script runs, so the CSS cursor remains the
        // fallback if it doesn't.
        style.textContent =
            HIDE_RULE +
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

        hideNativeCursor(document);
    }

    /*
        Hide the real cursor in a document.

        The class alone isn't enough inside an iframe: the rule that acts on it
        lives in the parent's stylesheet, and stylesheets don't cross into a
        nested document. Without its own copy the art kept showing the CSS
        cursor from base.css underneath the drawn one, so the pointer appeared
        twice.
    */
    function hideNativeCursor(doc) {
        try {
            doc.documentElement.classList.add('js-cursor');
            if (doc.getElementById('wii-cursor-hide')) return;
            var style = doc.createElement('style');
            style.id = 'wii-cursor-hide';
            style.textContent = HIDE_RULE;
            (doc.head || doc.documentElement).appendChild(style);
        } catch (err) { /* document went away */ }
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

    /*
        Listen on a document, mapping its coordinates into the top page.

        An iframe's position is cached rather than measured on every move:
        getBoundingClientRect forces a layout, and doing that for each
        mousemove while crossing a tile was enough to make the pointer trail
        behind the real one. The cache is dropped whenever the page scrolls or
        resizes, and on the animations that shift the grid.
    */
    function track(doc, frameEl) {
        if (!doc || frames.indexOf(doc) !== -1) return;
        frames.push(doc);

        var box = null;
        var invalidate = function () { box = null; };

        if (frameEl) {
            window.addEventListener('scroll', invalidate, { passive: true, capture: true });
            window.addEventListener('resize', invalidate, { passive: true });
            document.addEventListener('transitionend', invalidate, true);
            document.addEventListener('animationend', invalidate, true);
        }

        doc.addEventListener('mousemove', function (ev) {
            if (!frameEl) {
                moveTo(ev.clientX, ev.clientY);
                return;
            }
            if (!box) {
                var r = frameEl.getBoundingClientRect();
                // The art iframes are scaled by the tile's CSS, so the inner
                // coordinates have to be scaled too, not just offset.
                box = {
                    left: r.left,
                    top: r.top,
                    sx: r.width / (frameEl.offsetWidth || r.width || 1),
                    sy: r.height / (frameEl.offsetHeight || r.height || 1)
                };
            }
            moveTo(box.left + ev.clientX * box.sx, box.top + ev.clientY * box.sy);
        }, { passive: true });

        hideNativeCursor(doc);
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
