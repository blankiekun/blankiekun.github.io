// Fills in the latest release, stars and open issues from GitHub. The static text stays
// if anything fails. Markup: data-gh="Repo" + data-gh-field="tag|version|stars|issues|line";
// <a data-gh="Repo" data-gh-release> -> latest release page; <a data-gh="Repo" data-gh-asset> -> the
// same file name with the new tag, only if the latest release has it.
// shortcut: open_issues_count includes pull requests, and a stale 1h cache is fine.
(function () {
  var API = 'https://api.github.com/repos/blankiekun/', TTL = 3600e3, BAD = 300e3;
  function get(u) { return fetch(u, { headers: { Accept: 'application/vnd.github+json' } }).then(function (r) { if (!r.ok) throw 0; return r.json(); }); }
  function load(repo) {
    var k = 'gh:' + repo, c;
    try { c = JSON.parse(sessionStorage.getItem(k)); } catch (e) {}
    if (c && Date.now() - c.t < (c.d ? BAD : TTL)) return c.d ? Promise.reject() : Promise.resolve(c);
    return Promise.all([get(API + repo), get(API + repo + '/releases/latest')]).then(function (a) {
      c = { t: Date.now(), tag: a[1].tag_name, stars: a[0].stargazers_count, issues: a[0].open_issues_count,
        assets: (a[1].assets || []).map(function (x) { return x.name; }) };
      if (!c.tag) throw 0;
      try { sessionStorage.setItem(k, JSON.stringify(c)); } catch (e) {}
      return c;
    }, function (e) { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), d: 1 })); } catch (x) {} throw e; });
  }
  function fill(repo, d) {
    var q = '[data-gh="' + repo + '"]';
    [].forEach.call(document.querySelectorAll(q), function (el) {
      var f = el.getAttribute('data-gh-field');
      if (f === 'tag') el.textContent = d.tag;
      else if (f === 'version') el.textContent = d.tag.replace(/^v/, '');
      else if (f === 'stars') el.textContent = d.stars;
      else if (f === 'issues') el.textContent = d.issues;
      else if (f === 'line') { el.textContent = '★ ' + d.stars + ' · ' + d.issues + ' open issue' + (d.issues == 1 ? '' : 's'); el.hidden = false; }
      else if (el.hasAttribute('data-gh-release')) el.href = 'https://github.com/blankiekun/' + repo + '/releases/tag/' + d.tag;
      else if (el.hasAttribute('data-gh-asset')) {
        var u = el.getAttribute('href'), old = (u.match(/\/download\/([^/]+)\//) || [])[1];
        var name = u.split('/').pop().split(old).join(d.tag);
        if (old && d.assets.indexOf(name) >= 0) el.href = u.replace(/\/download\/[^/]+\/[^/]*$/, '/download/' + d.tag + '/' + name);
      }
    });
  }
  function run() {
    var seen = {};
    [].forEach.call(document.querySelectorAll('[data-gh]'), function (el) {
      var repo = el.getAttribute('data-gh');
      if (seen[repo]) return;
      seen[repo] = 1;
      try { load(repo).then(function (d) { fill(repo, d); }, function () {}); } catch (e) {}
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
