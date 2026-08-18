// Matches server.py:collect_weather() (server.py:318-342) field for field.
export interface WeatherDay {
  date: string;
  label: string;
  high: number;
  low: number;
  icon: string;
}

export interface WeatherData {
  place: string;
  temp: number;
  feels: number;
  humidity: number;
  wind: number;
  label: string;
  icon: string;
  unit: 'F' | 'C';
  days: WeatherDay[];
}

// Matches server.py:_media_snapshot() (server.py:386-420) field for field.
// `title` is null when nothing is playing or the collector found no usable
// session - `error` only appears if collect_media() itself threw.
export interface MediaData {
  title: string | null;
  artist?: string;
  album?: string;
  app?: string;
  playing?: boolean;
  sessions?: number;
  position?: number;
  duration?: number;
  art?: string | null;
  apps?: string[];
  error?: string;
}

// Matches server.py:collect_apps() (server.py:1898-1900). `icon` is null
// (glyph fallback), a /api/cover?path= URL (locally-copied custom icon),
// or a raw http(s) URL (SteamGridDB icon, used directly).
export interface AppData {
  id: string;
  label: string;
  target: string;
  icon?: string | null;
}

export interface AppsData {
  apps: AppData[];
}

// Matches server.py:collect_games() (server.py:1903-2004). `launch` is
// absent for Battle.net/Riot entries where no launcher was resolved (the
// "no launcher" ribbon in the old UI keys off this). `source` drives the
// badge (steam gets none). `custom_art` means the store's hand-picked
// cover is in effect, not an automatically-resolved one.
export interface GameData {
  id: string;
  name: string;
  last_played?: number;
  size?: number;
  playtime_2wk?: number;
  playtime_forever?: number;
  launch?: string | string[];
  art?: string | null;
  art_alts?: string[];
  art_fallback?: string | null;
  source: 'steam' | 'xbox' | 'battlenet' | 'riot' | 'manual';
  favorite?: boolean;
  custom_art?: boolean;
  editable?: boolean;
}

export interface ShelfData {
  id: string;
  label: string;
  claims?: string[];
  count: number;
  games: GameData[];
  width?: number;
}

export interface PlaytimeEntry {
  id: string;
  name: string;
  art?: string | null;
  launch?: string | string[];
  hours: number;
}

export interface GamesData {
  games: GameData[];
  favorites: GameData[];
  shelves: ShelfData[];
  recent: GameData[];
  playtime_chart: PlaytimeEntry[];
  hidden: string[];
  total: number;
}

// Matches server.py:effective_layout()/collect_ui() (server.py:1871-1895).
// Per view: `order` is panel ids in sequence (position comes from array
// order, there's no x/y), `sizes` is grid-column/row span counts (1-8 /
// 1-20), `hidden` is id membership. Every key in server.py's
// DEFAULT_LAYOUTS gets an entry here automatically.
export interface PanelLayout {
  order: string[];
  sizes: Record<string, { w: number; h: number }>;
  hidden: string[];
}

// The old app's profile system (server.py's store["profile"], edited via
// the `_profile_*` settings keys) - `photo` is already a ready-to-use
// /api/cover?path= URL (save_cover() copies it in on upload), not a raw
// filesystem path. All optional: a fresh install has never set any of
// them.
export interface ProfileData {
  name?: string;
  photo?: string;
  theme?: string;
}

export interface ViewEntry {
  key: string;
  label: string;
  visible: boolean;
}

export interface UiPrefs {
  reduced_motion: boolean;
  sidebar_default_collapsed: boolean;
  default_app: string;
  background_mode: 'wallpaper' | 'color' | 'image';
  background_color: string;
  background_image: string;
}

export interface UiData {
  layouts: Record<string, PanelLayout>;
  profile?: ProfileData;
  views?: ViewEntry[];
  prefs?: UiPrefs;
  [key: string]: unknown;
}

// Matches server.py:collect_accent() (server.py:299-316). `hex` is null
// until a wallpaper or light colour has ever been seen. `bg`/`palette`
// only accompany `from: 'wallpaper'` - a lights-derived accent has
// neither, since there's no image to blur into a background or quantise
// into a palette from. This is the "wallpaper as light source" signal:
// the whole app's ambient background/wash and --accent custom property
// key off this one object (see primitives/Atmosphere).
export interface AccentData {
  hex: string | null;
  from?: 'wallpaper' | 'lights';
  bg?: string;
  palette?: string[];
  source?: string;
}

// Matches server.py:collect_lights() (server.py:1179-1195). `hex` is only
// present when the entity is currently on and reporting an rgb_color
// attribute - an on entity with no colour info (a plain dimmer) still has
// `hex: null`.
export interface LightEntity {
  entity: string;
  name: string;
  on: boolean;
  hex: string | null;
  brightness: number | null;
}

export interface LightsData {
  configured: boolean;
  lights: LightEntity[];
  error?: string;
}

// Matches server.py:collect_wallpapers() (server.py:2198-2212). `thumb` is
// always the fixed-size /api/wall crop; Scene's hero requests a larger
// crop via that route's optional ?w=&h= instead of using this field
// directly.
export interface WallpaperEntry {
  name: string;
  path: string;
  thumb: string;
  current: boolean;
  favorite: boolean;
}

export interface WallpapersData {
  dir: string;
  walls: WallpaperEntry[];
  favorites: WallpaperEntry[];
  total?: number;
  current_path?: string | null;
  current_bg?: string | null;
  configured: boolean;
  error?: string;
}

// Matches wallhaven_search()'s return shape (server.py:2290-2299). `thumb`
// can be null for a handful of Wallhaven entries that omit it; `full` is
// always present and is what actually gets downloaded on apply.
export interface WallhavenItem {
  id: string;
  thumb: string | null;
  full: string;
  w: number;
  h: number;
  favourites?: number;
}

export interface WallhavenResult {
  items: WallhavenItem[];
  last_page?: number;
  error?: string;
}

// Matches server.py:collect_notes() field for field. `rel` is the vault
// path (used as the note's stable id in every /api/note* call); `name`
// is the filename stem, already a clean title with no extension - use
// this as the display title, never `rel`. `pinned` is a store.json
// annotation layered on top of the vault file, not vault content (see
// server.py's pin_note()) - Obsidian never sees it.
export interface NoteEntry {
  name: string;
  rel: string;
  folder: string;
  when: number;
  size: number;
  preview: string;
  pinned: boolean;
}

export interface NotesData {
  dir: string;
  notes: NoteEntry[];
  total: number;
  folders: string[];
  configured: boolean;
  error?: string;
}

// Matches server.py:collect_plex() (server.py:1287-1354). `sections[0]`
// is synthesised as `{ key: "continueWatching" }` whenever `recent` is
// non-empty - it isn't a real Plex library, just packaged in the same
// shape so Home/nav can treat every row uniformly. `playing` is the live
// `/status/sessions` feed (server-side push, not a library listing) -
// its `launch` is always null since resuming an already-playing session
// isn't a launch action.
export interface PlexPlayingItem {
  ratingKey?: string | null;
  title: string | null;
  show?: string | null;
  type?: string;
  user?: string | null;
  art?: string | null;
  // Plex's wide fanart image (distinct from `art`, which is the poster
  // thumb) - the Home hero uses this for its backdrop, falling back to
  // `art` when a library/item has no separate fanart set.
  backdrop?: string | null;
  launch: null;
  duration?: number | null;
  viewOffset?: number | null;
}

export interface PlexItem {
  ratingKey?: string | null;
  title: string | null;
  show?: string | null;
  type?: string;
  year?: number | null;
  art?: string | null;
  backdrop?: string | null;
  // Pre-built plex://preplay/ or /web/... deep link (server.py's
  // _plex_launch) - POST straight to /api/launch via launchTarget(),
  // never constructed client-side.
  launch?: string | null;
  summary?: string | null;
  duration?: number | null;
  viewOffset?: number | null;
  viewCount?: number | null;
  index?: number | null;
  parentIndex?: number | null;
}

export interface PlexSection {
  key: string;
  title: string;
  type: string; // 'movie' | 'show' | 'artist' | 'photo' | 'hub' | ...
  count: number;
  items: PlexItem[];
  error?: string | null;
}

export interface PlexData {
  configured: boolean;
  error?: string | null;
  playing: PlexPlayingItem[];
  recent: PlexItem[];
  sections: PlexSection[];
}

// GET /api/plex/item?ratingKey= - on-demand single-item detail fetch
// (server.py's plex_item_detail(), additive to collect_plex - the
// snapshot poll never carries per-item summary/genres/backdrop for
// every item across every library, only the detail surface asks for
// one at a time). `error` is set instead of throwing so the detail
// screen can render a message rather than crash on a stale ratingKey.
export interface PlexItemDetail {
  ratingKey?: string;
  title?: string;
  show?: string | null;
  type?: string;
  year?: number | null;
  summary?: string | null;
  art?: string | null;
  backdrop?: string | null;
  genres?: string[];
  contentRating?: string | null;
  rating?: number | null;
  studio?: string | null;
  duration?: number | null;
  viewOffset?: number | null;
  viewCount?: number | null;
  index?: number | null;
  parentIndex?: number | null;
  childCount?: number | null;
  launch?: string | null;
  error?: string;
}

// GET /api/note?rel= - the full body of one note, fetched on demand
// (collect_notes only ever sends previews, not full text).
export interface NoteContent {
  ok: boolean;
  rel: string;
  text: string;
  when: number;
  error?: string;
}

// Matches server.py:collect_tasks()/the store.json "tasks" list - a
// small action-oriented layer, independent of any note file (see
// server.py's add_task()/toggle_task()/pin_task()/delete_task()).
// `completed` is only set once `done` is true (a timestamp, not a bool).
export interface TaskEntry {
  id: string;
  text: string;
  done: boolean;
  priority: 'low' | 'normal' | 'high';
  pinned: boolean;
  created: number;
  completed: number | null;
  notes?: string | null;
}

export interface TasksData {
  tasks: TaskEntry[];
}

// Matches server.py:DEFAULT_READING_SOURCES / the "reading_sources" store
// list - one row per RSS feed or YouTube channel collect_reading() polls.
export interface ReadingSource {
  id: string;
  type: 'rss' | 'youtube' | 'webpage';
  label: string;
  url: string;
  topic: 'tech' | 'ai' | 'design' | 'world' | 'travel' | 'games' | 'interesting' | 'youtube' | 'sport';
  enabled: boolean;
}

// Matches server.py:_normalize_reading_item() - the one shape both RSS
// articles and YouTube videos are coerced into, so cards only ever branch
// on `kind` for presentation. `id` is a stable sha1(source+url) join key
// against saved/read state, not the item's own database identity.
export interface ReadingItem {
  id: string;
  kind: 'article' | 'video';
  source_id: string;
  source_label: string;
  topic: ReadingSource['topic'];
  title: string;
  url: string;
  domain: string;
  author?: string | null;
  published: number | null;
  thumb?: string | null;
  blurb: string;
  read_minutes?: number | null;
  // Always null for now - YouTube's own feed XML carries no duration, and
  // getting it needs the Data API (no key available). Reserved field, not
  // a placeholder to fill blindly.
  duration_seconds?: number | null;
  saved: boolean;
  read: boolean;
}

// GET /api/reading/article?id=&url= - matches server.py:_extract_article().
// `html` is already sanitized server-side (lxml_html_clean) before caching,
// safe to render directly in the article reader.
export interface ArticleExtraction {
  ok: boolean;
  html?: string;
  word_count?: number;
  error?: string;
}

// Matches server.py's "books" store list / add_book()/edit_book().
export interface Book {
  id: string;
  title: string;
  author: string;
  cover_url?: string | null;
  status: 'reading' | 'want' | 'finished';
  progress_pct: number;
  pages?: number | null;
  added_at: number;
  started_at?: number | null;
  finished_at?: number | null;
  openlibrary_key?: string | null;
  notes?: string;
  // A link to an actual reading copy - direct PDF/EPUB URL, Google Drive
  // share link, personal server path. Optional; makes the shelf usable
  // for reading, not just tracking. See BookDetail's reader overlay.
  file_url?: string | null;
}

// GET /api/books/search?q= - matches server.py:search_open_library().
export interface BookSearchResult {
  title: string;
  author: string;
  openlibrary_key: string | null;
  cover_url: string | null;
  first_publish_year: number | null;
}

// Matches server.py:collect_reading() (server.py, near collect_wallpapers).
export interface ReadingData {
  items: ReadingItem[];
  sources: ReadingSource[];
  topics: string[];
  books: Book[];
  // Raindrop-style "paste a link" bookmarks - normalized to the exact
  // same shape as a feed item (server.py:_normalize_bookmark()), always
  // `saved: true`. A separate list from `items`, not mixed into the
  // auto-curated feed: these are hand-picked, not polled from a source.
  bookmarks: ReadingItem[];
  errors: Record<string, string>;
  fetched_at: number;
}

// A single {t, v} sample - the shape every history array in HomelabData
// uses, whether it came from server.py's own in-memory ring buffer
// (_metric_series) or was reshaped from a Netdata /api/v1/data response.
export interface MetricPoint {
  t: number;
  v: number;
}

// Matches server.py:collect_hardware() - THIS machine's own stats
// (psutil/pynvml/LibreHardwareMonitor), not the remote homelab server's
// (that's HomelabData's Netdata-backed metrics). `*_history` are this
// machine's own real trend via the same `_record_metric`/`_metric_series`
// ring buffer HomelabData's service/qBittorrent history already uses -
// ~12 real minutes at the 4s hardware-collector cadence, not fabricated.
export interface HardwareData {
  cpu_temp: number | null;
  cpu_load: number | null;
  gpu_temp: number | null;
  gpu_load: number | null;
  ram_used: number | null;
  ram_total: number | null;
  ram_pct: number | null;
  vram_used: number | null;
  vram_total: number | null;
  uptime: number | null;
  disks?: { drive: string; used: number; total: number; pct: number }[];
  disk_io?: DiskIoMetric[];
  cpu_history: MetricPoint[];
  ram_history: MetricPoint[];
  gpu_history: MetricPoint[];
  lhm?: boolean;
}

// Network history keeps both directions per sample rather than two
// parallel arrays - a chart drawing up/down as two lines needs them
// paired by timestamp, not zipped back together at render time.
export interface NetHistoryPoint {
  t: number;
  in: number;
  out: number;
}

// One Netdata-backed metric (CPU/RAM/disk) - `pct` is null and `history`
// is empty until Netdata has actually reported that chart at least once,
// never a fabricated placeholder. Matches server.py:collect_netdata_metrics().
export interface NetdataMetric {
  pct: number | null;
  used_gb?: number | null;
  total_gb?: number | null;
  history: MetricPoint[];
}

export interface NetdataTemp {
  c: number | null;
  history: MetricPoint[];
}

export interface NetdataNet {
  in_kbps: number;
  out_kbps: number;
  history: NetHistoryPoint[];
}

// One real mounted filesystem's capacity - server.py builds one of these
// per disk_space.<mount> chart Netdata reports (a box with a separate
// data volume gets one entry per drive, not a single guessed mount).
export interface DiskSpaceMetric {
  mount: string;
  pct: number | null;
  used_gb: number | null;
  total_gb: number | null;
  history: MetricPoint[];
}

export interface DiskIoHistoryPoint {
  t: number;
  read: number;
  write: number;
}

// Real per-physical-device read/write throughput (KiB/s) - device-mapper/
// LVM duplicates of an already-listed physical device are filtered
// server-side, and a device with zero I/O across the whole window is
// omitted rather than shown as a fabricated flat line.
export interface DiskIoMetric {
  device: string;
  read_kibs: number;
  write_kibs: number;
  history: DiskIoHistoryPoint[];
}

// `configured: false` means no netdata_url is set - the UI's cue to show
// a "connect Netdata" prompt rather than an empty graph. Matches
// server.py:collect_netdata_metrics() (server.py, near collect_homelab).
export interface NetdataData {
  configured: boolean;
  error?: string | null;
  cpu?: NetdataMetric;
  ram?: NetdataMetric;
  disks?: DiskSpaceMetric[];
  disk_io?: DiskIoMetric[];
  net?: NetdataNet;
  temp?: NetdataTemp;
}

// Matches server.py:collect_docker_containers() - real container state via
// the Portainer API, additive to (never a replacement for) the TCP-probe
// `HomelabService` list below.
export interface DockerContainer {
  id: string;
  name: string;
  image: string | null;
  state: string;
  status: string | null;
}

export interface DockerData {
  configured: boolean;
  error?: string | null;
  containers: DockerContainer[];
  running: number;
  total: number;
}

// Matches server.py:collect_homelab()'s per-service entries. `container`
// is only present when a running Docker container's name was matched to
// this service by name (see _name_key) - the TCP probe's `online` stays
// the source of truth for status either way.
export interface HomelabService {
  name: string;
  url: string;
  port: number;
  group: string;
  online: boolean;
  ms: number | null;
  host: string;
  container?: { name: string; state: string; status: string | null };
}

export interface HomelabGroup {
  group: string;
  services: HomelabService[];
  up: number;
  count: number;
}

// The few numbers nothing else already retains history for - see
// server.py's _metric_history ring buffer. Host CPU/RAM/disk/network
// history lives on NetdataData instead (Netdata retains that itself).
export interface HomelabHistory {
  up_count: MetricPoint[];
  latency_ms: MetricPoint[];
  qbit_dl: MetricPoint[];
  qbit_up: MetricPoint[];
}

// Matches server.py:collect_homelab() (server.py, "HOMELAB" section) field
// for field.
export interface HomelabData {
  server_ip: string;
  ssh_online: boolean;
  ssh_ms: number | null;
  services: HomelabService[];
  groups: HomelabGroup[];
  up: number;
  count: number;
  netdata: NetdataData;
  docker: DockerData;
  history: HomelabHistory;
}

// Matches server.py:collect_downloads() - qBittorrent's active/queued
// torrents (already sorted fastest-first and capped server-side) plus
// aggregate transfer speed. `dl`/`up` on both the torrent and the parent
// are bytes/sec, same unit formatSpeed() expects.
export interface TorrentEntry {
  name: string | null;
  progress: number; // 0-100
  state: string | null;
  dl: number;
  up: number;
  eta: number | null; // seconds, null once past qBittorrent's "infinite" cutoff
  size: number; // bytes
  category: string;
}

export interface DownloadsData {
  configured: boolean;
  error?: string | null;
  torrents: TorrentEntry[];
  active?: number;
  total?: number;
  dl?: number;
  up?: number;
}

// Matches server.py:collect_calendar() - the user's own ICS feed, expanded
// through recurring_ical_events so RRULEs (standups, birthdays) show as
// real occurrences, not just their one-off master event. Distinct from
// UpcomingItem below (that's Sonarr/Radarr's release calendar).
export interface CalendarEvent {
  title: string;
  location: string | null;
  when: number;
  all_day: boolean;
  ongoing: boolean;
}

export interface CalendarData {
  configured: boolean;
  items: CalendarEvent[];
  error?: string;
}

// Matches server.py:_arr_calendar()/collect_upcoming() - Sonarr/Radarr's
// forward-looking release calendar, poster included via each item's own
// remoteUrl (a plain image host, loadable without an API key).
export interface UpcomingItem {
  kind: 'tv' | 'movie';
  title: string;
  sub: string;
  when: number | null;
  poster: string | null;
  has_file: boolean;
}

export interface UpcomingData {
  configured: boolean;
  items: UpcomingItem[];
}

// Matches server.py:collect_photo() - the slow-rotating single Immich
// frame the Random Photo panel shows. `pinned` means "stop rotating,
// keep showing this one"; /api/photo/next clears it server-side and
// forces a fresh pick even while pinned stays true.
export interface PhotoData {
  configured: boolean;
  error?: string | null;
  id?: string;
  url?: string;
  when?: string | null;
  place?: string;
  camera?: string;
  name?: string;
  pinned?: boolean;
}

// Matches server.py:collect_popular() - Overseerr's /discover charts
// (TMDB popularity order), each row's own-server availability attached.
// Never this house's personal request history - Top Wanted is what the
// wider world wants, by design.
export interface PopularItem {
  tmdb: number;
  rank: number;
  popularity: number | null;
  status: 'unknown' | 'pending' | 'processing' | 'partial' | 'available';
  title: string;
  poster: string | null;
  year: string;
  url: string;
}

export interface PopularData {
  configured: boolean;
  error?: string | null;
  movies: PopularItem[];
  shows: PopularItem[];
}

// GET /api/data returns one aggregate payload across ~20 collectors
// (server.py:2344-2353). Only weather/media/apps/games/ui/accent/lights/
// wallpapers/notes/tasks/homelab are typed so far - the rest stays
// untyped passthrough and gets a real type as each widget migrates.
export interface Snapshot {
  ts: number;
  iso: string;
  weather?: WeatherData;
  media?: MediaData;
  apps?: AppsData;
  games?: GamesData;
  ui?: UiData;
  accent?: AccentData;
  lights?: LightsData;
  wallpapers?: WallpapersData;
  notes?: NotesData;
  tasks?: TasksData;
  plex?: PlexData;
  reading?: ReadingData;
  homelab?: HomelabData;
  downloads?: DownloadsData;
  upcoming?: UpcomingData;
  photo?: PhotoData;
  popular?: PopularData;
  hardware?: HardwareData;
  calendar?: CalendarData;
  errors: Record<string, string>;
  [key: string]: unknown;
}

// Matches server.py:SETTINGS_SCHEMA field for field - the same schema the
// old app's own settings form read (server.py:101-197). One generic
// key/type/label/hint per field, grouped, rather than each field getting
// its own bespoke frontend type - this is what lets Settings/System/
// Integrations all render forms from the same data instead of three
// hand-built ones.
export interface SettingsFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'secret' | 'number' | 'select' | 'bool' | 'folder' | 'lines' | 'image';
  options?: string[];
  hint?: string;
}

export interface SettingsGroupSchema {
  group: string;
  keys: SettingsFieldSchema[];
}

// Matches GET /api/settings (server.py's "/api/settings" route). `values`
// holds every field's current effective value as a string (DEFAULTS <
// config.ini < the panel's own settings - see load_config()); `origins`
// says which of those three actually won, per key, for showing "from
// config.ini" vs "default" without guessing. `secrets` is the list of
// keys the UI should mask by default.
export interface SettingsResponse {
  schema: SettingsGroupSchema[];
  values: Record<string, string>;
  origins: Record<string, string>;
  secrets: string[];
  views: ViewEntry[];
  pages: unknown[];
  profile: ProfileData;
  config_file: string;
  config_problem: string | null;
  store_file: string;
  onboarding_complete: boolean;
}
