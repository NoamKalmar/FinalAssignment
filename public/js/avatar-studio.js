/**
 * Avatar generator — §31.ii (<canvas>).
 *
 * Draws a profile picture in the browser: a radial-gradient disc with the
 * user's initials on top. Nothing is uploaded — canvas.toDataURL() turns the
 * drawing into a data URI that is submitted with the form like any other
 * field, so no file handling is involved at all.
 *
 * Real 2D context work: createRadialGradient, arc, clip, fillText, measureText.
 */
(function () {
    'use strict';

    var canvas = document.getElementById('avatar-canvas');
    if (!canvas) return;

    var ctx = canvas.getContext('2d');
    var hidden = document.getElementById('avatarData');
    var nameInput = document.getElementById('fullName');

    // Drawn at 2x and displayed at half size, so it stays sharp on a
    // high-DPI screen instead of looking soft.
    var SIZE = 256;
    canvas.width = SIZE;
    canvas.height = SIZE;

    var palettes = [
        ['#1c4f9c', '#6c8cff'],
        ['#c2410c', '#fb923c'],
        ['#166534', '#4ade80'],
        ['#86198f', '#e879f9'],
        ['#155e75', '#22d3ee'],
        ['#7c2d12', '#f59e0b']
    ];
    var current = 0;

    function initials(name) {
        var words = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return '?';
        return words.slice(0, 2).map(function (w) {
            return w[0].toUpperCase();
        }).join('');
    }

    function draw() {
        var pair = palettes[current];
        var text = initials(nameInput ? nameInput.value : '');

        ctx.clearRect(0, 0, SIZE, SIZE);

        // Circular clip first, so everything drawn afterwards is confined to
        // the disc and the corners stay transparent.
        ctx.save();
        ctx.beginPath();
        ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
        ctx.clip();

        // Off-centre light source reads as a sphere rather than a flat circle.
        var g = ctx.createRadialGradient(
            SIZE * 0.32, SIZE * 0.28, SIZE * 0.05,
            SIZE * 0.5,  SIZE * 0.5,  SIZE * 0.75
        );
        g.addColorStop(0, pair[1]);
        g.addColorStop(1, pair[0]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, SIZE, SIZE);

        // A faint sweep across the lower half adds a little depth.
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(SIZE / 2, SIZE * 1.05, SIZE * 0.8, SIZE * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Initials, optically centred. Canvas has no vertical centring, so
        // textBaseline:middle plus a small nudge does the job.
        ctx.fillStyle = 'rgba(255,255,255,.95)';
        ctx.font = '600 ' + (text.length > 1 ? 96 : 118) + 'px Outfit, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,.35)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 3;
        ctx.fillText(text, SIZE / 2, SIZE / 2 + 4);

        ctx.restore();

        // PNG keeps the transparent corners; JPEG would fill them black.
        if (hidden) hidden.value = canvas.toDataURL('image/png');
    }

    // Swatches
    var wrap = document.getElementById('swatches');
    if (wrap) {
        palettes.forEach(function (pair, i) {
            var b = document.createElement('button');
            b.type = 'button';                       // never submit the form
            b.className = 'swatch' + (i === 0 ? ' on' : '');
            b.style.background = 'linear-gradient(135deg,' + pair[1] + ',' + pair[0] + ')';
            b.setAttribute('aria-label', 'Colour ' + (i + 1));
            b.addEventListener('click', function () {
                current = i;
                wrap.querySelectorAll('.swatch').forEach(function (s) { s.classList.remove('on'); });
                b.classList.add('on');
                draw();
            });
            wrap.appendChild(b);
        });
    }

    // Redraw as the name is typed, so the initials track it live.
    if (nameInput) nameInput.addEventListener('input', draw);

    // The font may still be loading when this runs; redraw once it lands so
    // the initials are not left in the fallback typeface.
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(draw);
    }

    draw();
})();
