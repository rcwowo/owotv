-- vods.id: UUIDv4 (the /watch/ URL key)
-- episodes.id: UUIDv5 of show+season+title (stable across re-seeds)
PRAGMA foreign_keys = ON;

CREATE TABLE vods (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  stream_date      TEXT NOT NULL,
  duration         TEXT NOT NULL,
  game             TEXT NOT NULL,
  game_cover_url   TEXT NOT NULL,
  vod_url          TEXT NOT NULL,
  thumbnail_url    TEXT NOT NULL,
  chat_replay_path TEXT,
  published        INTEGER NOT NULL DEFAULT 0,
  rank             INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_vods_stream_date ON vods (stream_date DESC);
CREATE INDEX idx_vods_game ON vods (game);
CREATE INDEX idx_vods_published ON vods (published);

CREATE TABLE shows (
  slug        TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_url   TEXT NOT NULL,
  logo_url    TEXT NOT NULL,
  rank        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE episodes (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  duration      TEXT NOT NULL,
  air_date      TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL,
  video_url     TEXT NOT NULL,
  season        TEXT NOT NULL,
  rank          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE show_episodes (
  show_slug  TEXT NOT NULL REFERENCES shows (slug) ON DELETE CASCADE,
  episode_id TEXT NOT NULL REFERENCES episodes (id) ON DELETE CASCADE,
  PRIMARY KEY (show_slug, episode_id)
);

CREATE INDEX idx_show_episodes_episode ON show_episodes (episode_id);
