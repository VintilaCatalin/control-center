"""Reading (RSS/YouTube/webpage feeds, bookmarks, books, article extraction).

Extracted verbatim from the pre-modularization panel/server.py.
"""

import hashlib
import html as html_entities
import json
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse, parse_qs, urljoin
import requests

from backend.core import ARTICLE_DIR, CONFIG_DIR, YT_CHANNEL_FEED, YT_RE, _slug, edit_store, load_store


def _strip_html(text, limit=180):
    clean = re.sub(r"<[^>]+>", " ", str(text or ""))
    clean = re.sub(r"&(nbsp|amp|quot|#39|lt|gt);", " ", clean)
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean[:limit]

_IMG_EXT_RE = re.compile(r"\.(jpe?g|png|gif|webp|avif|bmp)(?:$|\?)", re.I)

def _enclosure_image_url(enclosure):
    """<enclosure> is a generic "attached media" tag, not specifically an
    image one - Codrops (among others) uses it to attach an mp4 demo reel
    per post, which an <img> can never render, so that URL used to get
    handed out as `thumb` anyway and just silently failed to load. Only
    trust it as a thumbnail when its own declared type says image/*, or
    (no type given) the URL itself looks like one."""
    if enclosure is None: return None
    found_url = enclosure.get("url")
    if not found_url: return None
    mime = (enclosure.get("type") or "").lower()
    if mime: return found_url if mime.startswith("image/") else None
    return found_url if _IMG_EXT_RE.search(found_url) else None

def _feed_items(url, limit=12):
    import xml.etree.ElementTree as ET
    from email.utils import parsedate_to_datetime
    r = requests.get(url, timeout=12, headers={"User-Agent": "desk-panel/1.0"})
    r.raise_for_status()
    root = ET.fromstring(r.content)
    ns = {"atom": "http://www.w3.org/2005/Atom", "media": "http://search.yahoo.com/mrss/",
          "yt": "http://www.youtube.com/xml/schemas/2015"}
    def text(node, *paths):
        for path in paths:
            found = node.find(path, ns)
            if found is not None and (found.text or "").strip(): return found.text.strip()
        return None

    def pack(title, link, stamp, thumb, blurb, extra=None):
        host = ""
        try: host = (urlparse(link or "").hostname or "").replace("www.", "")
        except Exception: pass
        item = {"title": title or "(untitled)", "url": link, "when": stamp,
                "thumb": thumb, "blurb": _strip_html(blurb), "domain": host,
                "kind": "video" if YT_RE.search(link or "") else "link"}
        item.update(extra or {})
        return item

    items = []
    for node in root.findall(".//item")[:limit]:
        when = text(node, "pubDate")
        stamp = None
        if when:
            try: stamp = parsedate_to_datetime(when).timestamp()
            except Exception: stamp = None
        thumb = node.find("media:thumbnail", ns)
        enclosure = node.find("enclosure")
        # hnrss puts the discussion link in comments and the points in the body.
        comments = text(node, "comments")
        body = text(node, "description", "{http://purl.org/rss/1.0/modules/content/}encoded")
        points = None
        if body:
            found = re.search(r"(\d+)\s*points?", body)
            if found: points = int(found.group(1))
        items.append(pack(text(node, "title"), text(node, "link"), stamp,
                          (thumb.get("url") if thumb is not None else _enclosure_image_url(enclosure)),
                          body, {"comments": comments, "points": points,
                                 "author": text(node, "{http://purl.org/dc/elements/1.1/}creator")}))

    if not items:
        for node in root.findall("atom:entry", ns)[:limit]:
            link = node.find("atom:link", ns)
            when = text(node, "atom:published", "atom:updated")
            stamp = None
            if when:
                try: stamp = datetime.fromisoformat(when.replace("Z", "+00:00")).timestamp()
                except Exception: stamp = None
            group = node.find("media:group", ns)
            thumb = group.find("media:thumbnail", ns) if group is not None else None
            blurb = None
            if group is not None:
                description = group.find("media:description", ns)
                blurb = description.text if description is not None else None
            views = None
            if group is not None:
                stats = group.find("media:community/media:statistics", ns)
                if stats is not None: views = stats.get("views")
            items.append(pack(text(node, "atom:title"),
                              link.get("href") if link is not None else None, stamp,
                              thumb.get("url") if thumb is not None else None, blurb,
                              {"author": text(node, "atom:author/atom:name"), "views": views}))
    return items

_DATE_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")

_ARTICLE_META_RE = {
    "title": re.compile(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    # Same pattern _fetch_og_image's own _OG_IMAGE_RE uses (defined further
    # down in the Reading section) - duplicated rather than shared since
    # this dict is built at module load, before that name exists yet.
    "image": re.compile(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    "description": re.compile(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']', re.I),
    "published": re.compile(r'<meta[^>]+property=["\']article:published_time["\'][^>]+content=["\']([^"\']+)["\']', re.I),
}

def _fetch_article_meta(url):
    """One request, every og:/article: meta tag this app cares about - the
    JSON-LD ItemList path below only ever gets bare URLs from the page
    (schema.org's ItemList has no title/image/date fields), so each entry
    needs its own real title/image/summary/timestamp the same way a
    single-article open already does (see _fetch_og_image) - just fetching
    all four at once here instead of image alone."""
    try:
        r = requests.get(url, timeout=6, headers={"User-Agent": "desk-panel/1.0"})
        r.raise_for_status()
    except Exception:
        return {}
    out = {}
    for key, pattern in _ARTICLE_META_RE.items():
        found = pattern.search(r.text)
        if found: out[key] = html_entities.unescape(found.group(1))
    return out

def _slug_title(url):
    """Readable-ish fallback if a meta fetch fails - most CMS URL slugs are
    the headline itself, dash-separated, with a trailing numeric id."""
    slug = urlparse(url).path.rstrip("/").rsplit("/", 1)[-1]
    slug = re.sub(r"-\d{3,}$", "", slug)
    return " ".join(w.capitalize() for w in slug.split("-")) or url

def _json_ld_listing_urls(html, origin_host, limit):
    """Many news CMSes (this one included) embed a schema.org ItemList as
    <script type="application/ld+json"> declaring exactly which articles
    belong to the current category/team/tag page - the same signal search
    engines use. It's far more precise than any DOM heuristic could be
    (it's the site's own explicit statement of "this page's listing"), and
    it's a generic, widely-used schema, not specific to this one site - so
    it's tried FIRST, before ever falling back to guessing from markup."""
    for match in re.finditer(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            data = json.loads(match.group(1))
        except Exception:
            continue
        if data.get("@type") != "ItemList":
            continue
        urls = []
        for entry in data.get("itemListElement") or []:
            entry_url = entry.get("url") if isinstance(entry, dict) else None
            if not entry_url: continue
            host = (urlparse(entry_url).hostname or "").replace("www.", "")
            if host != origin_host: continue
            urls.append(entry_url)
            if len(urls) >= limit: break
        if urls: return urls
    return []

def _webpage_listing_items(url, limit=20):
    """Generic article-listing extraction for sources with no RSS/XML feed
    (e.g. a plain news section page) - no site-specific scraper. Tries the
    page's own JSON-LD ItemList first (see _json_ld_listing_urls - when a
    team/category page embeds one, it's the actual list of articles that
    belong to THIS page specifically, not just whatever repeated card
    pattern happens to be biggest, which can just as easily be a generic
    site-wide "trending" widget that has nothing to do with the page you
    asked for). Falls back to structural DOM clustering only when no
    ItemList is present. Raises on anything that doesn't look like a real
    listing either way (same as a broken RSS parse), so it lands in
    collect_reading's per-source `errors` dict exactly like today - no new
    frontend error path needed."""
    import lxml.html

    r = requests.get(url, timeout=12, headers={"User-Agent": "desk-panel/1.0"})
    r.raise_for_status()
    origin_host = (urlparse(url).hostname or "").replace("www.", "")

    listing_urls = _json_ld_listing_urls(r.text, origin_host, limit)
    if listing_urls:
        items = []
        for entry_url in listing_urls:
            meta = _fetch_article_meta(entry_url)
            when = None
            if meta.get("published"):
                try: when = datetime.fromisoformat(meta["published"].replace("Z", "+00:00")).timestamp()
                except Exception: when = None
            items.append({
                "title": meta.get("title") or _slug_title(entry_url),
                "url": entry_url, "when": when, "thumb": meta.get("image"),
                "blurb": _strip_html(meta.get("description"), limit=220) if meta.get("description") else "",
                "domain": origin_host, "kind": "link",
            })
        if items: return items

    doc = lxml.html.fromstring(r.text)
    doc.make_links_absolute(url)

    def is_boilerplate(node):
        for ancestor in node.iterancestors():
            if ancestor.tag in ("nav", "header", "footer"): return True
        return False

    def container_signature(anchor):
        """Nearest classed ancestor of this anchor - both its (tag, class)
        identity (the dict key candidates get grouped by) and the node
        itself (the "card" whose heading/image/time/summary belong to this
        entry), so callers never need to re-walk the tree a second time."""
        node = anchor.getparent()
        depth = 0
        while node is not None and depth < 4:
            cls = (node.get("class") or "").strip()
            if cls: return (node.tag, cls, depth), node
            node = node.getparent()
            depth += 1
        return None, None

    candidates = []
    for a in doc.iter("a"):
        href = a.get("href") or ""
        if not href.startswith(("http://", "https://")): continue
        host = (urlparse(href).hostname or "").replace("www.", "")
        if host != origin_host: continue
        if is_boilerplate(a): continue
        text = _strip_html(a.text_content())
        has_img = a.find(".//img") is not None or a.tag == "img"
        if len(text) < 20 and not has_img: continue
        sig, block = container_signature(a)
        if sig is None: continue
        candidates.append((sig, a, href, block))

    if not candidates:
        raise ValueError("no article listing found on that page")

    # Repetition count alone isn't enough - a "pick your team"/category
    # nav strip repeats just as reliably as a real article grid, and often
    # MORE times. Score each repeated cluster by how article-like its
    # members actually look: longer link text (nav items are short labels,
    # headlines aren't), a paragraph summary nearby, and article URLs
    # (most CMSes, this one included, end article paths in a numeric id -
    # a genuinely common pattern across many news sites, not specific to
    # one). Highest-scoring cluster wins, not just the most frequent one.
    _numeric_id_re = re.compile(r"\d{3,}")
    groups = {}
    for sig, a, href, block in candidates:
        groups.setdefault(sig, []).append((a, href, block))

    def cluster_score(members):
        count = len(members)
        avg_len = sum(len(_strip_html(a.text_content())) for a, _, _ in members) / count
        frac_numeric_id = sum(1 for _, href, _ in members if _numeric_id_re.search(href.rsplit("/", 1)[-1])) / count
        frac_has_p = sum(1 for _, _, block in members if block is not None and block.find(".//p") is not None) / count
        return count * (1 + avg_len / 30) * (1 + frac_numeric_id) * (1 + 0.5 * frac_has_p)

    scored = {sig: cluster_score(members) for sig, members in groups.items() if len(members) >= 3}
    if not scored:
        raise ValueError("no repeated listing pattern found on that page")
    winner = max(scored, key=lambda s: scored[s])

    seen_urls = set()
    items = []
    for sig, a, href, block in candidates:
        if sig != winner: continue
        clean_url = href.split("#")[0]
        if clean_url in seen_urls: continue
        seen_urls.add(clean_url)

        heading = None
        for tag in ("h1", "h2", "h3", "h4"):
            found = block.find(f".//{tag}") if block is not None else None
            if found is not None and _strip_html(found.text_content()):
                heading = found
                break
        title = _strip_html(heading.text_content()) if heading is not None else _strip_html(a.text_content())
        if not title:
            img = a.find(".//img")
            title = (img.get("alt") if img is not None else "") or ""
        if not title: continue

        img = block.find(".//img") if block is not None else None
        thumb = None
        if img is not None:
            thumb = img.get("src") or img.get("data-src")
            if not thumb and img.get("srcset"):
                thumb = img.get("srcset").split(",")[0].strip().split(" ")[0]
            if thumb: thumb = urljoin(url, thumb)

        when = None
        time_el = block.find(".//time") if block is not None else None
        if time_el is not None:
            raw_when = time_el.get("datetime") or time_el.text_content()
            found_date = _DATE_RE.search(raw_when or "")
            if found_date:
                try: when = datetime.fromisoformat(found_date.group(1)).timestamp()
                except Exception: when = None
        if when is None:
            # A leading "HH:MM " on the headline itself is a common fast-
            # news pattern (today's time, no date - the site's own layout
            # implies "today"). Strip it from the title either way so it
            # doesn't double up with the frontend's own timestamp display.
            leading_time = re.match(r"^(\d{1,2}):(\d{2})\s+(.+)", title)
            if leading_time:
                hh, mm, rest = int(leading_time.group(1)), int(leading_time.group(2)), leading_time.group(3)
                if 0 <= hh < 24 and 0 <= mm < 60:
                    now = datetime.now()
                    stamp = now.replace(hour=hh, minute=mm, second=0, microsecond=0)
                    if stamp.timestamp() > time.time(): stamp -= timedelta(days=1)
                    when = stamp.timestamp()
                    title = rest

        blurb = ""
        if block is not None:
            for p in block.iter("p"):
                candidate_text = _strip_html(p.text_content())
                if candidate_text and candidate_text != title:
                    blurb = candidate_text
                    break

        items.append({"title": title, "url": clean_url, "when": when, "thumb": thumb,
                      "blurb": blurb, "domain": origin_host, "kind": "link"})
        if len(items) >= limit: break

    if not items:
        raise ValueError("no article listing found on that page")
    return items

FEED_PRESETS = [
    {"group": "Design", "feeds": [
        {"label": "Smashing Magazine", "url": "https://www.smashingmagazine.com/feed/"},
        {"label": "A List Apart", "url": "https://alistapart.com/main/feed/"},
        {"label": "Nielsen Norman Group", "url": "https://www.nngroup.com/feed/rss/"},
        {"label": "CSS-Tricks", "url": "https://css-tricks.com/feed/"},
        {"label": "Sidebar", "url": "https://sidebar.io/feed.xml"},
        {"label": "Godly", "url": "https://godly.website/rss.xml"},
        {"label": "Typewolf", "url": "https://www.typewolf.com/feed"},
    ]},
    {"group": "Tech", "feeds": [
        {"label": "Hacker News", "url": "https://hnrss.org/frontpage"},
        {"label": "Hacker News · 300+", "url": "https://hnrss.org/frontpage?points=300"},
        {"label": "Lobsters", "url": "https://lobste.rs/rss"},
        {"label": "Ars Technica", "url": "https://feeds.arstechnica.com/arstechnica/index"},
        {"label": "The Verge", "url": "https://www.theverge.com/rss/index.xml"},
        {"label": "404 Media", "url": "https://www.404media.co/rss/"},
        {"label": "Simon Willison", "url": "https://simonwillison.net/atom/everything/"},
    ]},
    {"group": "Hardware", "feeds": [
        {"label": "AnandTech", "url": "https://www.anandtech.com/rss/"},
        {"label": "Tom's Hardware", "url": "https://www.tomshardware.com/feeds/all"},
        {"label": "ServeTheHome", "url": "https://www.servethehome.com/feed/"},
        {"label": "Phoronix", "url": "https://www.phoronix.com/rss.php"},
    ]},
    {"group": "Gaming", "feeds": [
        {"label": "Eurogamer", "url": "https://www.eurogamer.net/feed"},
        {"label": "Rock Paper Shotgun", "url": "https://www.rockpapershotgun.com/feed"},
        {"label": "Digital Foundry", "url": "https://www.eurogamer.net/feed/digitalfoundry"},
        {"label": "r/patientgamers", "url": "https://www.reddit.com/r/patientgamers/.rss"},
    ]},
    {"group": "Homelab", "feeds": [
        {"label": "r/homelab", "url": "https://www.reddit.com/r/homelab/.rss"},
        {"label": "r/selfhosted", "url": "https://www.reddit.com/r/selfhosted/.rss"},
        {"label": "Home Assistant", "url": "https://www.home-assistant.io/atom.xml"},
        {"label": "Immich releases", "url": "https://github.com/immich-app/immich/releases.atom"},
    ]},
]

def parse_subscriptions(text):
    """Turn a YouTube subscription export into feed lines.

    There is no keyless way to read someone's subscriptions - that needs OAuth
    and a Google Cloud project. But both of YouTube's own exports carry
    everything needed: Takeout gives a CSV of channel ids, and the older
    subscription manager gives OPML. Either one pasted in here works, and it's a
    one-off rather than a login the panel has to keep alive.
    """
    text = str(text or "")
    found, seen = [], set()

    # OPML / any XML with xmlUrl attributes
    for match in re.finditer(r'<outline[^>]*?>', text, re.I):
        tag = match.group(0)
        url = re.search(r'xmlUrl="([^"]+)"', tag, re.I)
        title = re.search(r'title="([^"]+)"', tag, re.I) or re.search(r'text="([^"]+)"', tag, re.I)
        if not url: continue
        feed = url.group(1).replace("&amp;", "&")
        if feed in seen: continue
        seen.add(feed)
        found.append({"label": (title.group(1) if title else "Channel").replace("&amp;", "&"),
                      "url": feed})

    if not found:
        # Takeout CSV: Channel Id, Channel Url, Channel Title
        for line in text.splitlines():
            line = line.strip()
            if not line or line.lower().startswith("channel id"): continue
            parts = [p.strip().strip('"') for p in line.split(",")]
            cid = next((p for p in parts if re.fullmatch(r"UC[A-Za-z0-9_-]{22}", p)), None)
            if not cid:
                match = re.search(r"(UC[A-Za-z0-9_-]{22})", line)
                cid = match.group(1) if match else None
            if not cid or cid in seen: continue
            seen.add(cid)
            title = parts[-1] if parts and parts[-1] and not parts[-1].startswith("http") else cid
            found.append({"label": title, "url": YT_CHANNEL_FEED + cid})

    return found


def collect_feeds(cfg, _shared):
    feeds = []
    for line in (cfg["feeds"] or "").splitlines():
        line = line.strip()
        if not line or "|" not in line: continue
        label, url = line.split("|", 1)
        label, url = label.strip(), url.strip()
        try:
            items = _feed_items(url, int(cfg.get("feed_items", "12")))
            feeds.append({"label": label, "url": url, "items": items})
        except Exception as e:
            feeds.append({"label": label, "url": url, "items": [], "error": str(e)[:120]})
    return {"feeds": feeds}

def _reading_topic_ids(store=None):
    """The live, user-editable topic vocabulary (store["reading_topics"]) -
    not a fixed enum any more, see reading_add_topic()/reading_remove_topic().
    Pass `store` when already inside an edit_store() mutate() to avoid a
    second disk read; omit it to load fresh (e.g. before opening one)."""
    return {t["id"] for t in (store or load_store())["reading_topics"]}

_HN_BLURB_RE = re.compile(r"Article URL:\s*\S+|Comments URL:\s*\S+|Points:\s*\d+|#\s*Comments:\s*\d+", re.I)

def _clean_blurb(text):
    """hnrss (and similar feeds) put a templated 'Article URL: ... Comments
    URL: ... Points: N # Comments: N' string in <description> instead of an
    actual summary - showing that as if it were the article's own excerpt
    is actively misleading, not just unhelpful. Strip those known fields;
    if nothing real is left, there's no genuine excerpt for this item (the
    frontend's TextCard already handles a missing blurb gracefully)."""
    cleaned = _HN_BLURB_RE.sub("", text or "").strip(" -·|").strip()
    return cleaned if len(cleaned) > 8 else ""

def _normalize_reading_item(source, raw):
    """One shared shape for both RSS articles and YouTube videos (raw items
    from _feed_items()), so the frontend only ever branches on `kind` for
    presentation, never on which backend quirk produced the item."""
    url = raw.get("url") or ""
    item_id = hashlib.sha1(f"{source['id']}|{url}".encode()).hexdigest()[:16]
    blurb = _clean_blurb(raw.get("blurb"))
    return {
        "id": item_id,
        # Kind follows the *source's* own type, not a guess based on
        # where a given item happens to link to - an HN submission that
        # links to a YouTube video is still an HN article, not "from
        # YouTube" (that section is "from your subscribed channels", not
        # "any link that happens to point at youtube.com").
        "kind": "video" if source.get("type") == "youtube" else "article",
        "source_id": source["id"], "source_label": source["label"], "topic": source["topic"],
        "title": raw.get("title") or "(untitled)", "url": url, "domain": raw.get("domain") or "",
        "author": raw.get("author"), "published": raw.get("when"),
        "thumb": raw.get("thumb"), "blurb": blurb,
        # Word count isn't known from an RSS summary alone - this is a rough
        # floor from the blurb length only; the article-detail view recomputes
        # it for real once trafilatura has extracted the full text (see the
        # /api/reading/article route, added in Phase 2).
        "read_minutes": max(1, len(blurb) // 1000),
        # YouTube's own feed XML carries no duration (that needs the Data API,
        # which needs a key we don't have) - always None for now, a known gap
        # rather than a faked value.
        "duration_seconds": None,
        "saved": False, "read": False,
    }

def _normalize_bookmark(b):
    """Same shape as _normalize_reading_item() so ArticleDetail/ReadingCard
    render a bookmark with zero special-casing - the only real difference
    is where it came from (pasted by hand, not polled from a subscribed
    source). Always `saved: True`: adding a bookmark IS the save action,
    there's no separate un-saved state for something you pasted in."""
    blurb = b.get("blurb") or ""
    return {
        "id": b["id"], "kind": "article", "source_id": "bookmark",
        "source_label": b.get("source_label") or b.get("domain") or "Bookmark",
        "topic": b.get("topic") or "interesting", "title": b.get("title") or b["url"],
        "url": b["url"], "domain": b.get("domain") or "", "author": None,
        "published": b.get("added_at"), "thumb": b.get("thumb"), "blurb": blurb,
        "read_minutes": max(1, len(blurb) // 1000), "duration_seconds": None,
        "saved": True, "read": False,
    }

_OG_IMAGE_CACHE_FILE = CONFIG_DIR / "og-image-cache.json"
_OG_IMAGE_RE = re.compile(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', re.I)
# Some feeds (Codrops among them) carry no image at all in their RSS -
# every <enclosure> is a video demo reel, no media:thumbnail, nothing.
# Rather than leave those permanently text-only, the article's own og:image
# meta tag (same thing a Slack/Discord link preview reads) gets fetched
# once per URL, ever, and cached to disk - collect_reading runs every 15
# minutes (see INTERVALS), so a handful of extra page fetches per cycle
# is cheap, and a capped budget keeps one large backlog from stalling a
# single collector run.
_OG_IMAGE_BUDGET_PER_CYCLE = 40

def _load_og_image_cache():
    try: return json.loads(_OG_IMAGE_CACHE_FILE.read_text(encoding="utf-8"))
    except Exception: return {}

def _save_og_image_cache(cache):
    try:
        _OG_IMAGE_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        _OG_IMAGE_CACHE_FILE.write_text(json.dumps(cache), encoding="utf-8")
    except OSError: pass

def _fetch_og_image(url):
    try:
        # A single `iter_content` read doesn't reliably return a full 64KB
        # just because that's the chunk_size asked for - it returns
        # whatever the network buffered in one read, which was routinely
        # under 20KB in practice. og:image is often past that (Colossal's
        # sits ~77KB in) once a page has enough head content ahead of it,
        # so every one of those was silently coming back "not found".
        # This is a one-time-per-URL background fetch (cached forever
        # after), so just reading the real page is the simple fix.
        r = requests.get(url, timeout=10, headers={"User-Agent": "desk-panel/1.0"})
        r.raise_for_status()
        found = _OG_IMAGE_RE.search(r.text)
        # HTML attribute values escape `&` as `&amp;` - a raw regex pull
        # off the page keeps that literal text instead of a real query
        # separator, which 502'd every fetch through /api/reading/thumb
        # for any og:image URL with more than one query parameter.
        return html_entities.unescape(found.group(1)) if found else None
    except Exception:
        return None

def _backfill_thumbs(items):
    """Mutates `items` in place - fills `thumb` for article items that
    have none, from a per-URL disk cache first and a bounded number of
    live og:image fetches second. Round-robins across sources for the
    live-fetch budget - one source with a big backlog of missing thumbs
    (rockpapershotgun's RSS carries none either, as it turns out) would
    otherwise burn the whole budget before a smaller source like Codrops
    ever got a turn."""
    cache = _load_og_image_cache()
    changed = False

    by_source: dict[str, list[dict]] = {}
    for item in items:
        if item["thumb"] or item["kind"] != "article": continue
        url = item["url"]
        if url in cache:
            if cache[url]: item["thumb"] = cache[url]
            continue
        by_source.setdefault(item["source_id"], []).append(item)

    queues = list(by_source.values())
    budget = _OG_IMAGE_BUDGET_PER_CYCLE
    while budget > 0 and queues:
        for queue in list(queues):
            if budget <= 0: break
            item = queue.pop(0)
            if not queue: queues.remove(queue)
            found = _fetch_og_image(item["url"])
            cache[item["url"]] = found  # cache the miss too - never re-fetched
            changed = True
            if found: item["thumb"] = found
            budget -= 1

    if changed: _save_og_image_cache(cache)

def collect_reading(cfg, _shared):
    store = load_store()
    sources = [s for s in store["reading_sources"] if s.get("enabled")]
    saved_ids = {s["id"] for s in store["reading_saved"]}
    read_ids = {r["id"] for r in store["reading_read"]}
    hidden_ids = {h["id"] for h in store["reading_hidden"]}
    items, errors = [], {}
    for source in sources:
        try:
            if source.get("type") == "webpage":
                raw_items = _webpage_listing_items(source["url"], limit=20)
            else:
                raw_items = _feed_items(source["url"], limit=20)
        except Exception as e:
            errors[source["id"]] = str(e)[:120]
            continue
        for raw in raw_items:
            item = _normalize_reading_item(source, raw)
            if item["id"] in hidden_ids: continue
            item["saved"] = item["id"] in saved_ids
            item["read"] = item["id"] in read_ids
            items.append(item)
    _backfill_thumbs(items)
    items.sort(key=lambda i: i["published"] or 0, reverse=True)
    bookmarks = sorted((_normalize_bookmark(b) for b in store["reading_bookmarks"]),
                       key=lambda i: i["published"] or 0, reverse=True)
    return {"items": items, "sources": store["reading_sources"], "topics": store["reading_topics"],
            "books": store["books"], "bookmarks": bookmarks, "errors": errors, "fetched_at": time.time()}

def _reading_set_membership(list_key, item_id, want):
    """Shared body for save/read/hide - each is just 'is this id in this
    store list', add-or-remove, {id, at} entries so callers can show
    'saved 3 days ago' later without extra bookkeeping."""
    def mutate(store):
        lst = store.setdefault(list_key, [])
        without = [e for e in lst if e.get("id") != item_id]
        store[list_key] = without + ([{"id": item_id, "at": time.time()}] if want else [])
    edit_store(mutate)
    return {"ok": True}

def reading_set_saved(item_id, saved):
    return _reading_set_membership("reading_saved", item_id, saved)

def reading_set_read(item_id, read):
    return _reading_set_membership("reading_read", item_id, read)

def reading_hide_item(item_id):
    return _reading_set_membership("reading_hidden", item_id, True)

def reading_add_source(payload):
    label = str(payload.get("label") or "").strip()
    url = str(payload.get("url") or "").strip()
    if not label or not url: return {"ok": False, "error": "label and url required"}
    if payload.get("type") in ("rss", "youtube", "webpage"):
        source_type = payload["type"]
    else:
        source_type = "youtube" if YT_RE.search(url) else "rss"
    topic = payload.get("topic") if payload.get("topic") in _reading_topic_ids() else "interesting"
    base_id = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-") or hashlib.sha1(url.encode()).hexdigest()[:8]
    result = {"ok": True}
    def mutate(store):
        nonlocal result
        existing = store.setdefault("reading_sources", [])
        if any(s.get("url") == url for s in existing):
            result = {"ok": False, "error": "that source is already added"}
            return
        sid, used = base_id, {s["id"] for s in existing}
        while sid in used: sid += "-2"
        existing.append({"id": sid, "type": source_type, "label": label[:80], "url": url, "topic": topic, "enabled": True})
        result["id"] = sid
    edit_store(mutate)
    return result

def reading_edit_source(source_id, patch):
    result = {"ok": False, "error": "not found"}
    def mutate(store):
        nonlocal result
        for s in store.get("reading_sources") or []:
            if s.get("id") != source_id: continue
            if str(patch.get("label") or "").strip():
                s["label"] = str(patch["label"]).strip()[:80]
            if patch.get("type") in ("rss", "youtube", "webpage"):
                s["type"] = patch["type"]
            if patch.get("topic") in _reading_topic_ids(store):
                s["topic"] = patch["topic"]
            if "enabled" in patch:
                s["enabled"] = bool(patch["enabled"])
            result = {"ok": True}
    edit_store(mutate)
    return result

def reading_delete_source(source_id):
    def mutate(store):
        store["reading_sources"] = [s for s in store.get("reading_sources") or [] if s.get("id") != source_id]
    edit_store(mutate)
    return {"ok": True}

def reading_add_topic(label):
    """Topics used to be a fixed 9-value enum - now a plain list in the
    store, same "list of {id,label} dicts, id derived from the label via
    _slug()" shape sources/pages/shelves already use elsewhere in this
    file/core.py."""
    label = str(label or "").strip()[:40]
    if not label: return {"ok": False, "error": "a name is required"}
    result = {"ok": True}
    def mutate(store):
        nonlocal result
        topics = store.setdefault("reading_topics", [])
        if any(t.get("label", "").lower() == label.lower() for t in topics):
            result = {"ok": False, "error": "that topic already exists"}
            return
        used = {t["id"] for t in topics}
        tid = _slug(label)
        while tid in used: tid += "-2"
        topics.append({"id": tid, "label": label})
        result = {"ok": True, "id": tid, "topics": topics}
    edit_store(mutate)
    return result

def reading_remove_topic(topic_id):
    """"interesting" is the fallback every invalid/removed topic
    reassigns to (see reading_add_source/reading_edit_source/add_bookmark)
    - it must always exist, so it's the one topic that can't be removed."""
    topic_id = str(topic_id or "")
    if topic_id == "interesting":
        return {"ok": False, "error": "can't remove the default topic"}
    result = {"ok": False, "error": "not found"}
    def mutate(store):
        nonlocal result
        topics = store.get("reading_topics") or []
        if not any(t.get("id") == topic_id for t in topics):
            return
        store["reading_topics"] = [t for t in topics if t.get("id") != topic_id]
        for s in store.get("reading_sources") or []:
            if s.get("topic") == topic_id: s["topic"] = "interesting"
        for b in store.get("reading_bookmarks") or []:
            if b.get("topic") == topic_id: b["topic"] = "interesting"
        result = {"ok": True, "topics": store["reading_topics"]}
    edit_store(mutate)
    return result

def reading_import_subscriptions(text):
    """Reuses parse_subscriptions() (the existing YouTube OPML/Takeout-CSV
    parser) - see FEED_PRESETS/YT_CHANNEL_FEED for the rest of that
    machinery. Dedupes against sources already saved by URL."""
    found = parse_subscriptions(text)
    if not found:
        return {"ok": False, "error": "Couldn't find any channels in that. "
                                      "Paste the Takeout subscriptions.csv or an OPML export."}
    added = 0
    def mutate(store):
        nonlocal added
        existing = store.setdefault("reading_sources", [])
        have_urls = {s.get("url") for s in existing}
        used_ids = {s["id"] for s in existing}
        for f in found:
            url = f["url"]
            if url in have_urls: continue
            have_urls.add(url)
            sid = re.sub(r"[^a-z0-9]+", "-", f["label"].lower()).strip("-") or hashlib.sha1(url.encode()).hexdigest()[:8]
            while sid in used_ids: sid += "-2"
            used_ids.add(sid)
            existing.append({"id": sid, "type": "youtube", "label": f["label"][:80], "url": url,
                             "topic": "youtube", "enabled": True})
            added += 1
    edit_store(mutate)
    return {"ok": True, "found": len(found), "added": added}

BOOK_STATUSES = ("reading", "want", "finished")

def search_open_library(query):
    """Proxies Open Library's search - no key needed, per the Reading
    redesign plan's Books decision. Returns a trimmed shape for the
    'add book' search-as-you-type UI, not the raw API response.

    `ok` distinguishes "genuinely no matches" (ok: True, results: []) from
    "the request itself failed" (ok: False, error: ...) - Open Library is
    occasionally slow/rate-limited/unreachable, and collapsing both into
    the same empty list made a real outage look identical to a bad search
    term, with no way to tell the user which one happened."""
    query = str(query or "").strip()
    if not query: return {"ok": True, "results": []}
    try:
        r = requests.get("https://openlibrary.org/search.json", params={"q": query, "limit": 10},
                         timeout=10, headers={"User-Agent": "desk-panel/1.0"})
        r.raise_for_status()
        docs = r.json().get("docs") or []
    except requests.exceptions.Timeout:
        return {"ok": False, "results": [], "error": "Open Library took too long to respond"}
    except requests.exceptions.RequestException as e:
        return {"ok": False, "results": [], "error": str(e)[:140]}
    except Exception as e:
        return {"ok": False, "results": [], "error": f"Couldn't read Open Library's response ({str(e)[:100]})"}
    results = []
    for d in docs[:10]:
        cover_id = d.get("cover_i")
        results.append({
            "title": d.get("title") or "",
            "author": ", ".join(d.get("author_name") or []) or "Unknown",
            "openlibrary_key": d.get("key"),
            "cover_url": f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg" if cover_id else None,
            "first_publish_year": d.get("first_publish_year"),
        })
    return {"ok": True, "results": results}

def add_book(payload):
    title = str(payload.get("title") or "").strip()
    if not title: return {"ok": False, "error": "title required"}
    author = str(payload.get("author") or "").strip() or "Unknown"
    ol_key = str(payload.get("openlibrary_key") or "").strip() or None
    status = payload.get("status") if payload.get("status") in BOOK_STATUSES else "want"
    book_id = ("ol-" + ol_key.rstrip("/").split("/")[-1]) if ol_key else \
              ("manual-" + hashlib.sha1(f"{title}|{author}".encode()).hexdigest()[:10])
    now = time.time()
    book = {
        "id": book_id, "title": title[:200], "author": author[:150],
        "cover_url": str(payload.get("cover_url") or "").strip() or None,
        "status": status, "progress_pct": 100 if status == "finished" else 0,
        "pages": int(payload["pages"]) if str(payload.get("pages") or "").isdigit() else None,
        "added_at": now,
        "started_at": now if status == "reading" else None,
        "finished_at": now if status == "finished" else None,
        "openlibrary_key": ol_key, "notes": "",
        # Optional link to an actual reading copy - a direct PDF/EPUB URL,
        # a Google Drive share link, a personal server path, whatever the
        # user has. Makes the shelf something you can actually read from,
        # not just a progress tracker - see edit_book() for how it's set/
        # changed later, and BookDetail.tsx's reader overlay for playback.
        "file_url": str(payload.get("file_url") or "").strip() or None,
    }
    added = {"ok": True, "id": book_id}
    def mutate(store):
        if any(b.get("id") == book_id for b in store.get("books") or []):
            return  # already on the shelf - dedupe silently, not an error
        store.setdefault("books", []).append(book)
    edit_store(mutate)
    return added

def edit_book(book_id, patch):
    result = {"ok": False, "error": "not found"}
    def mutate(store):
        nonlocal result
        for b in store.get("books") or []:
            if b.get("id") != book_id: continue
            if patch.get("status") in BOOK_STATUSES:
                b["status"] = patch["status"]
                # Reading now / Finished stamp their own timestamps the
                # first time you land there, same as toggle_task marking
                # `completed` - never overwritten on a later edit.
                if patch["status"] == "reading" and not b.get("started_at"):
                    b["started_at"] = time.time()
                if patch["status"] == "finished":
                    if not b.get("finished_at"): b["finished_at"] = time.time()
                    b["progress_pct"] = 100
            if "progress_pct" in patch:
                try: b["progress_pct"] = max(0, min(100, int(patch["progress_pct"])))
                except (TypeError, ValueError): pass
            if "notes" in patch:
                b["notes"] = str(patch.get("notes") or "")[:2000]
            if "file_url" in patch:
                b["file_url"] = str(patch.get("file_url") or "").strip() or None
            result = {"ok": True}
        return None
    edit_store(mutate)
    return result

def delete_book(book_id):
    def mutate(store):
        store["books"] = [b for b in store.get("books") or [] if b.get("id") != book_id]
    edit_store(mutate)
    return {"ok": True}

def add_bookmark(payload):
    """Raindrop-style 'paste a link' bookmark - fetches the page once,
    pulls title/image/description via trafilatura's metadata extractor
    (not the full-text extractor _extract_article uses; a bookmark needs
    a card's worth of metadata, not the whole article body up front - the
    reader still fetches full text on demand through the same
    /api/reading/article path every other article uses, since
    _normalize_bookmark gives it the same id/url shape)."""
    url = str(payload.get("url") or "").strip()
    if not url.startswith(("http://", "https://")):
        return {"ok": False, "error": "that doesn't look like a URL"}
    bookmark_id = hashlib.sha1(url.encode()).hexdigest()[:16]
    topic = payload.get("topic") if payload.get("topic") in _reading_topic_ids() else "interesting"
    domain = (urlparse(url).hostname or "").replace("www.", "")
    title, image, excerpt, sitename = url, None, "", domain
    try:
        import trafilatura
        r = requests.get(url, timeout=15, headers={"User-Agent": "desk-panel/1.0"})
        r.raise_for_status()
        if r.encoding is None or r.encoding.lower() == "iso-8859-1":
            r.encoding = r.apparent_encoding
        meta = trafilatura.extract_metadata(r.text, default_url=url).as_dict()
        title = (meta.get("title") or "").strip() or url
        image = meta.get("image") or None
        excerpt = (meta.get("description") or "").strip()
        sitename = (meta.get("sitename") or "").strip() or domain
    except Exception as e:
        errors_note = str(e)[:120]  # swallowed - a bookmark with just a URL as its title beats a hard failure
        _ = errors_note
    bookmark = {
        "id": bookmark_id, "url": url, "title": title[:200], "domain": domain,
        "source_label": sitename[:80], "thumb": image, "blurb": excerpt[:400],
        "topic": topic, "added_at": time.time(),
    }
    result = {"ok": True, "id": bookmark_id}
    def mutate(store):
        existing = store.setdefault("reading_bookmarks", [])
        if any(b.get("id") == bookmark_id for b in existing):
            return  # already bookmarked - dedupe silently
        existing.append(bookmark)
    edit_store(mutate)
    return result

def delete_bookmark(bookmark_id):
    def mutate(store):
        store["reading_bookmarks"] = [b for b in store.get("reading_bookmarks") or [] if b.get("id") != bookmark_id]
    edit_store(mutate)
    return {"ok": True}

def _extract_article(url, cache_id):
    """Full-text extraction for the article reader, for sites whose RSS
    feed only carries a short summary. Disk-cached by item id, including
    failures - a paywalled/broken URL costs one real fetch attempt ever,
    not one every time the reader is opened (same "cache the negative
    result too" shape as _griddb_art's in-memory cache)."""
    cache_file = ARTICLE_DIR / f"{cache_id}.json"
    if cache_file.is_file():
        try: return json.loads(cache_file.read_text(encoding="utf-8"))
        except Exception: pass

    import trafilatura  # lazy import, same convention as PIL elsewhere
    import lxml.html
    from lxml_html_clean import Cleaner
    result = {"ok": False, "error": "extraction failed"}
    try:
        r = requests.get(url, timeout=15, headers={"User-Agent": "desk-panel/1.0"})
        r.raise_for_status()
        html = trafilatura.extract(
            r.text, output_format="html", include_images=True,
            include_links=True, include_formatting=True, favor_recall=True,
        )
        if html:
            # Extracted content is still third-party HTML - it gets
            # rendered client-side (article reader), so it's sanitized
            # here, at the one place both the network fetch and the
            # cache write happen, rather than trusted to the frontend.
            cleaner = Cleaner(scripts=True, javascript=True, comments=True, style=True,
                              links=False, meta=True, page_structure=True, embedded=True,
                              frames=True, forms=True, annoying_tags=True)
            clean_doc = cleaner.clean_html(lxml.html.fromstring(html))
            # Same hotlink problem thumbnails have, but inside the article
            # body itself - a browser loading these third-party image URLs
            # directly sends this app's own origin as Referer, which image
            # CDNs commonly reject. Route every <img> through the same
            # /api/reading/thumb proxy; baked into the cached HTML once
            # here rather than rewritten client-side on every read.
            for img in clean_doc.iter("img"):
                src = img.get("src")
                if not src: continue
                # Some sites emit root-relative image paths ("/games/x.png")
                # in their article markup - resolved against nothing, that
                # loads against THIS app's own origin instead of the
                # source site's, a guaranteed 404 shaped exactly like the
                # hotlink-block bug this proxy already fixes. Resolve
                # against the article's own URL first.
                absolute = urljoin(url, src)
                if absolute.startswith(("http://", "https://")):
                    img.set("src", "/api/reading/thumb?url=" + requests.utils.quote(absolute, safe=""))
                if "srcset" in img.attrib:
                    del img.attrib["srcset"]
            clean_html = lxml.html.tostring(clean_doc, encoding="unicode")
            word_count = len(re.sub(r"<[^>]+>", " ", clean_html).split())
            result = {"ok": True, "html": clean_html, "word_count": word_count}
        else:
            result = {"ok": False, "error": "no article content found"}
    except Exception as e:
        result = {"ok": False, "error": str(e)[:160]}

    try:
        ARTICLE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(result), encoding="utf-8")
    except OSError:
        pass  # a cache miss every time is a perf issue, not a correctness one
    return result
