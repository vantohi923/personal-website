(function () {
  "use strict";

  var GITHUB_USER = "vantohi923";
  var REPOS_URL = "https://api.github.com/users/" + GITHUB_USER + "/repos?sort=updated&per_page=100";
  var CACHE_KEY = "gh-repos-v1";
  var CACHE_TTL = 10 * 60 * 1000; // 10 minutes, keeps us under the unauthenticated API rate limit

  // Extra info for specific repos (keys are lowercase repo names).
  // Every repo is "Finished" unless marked otherwise here.
  var PROJECT_OVERRIDES = {
    "live-shopping-platform": {
      title: "LiveShop — Live Shopping Platform",
      status: "dev",
      featured: 1,
      description:
        "Streamers go live from OBS through AWS IVS, viewers chat via IVS Chat and buy the pinned product in two clicks. " +
        "Live events (pinned product, stock, viewer count) flow over WebSocket and are fanned out with Redis pub/sub for horizontal scaling. " +
        "Stock decreases atomically and payments are confirmed only by a verified, idempotent Stripe webhook.",
      tags: ["Bun", "TypeScript", "Next.js", "PostgreSQL", "Prisma", "Redis", "AWS IVS", "Cognito", "Stripe", "Docker", "GitHub Actions"]
    },
    "aumovio_proiect": {
      title: "Arduino Automation for Climate Chambers",
      featured: 2,
      description:
        "An automated, programmable timing system for electrical simulation equipment, triggered by climate chambers. " +
        "It precisely controls how long products are exposed to specific temperature and humidity conditions and is configurable through a touch screen.",
      tags: ["Arduino", "C++", "PlatformIO", "Embedded", "Touch UI"]
    },
    "java_game": {
      title: "2D Tile-Based Dungeon Crawler",
      featured: 3,
      description:
        "A top-down 2D dungeon exploration game with progressive levels and a final boss fight. " +
        "Uses Singleton, Factory Method, Flyweight, Observer and a Finite State Machine for the boss; BFS pathfinding for enemy patrol and chase; " +
        "fog of war, a custom camera with an affine view matrix, inventory with custom exceptions and SQLite persistence.",
      tags: ["Java", "OOP", "Design Patterns", "BFS", "SQLite", "Tiled"]
    }
  };

  // GitHub linguist colors for the languages most likely to show up
  var LANG_COLORS = {
    "C": "#555555",
    "C++": "#f34b7d",
    "C#": "#178600",
    "Java": "#b07219",
    "Python": "#3572A5",
    "Kotlin": "#A97BFF",
    "JavaScript": "#f1e05a",
    "TypeScript": "#3178c6",
    "HTML": "#e34c26",
    "CSS": "#663399",
    "Lua": "#000080",
    "Verilog": "#b2b7f8",
    "SystemVerilog": "#DAE1C2",
    "VHDL": "#adb2cb",
    "Assembly": "#6E4C13",
    "MATLAB": "#e16737",
    "Shell": "#89e051",
    "Go": "#00ADD8",
    "Rust": "#dea584",
    "PHP": "#4F5D95",
    "Jupyter Notebook": "#DA5B0B",
    "Dockerfile": "#384d54",
    "Makefile": "#427819"
  };

  var root = document.documentElement;
  var grid = document.getElementById("projects-grid");
  var statusEl = document.getElementById("projects-status");
  var filtersEl = document.getElementById("filters");

  var allRepos = [];
  var activeLang = "All";

  /* ---------- Theme ---------- */
  document.getElementById("theme-toggle").addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#f7f8fb" : "#0b0d12");
  });

  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- Scroll reveal ---------- */
  var observer = null;
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
  }

  function reveal(el) {
    if (observer) observer.observe(el);
    else el.classList.add("visible");
  }

  document.querySelectorAll(".reveal").forEach(reveal);

  /* ---------- Helpers ---------- */
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function svgIcon(paths) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    paths.forEach(function (d) {
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    });
    return svg;
  }

  var ICONS = {
    star: ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"],
    clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 6v6l4 2"],
    code: ["M16 18l6-6-6-6", "M8 6l-6 6 6 6"],
    external: ["M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", "M15 3h6v6", "M10 14 21 3"]
  };

  function formatDate(iso) {
    var d = new Date(iso);
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days < 1) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return days + " days ago";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function prettifyName(name) {
    return name.replace(/[-_]+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function overrideFor(repo) {
    return PROJECT_OVERRIDES[repo.name.toLowerCase()] || {};
  }

  /* ---------- Rendering ---------- */
  function renderSkeletons(n) {
    grid.innerHTML = "";
    for (var i = 0; i < n; i++) {
      var card = el("div", "card skeleton");
      card.setAttribute("aria-hidden", "true");
      card.appendChild(el("div", "sk sk-title"));
      card.appendChild(el("div", "sk sk-line"));
      card.appendChild(el("div", "sk sk-line short"));
      card.appendChild(el("div", "sk sk-meta"));
      grid.appendChild(card);
    }
    statusEl.innerHTML = "";
    var sr = el("span", null, "Loading projects…");
    sr.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)";
    statusEl.appendChild(sr);
  }

  function renderStatus(title, message, withRetry) {
    grid.innerHTML = "";
    statusEl.innerHTML = "";
    var box = el("div", "status-box");
    box.appendChild(el("h3", null, title));
    box.appendChild(el("p", null, message));
    if (withRetry) {
      var retry = el("button", "btn", "Try again");
      retry.type = "button";
      retry.addEventListener("click", function () { loadRepos(true); });
      box.appendChild(retry);
    }
    var link = el("a", null, "View all repositories on GitHub →");
    link.href = "https://github.com/" + GITHUB_USER + "?tab=repositories";
    link.target = "_blank";
    link.rel = "noopener";
    box.appendChild(link);
    statusEl.appendChild(box);
  }

  function renderCard(repo) {
    var extra = overrideFor(repo);
    var card = el("article", "card reveal");

    var head = el("div", "card-head");
    var h3 = el("h3", "card-title");
    var titleLink = el("a", null, extra.title || prettifyName(repo.name));
    titleLink.href = repo.html_url;
    titleLink.target = "_blank";
    titleLink.rel = "noopener";
    h3.appendChild(titleLink);
    head.appendChild(h3);

    var inDev = extra.status === "dev";
    head.appendChild(el("span", "badge " + (inDev ? "badge-dev" : "badge-done"), inDev ? "In development" : "Finished"));
    card.appendChild(head);

    var desc = extra.description || repo.description;
    card.appendChild(el("p", "card-desc" + (desc ? "" : " empty"), desc || "No description provided."));

    if (extra.tags && extra.tags.length) {
      var tags = el("ul", "tags");
      extra.tags.forEach(function (t) { tags.appendChild(el("li", null, t)); });
      card.appendChild(tags);
    }

    var meta = el("div", "card-meta");
    if (repo.language) {
      var lang = el("span", "meta-item");
      var dot = el("span", "lang-dot");
      dot.style.background = LANG_COLORS[repo.language] || "#8b949e";
      lang.appendChild(dot);
      lang.appendChild(document.createTextNode(repo.language));
      meta.appendChild(lang);
    }
    var stars = el("span", "meta-item");
    stars.title = "Stars";
    stars.appendChild(svgIcon(ICONS.star));
    stars.appendChild(document.createTextNode(repo.stargazers_count));
    meta.appendChild(stars);

    var updated = el("span", "meta-item");
    updated.title = "Last updated " + new Date(repo.pushed_at || repo.updated_at).toLocaleString("en-GB");
    updated.appendChild(svgIcon(ICONS.clock));
    updated.appendChild(document.createTextNode("Updated " + formatDate(repo.pushed_at || repo.updated_at)));
    meta.appendChild(updated);
    card.appendChild(meta);

    var links = el("div", "card-links");
    var repoLink = el("a");
    repoLink.href = repo.html_url;
    repoLink.target = "_blank";
    repoLink.rel = "noopener";
    repoLink.appendChild(svgIcon(ICONS.code));
    repoLink.appendChild(document.createTextNode("Repository"));
    links.appendChild(repoLink);

    if (repo.homepage && /^https?:\/\//i.test(repo.homepage)) {
      var demo = el("a");
      demo.href = repo.homepage;
      demo.target = "_blank";
      demo.rel = "noopener";
      demo.appendChild(svgIcon(ICONS.external));
      demo.appendChild(document.createTextNode("Live demo"));
      links.appendChild(demo);
    }
    card.appendChild(links);

    return card;
  }

  function renderProjects() {
    grid.innerHTML = "";
    statusEl.innerHTML = "";
    var list = activeLang === "All"
      ? allRepos
      : allRepos.filter(function (r) { return (r.language || "Other") === activeLang; });

    if (!list.length) {
      renderStatus("No projects here", "There are no public projects for this filter yet.", false);
      return;
    }
    list.forEach(function (repo, i) {
      var card = renderCard(repo);
      card.style.transitionDelay = Math.min(i, 6) * 60 + "ms";
      grid.appendChild(card);
      reveal(card);
    });
  }

  function renderFilters() {
    var counts = { All: allRepos.length };
    allRepos.forEach(function (r) {
      var l = r.language || "Other";
      counts[l] = (counts[l] || 0) + 1;
    });
    var langs = Object.keys(counts).filter(function (k) { return k !== "All"; })
      .sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); });

    filtersEl.innerHTML = "";
    if (langs.length < 2) return; // nothing to filter

    ["All"].concat(langs).forEach(function (lang) {
      var btn = el("button", "filter-btn");
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(lang === activeLang));
      if (lang !== "All") {
        var dot = el("span", "lang-dot");
        dot.style.background = LANG_COLORS[lang] || "#8b949e";
        btn.appendChild(dot);
      }
      btn.appendChild(document.createTextNode(lang));
      btn.appendChild(el("span", "count", String(counts[lang])));
      btn.addEventListener("click", function () {
        activeLang = lang;
        filtersEl.querySelectorAll(".filter-btn").forEach(function (b) {
          b.setAttribute("aria-pressed", String(b === btn));
        });
        renderProjects();
      });
      filtersEl.appendChild(btn);
    });
  }

  /* ---------- Data ---------- */
  function sortRepos(repos) {
    return repos
      .filter(function (r) { return !r.fork; })
      .sort(function (a, b) {
        var fa = overrideFor(a).featured || Infinity;
        var fb = overrideFor(b).featured || Infinity;
        if (fa !== fb) return fa - fb;
        return new Date(b.pushed_at || b.updated_at) - new Date(a.pushed_at || a.updated_at);
      });
  }

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (Date.now() - data.time > CACHE_TTL) return null;
      return data.repos;
    } catch (e) {
      return null;
    }
  }

  function writeCache(repos) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), repos: repos }));
    } catch (e) {}
  }

  function showRepos(repos) {
    allRepos = sortRepos(repos);
    if (!allRepos.length) {
      filtersEl.innerHTML = "";
      renderStatus("No public projects yet", "New projects will appear here automatically once they're public on GitHub.", false);
      return;
    }
    renderFilters();
    renderProjects();
  }

  function loadRepos(skipCache) {
    var cached = skipCache ? null : readCache();
    if (cached) {
      showRepos(cached);
      return;
    }

    renderSkeletons(6);
    fetch(REPOS_URL, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (res) {
        if (res.status === 403 || res.status === 429) {
          var err = new Error("rate-limit");
          err.reset = res.headers.get("x-ratelimit-reset");
          throw err;
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (repos) {
        // Keep only the fields we use so the cache stays small
        var slim = repos.map(function (r) {
          return {
            name: r.name,
            description: r.description,
            language: r.language,
            stargazers_count: r.stargazers_count,
            updated_at: r.updated_at,
            pushed_at: r.pushed_at,
            html_url: r.html_url,
            homepage: r.homepage,
            fork: r.fork
          };
        });
        writeCache(slim);
        showRepos(slim);
      })
      .catch(function (err) {
        if (err.message === "rate-limit") {
          var when = err.reset ? " Try again after " + new Date(err.reset * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + "." : "";
          renderStatus("GitHub rate limit reached", "Too many requests to the GitHub API from your network." + when, true);
        } else {
          renderStatus("Couldn't load projects", "Something went wrong while contacting GitHub. Check your connection and try again.", true);
        }
      });
  }

  loadRepos(false);
})();
