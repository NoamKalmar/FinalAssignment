/**
 * Live search — §30 (Ajax and asynchronous requests to the server).
 *
 * Every keystroke would otherwise mean a database query, so input is
 * debounced: we wait until typing pauses before asking the server. An
 * AbortController cancels any request still in flight, because responses can
 * arrive out of order — type "cat" quickly and the reply for "ca" may land
 * after the reply for "cat", leaving stale results on screen.
 */
(function () {
    'use strict';

    var DEBOUNCE_MS = 300;

    // ── small helpers ──────────────────────────────────────────────────────

    // Anything from the database is untrusted text. Building HTML by
    // concatenation without escaping is how XSS happens, so every value that
    // reaches the page goes through this first.
    function esc(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDate(iso) {
        var d = new Date(iso);
        return isNaN(d) ? '' : d.toLocaleDateString('en-GB');
    }

    function debounce(fn, ms) {
        var timer;
        return function () {
            clearTimeout(timer);
            timer = setTimeout(fn, ms);
        };
    }

    // Collect a form's non-empty fields into a query string, so omitted
    // filters are absent rather than sent as empty values.
    function queryFrom(form) {
        var params = new URLSearchParams();
        new FormData(form).forEach(function (value, key) {
            if (String(value).trim() !== '') params.append(key, value);
        });
        return params.toString();
    }

    // ── one live-search panel ──────────────────────────────────────────────

    function wirePanel(name, endpoint, render) {
        var form = document.getElementById('form-' + name);
        var status = document.getElementById('status-' + name);
        var out = document.getElementById('results-' + name);
        if (!form) return;

        var inFlight = null;

        function run() {
            if (inFlight) inFlight.abort();          // drop the stale request
            inFlight = new AbortController();

            var qs = queryFrom(form);
            status.textContent = 'Searching…';

            fetch(endpoint + (qs ? '?' + qs : ''), {
                signal: inFlight.signal,
                headers: { 'Accept': 'application/json' }
            })
                .then(function (res) {
                    if (!res.ok) throw new Error('Server returned ' + res.status);
                    return res.json();
                })
                .then(function (data) {
                    status.textContent = data.count === 0
                        ? 'No matches.'
                        : data.count + (data.count === 1 ? ' result' : ' results');
                    out.innerHTML = data.results.map(render).join('');

                    // Reflect the search in the URL so it can be shared or
                    // survive a refresh, without adding a history entry per
                    // keystroke.
                    var url = window.location.pathname + '?tab=' + name + (qs ? '&' + qs : '');
                    window.history.replaceState(null, '', url);
                })
                .catch(function (err) {
                    if (err.name === 'AbortError') return;   // superseded, not a failure
                    status.textContent = 'Search failed. Please try again.';
                    out.innerHTML = '';
                });
        }

        var runDebounced = debounce(run, DEBOUNCE_MS);

        // Typing waits for a pause; picking from a dropdown or date is a
        // deliberate act, so fire immediately.
        form.addEventListener('input', function (e) {
            if (e.target.tagName === 'SELECT' || e.target.type === 'date') run();
            else runDebounced();
        });

        var clear = document.querySelector('[data-reset="' + name + '"]');
        if (clear) clear.addEventListener('click', function () { form.reset(); run(); });

        run();   // populate on first load
    }

    // ── renderers ──────────────────────────────────────────────────────────

    function renderPost(p) {
        var initials = (p.author.fullName || '?')
            .split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('');

        var media = '';
        if (p.type === 'image' && p.mediaUrl) {
            media = '<img class="sr-thumb" src="' + esc(p.mediaUrl) + '" alt="">';
        } else if (p.type === 'video' && p.mediaUrl) {
            media = '<span class="sr-badge">video</span>';
        }

        var tags = (p.tags || []).map(function (t) {
            return '<span class="tag">#' + esc(t) + '</span>';
        }).join('');

        return '' +
            '<a class="sr" href="/posts/' + esc(p._id) + '">' +
              '<div class="avatar sm">' + esc(initials) + '</div>' +
              '<div class="sr-body">' +
                '<div class="sr-top">' +
                  '<strong>' + esc(p.author.fullName) + '</strong>' +
                  '<span class="sr-meta">@' + esc(p.author.username) +
                    (p.groupName ? ' &middot; in ' + esc(p.groupName) : '') +
                    ' &middot; ' + esc(formatDate(p.createdAt)) +
                  '</span>' +
                '</div>' +
                '<p class="sr-text">' + esc(p.content) + '</p>' +
                (tags ? '<p class="post-tags">' + tags + '</p>' : '') +
              '</div>' +
              media +
              '<span class="post-type">' + esc(p.type) + '</span>' +
            '</a>';
    }

    function renderGroup(g) {
        return '' +
            '<a class="sr" href="/groups/' + esc(g._id) + '">' +
              '<div class="sr-body">' +
                '<div class="sr-top">' +
                  '<strong>' + esc(g.name) + '</strong>' +
                  '<span class="sr-meta">' + esc(g.category) +
                    ' &middot; ' + esc(g.memberCount) +
                    (g.memberCount === 1 ? ' member' : ' members') +
                    ' &middot; ' + esc(formatDate(g.createdAt)) +
                  '</span>' +
                '</div>' +
                '<p class="sr-text">' + esc(g.description || 'No description.') + '</p>' +
              '</div>' +
              (g.joined ? '<span class="badge">Joined</span>' : '') +
            '</a>';
    }

    function renderComment(c) {
        var initials = (c.author.fullName || '?')
            .split(' ').map(function (w) { return w[0]; }).slice(0, 2).join('');

        return '' +
            '<a class="sr" href="/posts/' + esc(c.post) + '#comments">' +
              '<div class="avatar sm">' + esc(initials) + '</div>' +
              '<div class="sr-body">' +
                '<div class="sr-top">' +
                  '<strong>' + esc(c.author.fullName) + '</strong>' +
                  '<span class="sr-meta">@' + esc(c.author.username) +
                    ' &middot; ' + esc(formatDate(c.createdAt)) +
                    (c.edited ? ' &middot; edited' : '') +
                    (c.likes ? ' &middot; ' + esc(c.likes) + ' likes' : '') +
                  '</span>' +
                '</div>' +
                '<p class="sr-text">' + esc(c.content) + '</p>' +
                // Context: which post this was a reply to.
                (c.postContent
                    ? '<p class="sr-meta">on: ' + esc(c.postContent) + '&hellip;</p>'
                    : '') +
              '</div>' +
            '</a>';
    }

    // ── tabs ───────────────────────────────────────────────────────────────

    document.querySelectorAll('.tab').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var want = btn.dataset.tab;
            document.querySelectorAll('.tab').forEach(function (b) {
                b.classList.toggle('on', b.dataset.tab === want);
            });
            document.querySelectorAll('.search-panel').forEach(function (panel) {
                panel.hidden = panel.id !== 'panel-' + want;
            });
        });
    });

    wirePanel('posts', '/search/api/posts', renderPost);
    wirePanel('groups', '/search/api/groups', renderGroup);
    wirePanel('comments', '/search/api/comments', renderComment);
})();
