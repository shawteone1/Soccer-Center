# PlayMetrics Pilot — Production Schema Notes

These migrations are **NOT executed** in the current pilot. They are documented
here for review before any production deployment.

## Tables required for production persistence

### `sc_pilot_player_assignments`
```sql
CREATE TABLE sc_pilot_player_assignments (
  player_id       VARCHAR(64) NOT NULL PRIMARY KEY,
  pilot_team_id   VARCHAR(64) NOT NULL,
  assigned_at     DATETIME    NOT NULL DEFAULT NOW(),
  calendar_synced TINYINT(1)  NOT NULL DEFAULT 0,
  FOREIGN KEY (player_id) REFERENCES sc_player_profiles(id) ON DELETE CASCADE
);
```

### `sc_pilot_game_records`
```sql
CREATE TABLE sc_pilot_game_records (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY,
  player_id       VARCHAR(64)  NOT NULL,
  fixture_id      VARCHAR(64)  NOT NULL,
  participated    TINYINT(1)   NOT NULL DEFAULT 0,
  stat_goals      INT          NULL,
  stat_assists    INT          NULL,
  stat_ga         INT          NULL,
  stat_saves      INT          NULL,
  stat_so         INT          NULL,
  notes           TEXT         NULL,
  created_at      DATETIME     NOT NULL DEFAULT NOW(),
  updated_at      DATETIME     NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  UNIQUE KEY uq_player_fixture (player_id, fixture_id),
  FOREIGN KEY (player_id) REFERENCES sc_player_profiles(id) ON DELETE CASCADE
);
```

### `sc_pilot_connector_state`
```sql
CREATE TABLE sc_pilot_connector_state (
  id              INT          NOT NULL PRIMARY KEY DEFAULT 1,
  mode            VARCHAR(32)  NOT NULL DEFAULT 'demo',
  last_refreshed  DATETIME     NULL,
  last_error      TEXT         NULL,
  source_label    VARCHAR(255) NOT NULL,
  source_ref      JSON         NULL
);
```

## Notes
- `stat_goals = NULL` means "not recorded" (unknown), `0` means "recorded zero"
- `participated = 0` means the player did not play — stats should be ignored in totals
- `fixture_id` references the pilot fixture store (demo or imported); not a FK to a DB table in demo mode
- All pilot data is isolated from `sc_player_match_records` (the existing manual stats table)
