import express, { type NextFunction, type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";
import { readFileSync } from "node:fs";
import { upsertSourcesCatalog } from './sources-seed.js';
import { sql } from "drizzle-orm";
import { db } from './db/client.js';
import { getSecret } from '#airo/secrets';
import { isCoachProfileEnabled } from './lib/coach-feature-gate.js';
import { apiClient, regionAllowed } from "./youtube.js";
import { redactCoachToken } from "./lib/redact-coach-token.js";

// <api-imports>
import admin__content__get from "./api/admin/content/GET";
import admin__content__patch from "./api/admin/content/PATCH";
import admin__content__import__post from "./api/admin/content/import/POST";
import admin__enrich_dev_videos__post from "./api/admin/enrich-dev-videos/POST";
import admin__import_fitness_videos__post from "./api/admin/import-fitness-videos/POST";
import admin__import_log__get from "./api/admin/import-log/GET";
import admin__refresh_dev_playlists__post from "./api/admin/refresh-dev-playlists/POST";
import admin__seed_dev_videos__post from "./api/admin/seed-dev-videos/POST";
import auth__action__get from "./api/auth/[action]/GET";
import auth__action__post from "./api/auth/[action]/POST";
import auth__action__detail__get from "./api/auth/[action]/[detail]/GET";
import auth__action__detail__post from "./api/auth/[action]/[detail]/POST";
import build_info__get from "./api/build-info/GET";
import calendar__connections__get from "./api/calendar/connections/GET";
import calendar__events__get from "./api/calendar/events/GET";
import calendar__google__auth__get from "./api/calendar/google/auth/GET";
import calendar__google__callback__get from "./api/calendar/google/callback/GET";
import calendar__google__disconnect__post from "./api/calendar/google/disconnect/POST";
import calendar__outlook__auth__get from "./api/calendar/outlook/auth/GET";
import calendar__outlook__callback__get from "./api/calendar/outlook/callback/GET";
import calendar__outlook__disconnect__post from "./api/calendar/outlook/disconnect/POST";
import calendar__playmetrics__auth__get from "./api/calendar/playmetrics/auth/GET";
import calendar__playmetrics__callback__get from "./api/calendar/playmetrics/callback/GET";
import calendar__playmetrics__disconnect__post from "./api/calendar/playmetrics/disconnect/POST";
import calendar__status__get from "./api/calendar/status/GET";
import calendar__teamsnap__auth__get from "./api/calendar/teamsnap/auth/GET";
import calendar__teamsnap__callback__get from "./api/calendar/teamsnap/callback/GET";
import calendar__teamsnap__disconnect__post from "./api/calendar/teamsnap/disconnect/POST";
import catalog__teams__get from "./api/catalog/teams/GET";
import coach__media__token__assignmentId__get from "./api/coach/media/[token]/[assignmentId]/GET";
import coach__photo__token__playerId__get from "./api/coach/photo/[token]/[playerId]/GET";
import coach__profile__token__get from "./api/coach/profile/[token]/GET";
import coach__profile__token__requests__post from "./api/coach/profile/[token]/requests/POST";
import contact__formName__post from "./api/contact/[formName]/POST";
import fanzone__content__get from "./api/fanzone/content/GET";
import health__get from "./api/health/GET";
import highlights__get from "./api/highlights/GET";
import highlights__all__get from "./api/highlights/all/GET";
import highlights__leagues__get from "./api/highlights/leagues/GET";
import highlights__refresh__post from "./api/highlights/refresh/POST";
import my_soccer__account__delete from "./api/my-soccer/account/DELETE";
import my_soccer__account__password__post from "./api/my-soccer/account/password/POST";
import my_soccer__club_feed__get from "./api/my-soccer/club-feed/GET";
import my_soccer__content__get from "./api/my-soccer/content/GET";
import my_soccer__events__get from "./api/my-soccer/events/GET";
import my_soccer__feed_prefs__post from "./api/my-soccer/feed-prefs/POST";
import my_soccer__feeds__get from "./api/my-soccer/feeds/GET";
import my_soccer__feeds__post from "./api/my-soccer/feeds/POST";
import my_soccer__feeds__ambiguous__get from "./api/my-soccer/feeds/ambiguous/GET";
import my_soccer__feeds__assign_portal__post from "./api/my-soccer/feeds/assign-portal/POST";
import my_soccer__feeds__feedId__delete from "./api/my-soccer/feeds/[feedId]/DELETE";
import my_soccer__following__get from "./api/my-soccer/following/GET";
import my_soccer__following__post from "./api/my-soccer/following/POST";
import my_soccer__itunes_search__get from "./api/my-soccer/itunes-search/GET";
import my_soccer__league_club_feed__get from "./api/my-soccer/league-club-feed/GET";
import my_soccer__league_clubs__get from "./api/my-soccer/league-clubs/GET";
import my_soccer__me__get from "./api/my-soccer/me/GET";
import my_soccer__media__upload__post from "./api/my-soccer/media/upload/POST";
import my_soccer__media_sources__get from "./api/my-soccer/media-sources/GET";
import my_soccer__news_feed__get from "./api/my-soccer/news-feed/GET";
import my_soccer__personal_events__get from "./api/my-soccer/personal-events/GET";
import my_soccer__personal_events__post from "./api/my-soccer/personal-events/POST";
import my_soccer__personal_events__eventId__delete from "./api/my-soccer/personal-events/[eventId]/DELETE";
import my_soccer__personal_events__eventId__put from "./api/my-soccer/personal-events/[eventId]/PUT";
import my_soccer__pl_clubs__get from "./api/my-soccer/pl-clubs/GET";
import my_soccer__player_profiles__get from "./api/my-soccer/player-profiles/GET";
import my_soccer__player_profiles__post from "./api/my-soccer/player-profiles/POST";
import my_soccer__player_profiles__profileId__delete from "./api/my-soccer/player-profiles/[profileId]/DELETE";
import my_soccer__player_profiles__profileId__patch from "./api/my-soccer/player-profiles/[profileId]/PATCH";
import my_soccer__podcast_import__post from "./api/my-soccer/podcast-import/POST";
import my_soccer__portal_preference__post from "./api/my-soccer/portal-preference/POST";
import my_soccer__profile__get from "./api/my-soccer/profile/GET";
import my_soccer__profile__post from "./api/my-soccer/profile/POST";
import my_soccer__publisher_feed__get from "./api/my-soccer/publisher-feed/GET";
import my_soccer__recommendations__get from "./api/my-soccer/recommendations/GET";
import my_soccer__refresh__post from "./api/my-soccer/refresh/POST";
import my_soccer__reminders__get from "./api/my-soccer/reminders/GET";
import my_soccer__reminders__post from "./api/my-soccer/reminders/POST";
import my_soccer__reminders__reminderId__delete from "./api/my-soccer/reminders/[reminderId]/DELETE";
import my_soccer__rss_feed__get from "./api/my-soccer/rss-feed/GET";
import my_soccer__run_schema_fan_profile__post from "./api/my-soccer/run-schema-fan-profile/POST";
import my_soccer__saved__get from "./api/my-soccer/saved/GET";
import my_soccer__saved__post from "./api/my-soccer/saved/POST";
import my_soccer__saved__contentId__delete from "./api/my-soccer/saved/[contentId]/DELETE";
import my_soccer__saved_tryouts__get from "./api/my-soccer/saved-tryouts/GET";
import my_soccer__saved_tryouts__post from "./api/my-soccer/saved-tryouts/POST";
import my_soccer__saved_tryouts__tryoutId__delete from "./api/my-soccer/saved-tryouts/[tryoutId]/DELETE";
import my_soccer__saved_tryouts_resolved__get from "./api/my-soccer/saved-tryouts-resolved/GET";
import my_soccer__tryouts__get from "./api/my-soccer/tryouts/GET";
import my_soccer__unified_feed__get from "./api/my-soccer/unified-feed/GET";
import parent__admin__check_schema_recruiting__get from "./api/parent/admin/check-schema-recruiting/GET";
import parent__admin__coach_config_debug__get from "./api/parent/admin/coach-config-debug/GET";
import parent__admin__db_tables__get from "./api/parent/admin/db-tables/GET";
import parent__admin__debug_rss__post from "./api/parent/admin/debug-rss/POST";
import parent__admin__grant_self_admin__post from "./api/parent/admin/grant-self-admin/POST";
import parent__admin__migrate_check__get from "./api/parent/admin/migrate-check/GET";
import parent__admin__migrate_to_private__post from "./api/parent/admin/migrate-to-private/POST";
import parent__admin__policy_test__post from "./api/parent/admin/policy-test/POST";
import parent__admin__purge_unverified_coaches__post from "./api/parent/admin/purge-unverified-coaches/POST";
import parent__admin__recruiting_refresh__post from "./api/parent/admin/recruiting-refresh/POST";
import parent__admin__recruiting_refresh_status__get from "./api/parent/admin/recruiting-refresh-status/GET";
import parent__admin__run_schema_coach_profile_v1__post from "./api/parent/admin/run-schema-coach-profile-v1/POST";
import parent__admin__run_schema_coach_profile_v4__post from "./api/parent/admin/run-schema-coach-profile-v4/POST";
import parent__admin__run_schema_fan_profile__post from "./api/parent/admin/run-schema-fan-profile/POST";
import parent__admin__run_schema_foundation__post from "./api/parent/admin/run-schema-foundation/POST";
import parent__admin__run_schema_match_records__post from "./api/parent/admin/run-schema-match-records/POST";
import parent__admin__run_schema_player_media__post from "./api/parent/admin/run-schema-player-media/POST";
import parent__admin__run_schema_player_softdelete__post from "./api/parent/admin/run-schema-player-softdelete/POST";
import parent__admin__run_schema_private_uploads__post from "./api/parent/admin/run-schema-private-uploads/POST";
import parent__admin__run_schema_recruiting__post from "./api/parent/admin/run-schema-recruiting/POST";
import parent__admin__run_schema_recruiting_v2__post from "./api/parent/admin/run-schema-recruiting-v2/POST";
import parent__admin__run_schema_stats__post from "./api/parent/admin/run-schema-stats/POST";
import parent__admin__run_schema_uk_education__post from "./api/parent/admin/run-schema-uk-education/POST";
import parent__admin__run_schema_v2__post from "./api/parent/admin/run-schema-v2/POST";
import parent__admin__run_schema_v3__post from "./api/parent/admin/run-schema-v3/POST";
import parent__admin__run_schema_v4__post from "./api/parent/admin/run-schema-v4/POST";
import parent__admin__run_schema_v5__post from "./api/parent/admin/run-schema-v5/POST";
import parent__admin__run_schema_v6__post from "./api/parent/admin/run-schema-v6/POST";
import parent__admin__schema_status__get from "./api/parent/admin/schema-status/GET";
import parent__admin__seed_catalog_teams__post from "./api/parent/admin/seed-catalog-teams/POST";
import parent__admin__seed_competitions__post from "./api/parent/admin/seed-competitions/POST";
import parent__admin__seed_recruiting__post from "./api/parent/admin/seed-recruiting/POST";
import parent__admin__seed_sources__post from "./api/parent/admin/seed-sources/POST";
import parent__admin__seed_team_competitions__post from "./api/parent/admin/seed-team-competitions/POST";
import parent__admin__seed_team_sources__post from "./api/parent/admin/seed-team-sources/POST";
import parent__admin__seed_teams__post from "./api/parent/admin/seed-teams/POST";
import parent__admin__session_debug__get from "./api/parent/admin/session-debug/GET";
import parent__admin__youtube_cache__get from "./api/parent/admin/youtube-cache/GET";
import parent__admin__youtube_cache__force_fetch__post from "./api/parent/admin/youtube-cache/force-fetch/POST";
import parent__build_info__get from "./api/parent/build-info/GET";
import parent__calendar__get from "./api/parent/calendar/GET";
import parent__calendar__feeds__get from "./api/parent/calendar/feeds/GET";
import parent__calendar__feeds__post from "./api/parent/calendar/feeds/POST";
import parent__calendar__feeds__import__post from "./api/parent/calendar/feeds/import/POST";
import parent__calendar__feeds__import__preview__post from "./api/parent/calendar/feeds/import/preview/POST";
import parent__calendar__feeds__validate__post from "./api/parent/calendar/feeds/validate/POST";
import parent__calendar__feeds__feedId__delete from "./api/parent/calendar/feeds/[feedId]/DELETE";
import parent__calendar__feeds__feedId__patch from "./api/parent/calendar/feeds/[feedId]/PATCH";
import parent__calendar__feeds__feedId__preview__get from "./api/parent/calendar/feeds/[feedId]/preview/GET";
import parent__calendar__feeds__feedId__sync__post from "./api/parent/calendar/feeds/[feedId]/sync/POST";
import parent__clubs__get from "./api/parent/clubs/GET";
import parent__connections__get from "./api/parent/connections/GET";
import parent__connections__post from "./api/parent/connections/POST";
import parent__connections__connectionId__delete from "./api/parent/connections/[connectionId]/DELETE";
import parent__connections__connectionId__patch from "./api/parent/connections/[connectionId]/PATCH";
import parent__family__get from "./api/parent/family/GET";
import parent__feed__get from "./api/parent/feed/GET";
import parent__follows__get from "./api/parent/follows/GET";
import parent__follows__post from "./api/parent/follows/POST";
import parent__follows__followId__delete from "./api/parent/follows/[followId]/DELETE";
import parent__manual_events__get from "./api/parent/manual-events/GET";
import parent__manual_events__post from "./api/parent/manual-events/POST";
import parent__manual_events__eventId__delete from "./api/parent/manual-events/[eventId]/DELETE";
import parent__manual_events__eventId__put from "./api/parent/manual-events/[eventId]/PUT";
import parent__media__get from "./api/parent/media/GET";
import parent__media__upload__post from "./api/parent/media/upload/POST";
import parent__media__mediaId__delete from "./api/parent/media/[mediaId]/DELETE";
import parent__media__mediaId__patch from "./api/parent/media/[mediaId]/PATCH";
import parent__onboarding__put from "./api/parent/onboarding/PUT";
import parent__onboarding_draft__get from "./api/parent/onboarding-draft/GET";
import parent__onboarding_draft__put from "./api/parent/onboarding-draft/PUT";
import parent__pilot__assignment__delete from "./api/parent/pilot/assignment/DELETE";
import parent__pilot__assignment__get from "./api/parent/pilot/assignment/GET";
import parent__pilot__assignment__post from "./api/parent/pilot/assignment/POST";
import parent__pilot__fixtures__get from "./api/parent/pilot/fixtures/GET";
import parent__pilot__records__get from "./api/parent/pilot/records/GET";
import parent__pilot__records__post from "./api/parent/pilot/records/POST";
import parent__pilot__records__recordId__delete from "./api/parent/pilot/records/[recordId]/DELETE";
import parent__pilot__records__recordId__put from "./api/parent/pilot/records/[recordId]/PUT";
import parent__pilot__reset__post from "./api/parent/pilot/reset/POST";
import parent__pilot__teams__get from "./api/parent/pilot/teams/GET";
import parent__players__get from "./api/parent/players/GET";
import parent__players__post from "./api/parent/players/POST";
import parent__players__match_records_summary__get from "./api/parent/players/match-records-summary/GET";
import parent__players__playerId__delete from "./api/parent/players/[playerId]/DELETE";
import parent__players__playerId__get from "./api/parent/players/[playerId]/GET";
import parent__players__playerId__patch from "./api/parent/players/[playerId]/PATCH";
import parent__players__playerId__affiliations__get from "./api/parent/players/[playerId]/affiliations/GET";
import parent__players__playerId__affiliations__post from "./api/parent/players/[playerId]/affiliations/POST";
import parent__players__playerId__affiliations__affiliationId__delete from "./api/parent/players/[playerId]/affiliations/[affiliationId]/DELETE";
import parent__players__playerId__coach_fields__get from "./api/parent/players/[playerId]/coach-fields/GET";
import parent__players__playerId__coach_links__get from "./api/parent/players/[playerId]/coach-links/GET";
import parent__players__playerId__coach_links__post from "./api/parent/players/[playerId]/coach-links/POST";
import parent__players__playerId__coach_links__linkId__delete from "./api/parent/players/[playerId]/coach-links/[linkId]/DELETE";
import parent__players__playerId__coach_preview__get from "./api/parent/players/[playerId]/coach-preview/GET";
import parent__players__playerId__coach_requests__get from "./api/parent/players/[playerId]/coach-requests/GET";
import parent__players__playerId__collections__get from "./api/parent/players/[playerId]/collections/GET";
import parent__players__playerId__collections__post from "./api/parent/players/[playerId]/collections/POST";
import parent__players__playerId__collections__collectionId__delete from "./api/parent/players/[playerId]/collections/[collectionId]/DELETE";
import parent__players__playerId__collections__collectionId__items__delete from "./api/parent/players/[playerId]/collections/[collectionId]/items/DELETE";
import parent__players__playerId__collections__collectionId__items__post from "./api/parent/players/[playerId]/collections/[collectionId]/items/POST";
import parent__players__playerId__match_records__get from "./api/parent/players/[playerId]/match-records/GET";
import parent__players__playerId__match_records__post from "./api/parent/players/[playerId]/match-records/POST";
import parent__players__playerId__match_records__recordId__delete from "./api/parent/players/[playerId]/match-records/[recordId]/DELETE";
import parent__players__playerId__match_records__recordId__put from "./api/parent/players/[playerId]/match-records/[recordId]/PUT";
import parent__players__playerId__media_assignments__get from "./api/parent/players/[playerId]/media-assignments/GET";
import parent__players__playerId__media_assignments__post from "./api/parent/players/[playerId]/media-assignments/POST";
import parent__players__playerId__media_assignments__assignmentId__delete from "./api/parent/players/[playerId]/media-assignments/[assignmentId]/DELETE";
import parent__players__playerId__media_preview__assignmentId__get from "./api/parent/players/[playerId]/media-preview/[assignmentId]/GET";
import parent__players__playerId__media_ref_debug__get from "./api/parent/players/[playerId]/media-ref-debug/GET";
import parent__players__playerId__photo__post from "./api/parent/players/[playerId]/photo/POST";
import parent__players__playerId__restore__post from "./api/parent/players/[playerId]/restore/POST";
import parent__players__playerId__schedule__get from "./api/parent/players/[playerId]/schedule/GET";
import parent__players__playerId__schedule__games__post from "./api/parent/players/[playerId]/schedule/games/POST";
import parent__players__playerId__schedule__practices__post from "./api/parent/players/[playerId]/schedule/practices/POST";
import parent__posts__get from "./api/parent/posts/GET";
import parent__posts__post from "./api/parent/posts/POST";
import parent__posts__postId__delete from "./api/parent/posts/[postId]/DELETE";
import parent__posts__postId__put from "./api/parent/posts/[postId]/PUT";
import parent__profile__get from "./api/parent/profile/GET";
import parent__profile__put from "./api/parent/profile/PUT";
import parent__profile__cover__post from "./api/parent/profile/cover/POST";
import parent__recruiting__bulk_outreach__get from "./api/parent/recruiting/bulk-outreach/GET";
import parent__recruiting__bulk_outreach__post from "./api/parent/recruiting/bulk-outreach/POST";
import parent__recruiting__camps__get from "./api/parent/recruiting/camps/GET";
import parent__recruiting__coaches__get from "./api/parent/recruiting/coaches/GET";
import parent__recruiting__drafts__get from "./api/parent/recruiting/drafts/GET";
import parent__recruiting__drafts__post from "./api/parent/recruiting/drafts/POST";
import parent__recruiting__drafts__draftId__delete from "./api/parent/recruiting/drafts/[draftId]/DELETE";
import parent__recruiting__drafts__draftId__patch from "./api/parent/recruiting/drafts/[draftId]/PATCH";
import parent__recruiting__programs__get from "./api/parent/recruiting/programs/GET";
import parent__recruiting__saved__get from "./api/parent/recruiting/saved/GET";
import parent__recruiting__saved__post from "./api/parent/recruiting/saved/POST";
import parent__recruiting__saved__savedId__delete from "./api/parent/recruiting/saved/[savedId]/DELETE";
import parent__recruiting__showcases__get from "./api/parent/recruiting/showcases/GET";
import parent__settings__guardians__get from "./api/parent/settings/guardians/GET";
import parent__settings__guardians__post from "./api/parent/settings/guardians/POST";
import parent__settings__guardians__grantId__delete from "./api/parent/settings/guardians/[grantId]/DELETE";
import parent__settings__notifications__get from "./api/parent/settings/notifications/GET";
import parent__settings__notifications__put from "./api/parent/settings/notifications/PUT";
import parent__setup__post from "./api/parent/setup/POST";
import parent__team_chat__get from "./api/parent/team-chat/GET";
import parent__tryout_prefs__get from "./api/parent/tryout-prefs/GET";
import parent__tryout_prefs__put from "./api/parent/tryout-prefs/PUT";
import parent__upcoming_events__get from "./api/parent/upcoming-events/GET";
import parent__uploads__media__mediaId__get from "./api/parent/uploads/media/[mediaId]/GET";
import parent__uploads__player_photo__playerId__get from "./api/parent/uploads/player-photo/[playerId]/GET";
import pro_sources__get from "./api/pro-sources/GET";
import scores__leagues__get_85ab from "./api/scores/leagues/GET";
import scores__matches__get_db86 from "./api/scores/matches/GET";
import tryouts__get from "./api/tryouts/GET";
import tryouts__run_scraper__post from "./api/tryouts/run-scraper/POST";
import tryouts__scraper_status__get from "./api/tryouts/scraper-status/GET";
import tryouts_db__get from "./api/tryouts-db/GET";
import tryouts_db__post from "./api/tryouts-db/POST";
// </api-imports>
import { seoRoutes } from "../lib/seo-routes";
import { startScraperScheduler } from "./tryout-scraper-job";
import { startCalendarRefreshScheduler } from "./calendar-refresh-job";
import { startHighlightsRefreshScheduler } from "./highlights-refresh-job";
import {
	loadAdSenseRuntimeConfig,
} from "./adsense-manifest";
import { loadIndexNowKey } from "./indexnow-key";
import { isSystemHost } from "./seo-host";
import { llmsTxtHandler } from "./llms-txt";

import { registerAdSenseTextRoutes, renderSsrDocument, type SsrRenderResult } from "./ssr-document";
export { registerAdSenseTextRoutes, renderSsrDocument } from "./ssr-document";
export type { SsrRenderResult } from "./ssr-document";

function normalizeCommerceApiBaseUrlEnv() {
	if (process.env.GODADDY_API_BASE_URL) return;
	const hostOnly = process.env.VITE_GODADDY_API_HOST;
	if (!hostOnly) return;
	const normalizedHost = hostOnly.replace(/^https?:\/\//, "").trim();
	if (!normalizedHost) return;
	process.env.GODADDY_API_BASE_URL = `https://${normalizedHost}`;
}

normalizeCommerceApiBaseUrlEnv();

const app = express();

// Honour x-forwarded-* from the load balancer so req.protocol/req.hostname
// reflect the public-facing values. Express-maintained parsing respects the
// existing trust-proxy config; direct header reads would let a client spoof
// the sitemap origin in robots.txt.
app.set("trust proxy", true);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// <api-registrations>
app.get("/api/admin/content", admin__content__get);
app.patch("/api/admin/content", admin__content__patch);
app.post("/api/admin/content/import", admin__content__import__post);
app.post("/api/admin/enrich-dev-videos", admin__enrich_dev_videos__post);
app.post("/api/admin/import-fitness-videos", admin__import_fitness_videos__post);
app.get("/api/admin/import-log", admin__import_log__get);
app.post("/api/admin/refresh-dev-playlists", admin__refresh_dev_playlists__post);
app.post("/api/admin/seed-dev-videos", admin__seed_dev_videos__post);
app.get("/api/auth/:action", auth__action__get);
app.post("/api/auth/:action", auth__action__post);
app.get("/api/auth/:action/:detail", auth__action__detail__get);
app.post("/api/auth/:action/:detail", auth__action__detail__post);
app.get("/api/build-info", build_info__get);
app.get("/api/calendar/connections", calendar__connections__get);
app.get("/api/calendar/events", calendar__events__get);
app.get("/api/calendar/google/auth", calendar__google__auth__get);
app.get("/api/calendar/google/callback", calendar__google__callback__get);
app.post("/api/calendar/google/disconnect", calendar__google__disconnect__post);
app.get("/api/calendar/outlook/auth", calendar__outlook__auth__get);
app.get("/api/calendar/outlook/callback", calendar__outlook__callback__get);
app.post("/api/calendar/outlook/disconnect", calendar__outlook__disconnect__post);
app.get("/api/calendar/playmetrics/auth", calendar__playmetrics__auth__get);
app.get("/api/calendar/playmetrics/callback", calendar__playmetrics__callback__get);
app.post("/api/calendar/playmetrics/disconnect", calendar__playmetrics__disconnect__post);
app.get("/api/calendar/status", calendar__status__get);
app.get("/api/calendar/teamsnap/auth", calendar__teamsnap__auth__get);
app.get("/api/calendar/teamsnap/callback", calendar__teamsnap__callback__get);
app.post("/api/calendar/teamsnap/disconnect", calendar__teamsnap__disconnect__post);
app.get("/api/catalog/teams", catalog__teams__get);
app.get("/api/coach/media/:token/:assignmentId", coach__media__token__assignmentId__get);
app.get("/api/coach/photo/:token/:playerId", coach__photo__token__playerId__get);
app.get("/api/coach/profile/:token", coach__profile__token__get);
app.post("/api/coach/profile/:token/requests", coach__profile__token__requests__post);
app.post("/api/contact/:formName", contact__formName__post);
app.get("/api/fanzone/content", fanzone__content__get);
app.get("/api/health", health__get);
app.get("/api/highlights", highlights__get);
app.get("/api/highlights/all", highlights__all__get);
app.get("/api/highlights/leagues", highlights__leagues__get);
app.post("/api/highlights/refresh", highlights__refresh__post);
app.delete("/api/my-soccer/account", my_soccer__account__delete);
app.post("/api/my-soccer/account/password", my_soccer__account__password__post);
app.get("/api/my-soccer/club-feed", my_soccer__club_feed__get);
app.get("/api/my-soccer/content", my_soccer__content__get);
app.get("/api/my-soccer/events", my_soccer__events__get);
app.post("/api/my-soccer/feed-prefs", my_soccer__feed_prefs__post);
app.get("/api/my-soccer/feeds", my_soccer__feeds__get);
app.post("/api/my-soccer/feeds", my_soccer__feeds__post);
app.get("/api/my-soccer/feeds/ambiguous", my_soccer__feeds__ambiguous__get);
app.post("/api/my-soccer/feeds/assign-portal", my_soccer__feeds__assign_portal__post);
app.delete("/api/my-soccer/feeds/:feedId", my_soccer__feeds__feedId__delete);
app.get("/api/my-soccer/following", my_soccer__following__get);
app.post("/api/my-soccer/following", my_soccer__following__post);
app.get("/api/my-soccer/itunes-search", my_soccer__itunes_search__get);
app.get("/api/my-soccer/league-club-feed", my_soccer__league_club_feed__get);
app.get("/api/my-soccer/league-clubs", my_soccer__league_clubs__get);
app.get("/api/my-soccer/me", my_soccer__me__get);
app.post("/api/my-soccer/media/upload", my_soccer__media__upload__post);
app.get("/api/my-soccer/media-sources", my_soccer__media_sources__get);
app.get("/api/my-soccer/news-feed", my_soccer__news_feed__get);
app.get("/api/my-soccer/personal-events", my_soccer__personal_events__get);
app.post("/api/my-soccer/personal-events", my_soccer__personal_events__post);
app.delete("/api/my-soccer/personal-events/:eventId", my_soccer__personal_events__eventId__delete);
app.put("/api/my-soccer/personal-events/:eventId", my_soccer__personal_events__eventId__put);
app.get("/api/my-soccer/pl-clubs", my_soccer__pl_clubs__get);
app.get("/api/my-soccer/player-profiles", my_soccer__player_profiles__get);
app.post("/api/my-soccer/player-profiles", my_soccer__player_profiles__post);
app.delete("/api/my-soccer/player-profiles/:profileId", my_soccer__player_profiles__profileId__delete);
app.patch("/api/my-soccer/player-profiles/:profileId", my_soccer__player_profiles__profileId__patch);
app.post("/api/my-soccer/podcast-import", my_soccer__podcast_import__post);
app.post("/api/my-soccer/portal-preference", my_soccer__portal_preference__post);
app.get("/api/my-soccer/profile", my_soccer__profile__get);
app.post("/api/my-soccer/profile", my_soccer__profile__post);
app.get("/api/my-soccer/publisher-feed", my_soccer__publisher_feed__get);
app.get("/api/my-soccer/recommendations", my_soccer__recommendations__get);
app.post("/api/my-soccer/refresh", my_soccer__refresh__post);
app.get("/api/my-soccer/reminders", my_soccer__reminders__get);
app.post("/api/my-soccer/reminders", my_soccer__reminders__post);
app.delete("/api/my-soccer/reminders/:reminderId", my_soccer__reminders__reminderId__delete);
app.get("/api/my-soccer/rss-feed", my_soccer__rss_feed__get);
app.post("/api/my-soccer/run-schema-fan-profile", my_soccer__run_schema_fan_profile__post);
app.get("/api/my-soccer/saved", my_soccer__saved__get);
app.post("/api/my-soccer/saved", my_soccer__saved__post);
app.delete("/api/my-soccer/saved/:contentId", my_soccer__saved__contentId__delete);
app.get("/api/my-soccer/saved-tryouts", my_soccer__saved_tryouts__get);
app.post("/api/my-soccer/saved-tryouts", my_soccer__saved_tryouts__post);
app.delete("/api/my-soccer/saved-tryouts/:tryoutId", my_soccer__saved_tryouts__tryoutId__delete);
app.get("/api/my-soccer/saved-tryouts-resolved", my_soccer__saved_tryouts_resolved__get);
app.get("/api/my-soccer/tryouts", my_soccer__tryouts__get);
app.get("/api/my-soccer/unified-feed", my_soccer__unified_feed__get);
app.get("/api/parent/admin/check-schema-recruiting", parent__admin__check_schema_recruiting__get);
app.get("/api/parent/admin/coach-config-debug", parent__admin__coach_config_debug__get);
app.get("/api/parent/admin/db-tables", parent__admin__db_tables__get);
app.post("/api/parent/admin/debug-rss", parent__admin__debug_rss__post);
app.post("/api/parent/admin/grant-self-admin", parent__admin__grant_self_admin__post);
app.get("/api/parent/admin/migrate-check", parent__admin__migrate_check__get);
app.post("/api/parent/admin/migrate-to-private", parent__admin__migrate_to_private__post);
app.post("/api/parent/admin/policy-test", parent__admin__policy_test__post);
app.post("/api/parent/admin/purge-unverified-coaches", parent__admin__purge_unverified_coaches__post);
app.post("/api/parent/admin/recruiting-refresh", parent__admin__recruiting_refresh__post);
app.get("/api/parent/admin/recruiting-refresh-status", parent__admin__recruiting_refresh_status__get);
app.post("/api/parent/admin/run-schema-coach-profile-v1", parent__admin__run_schema_coach_profile_v1__post);
app.post("/api/parent/admin/run-schema-coach-profile-v4", parent__admin__run_schema_coach_profile_v4__post);
app.post("/api/parent/admin/run-schema-fan-profile", parent__admin__run_schema_fan_profile__post);
app.post("/api/parent/admin/run-schema-foundation", parent__admin__run_schema_foundation__post);
app.post("/api/parent/admin/run-schema-match-records", parent__admin__run_schema_match_records__post);
app.post("/api/parent/admin/run-schema-player-media", parent__admin__run_schema_player_media__post);
app.post("/api/parent/admin/run-schema-player-softdelete", parent__admin__run_schema_player_softdelete__post);
app.post("/api/parent/admin/run-schema-private-uploads", parent__admin__run_schema_private_uploads__post);
app.post("/api/parent/admin/run-schema-recruiting", parent__admin__run_schema_recruiting__post);
app.post("/api/parent/admin/run-schema-recruiting-v2", parent__admin__run_schema_recruiting_v2__post);
app.post("/api/parent/admin/run-schema-stats", parent__admin__run_schema_stats__post);
app.post("/api/parent/admin/run-schema-uk-education", parent__admin__run_schema_uk_education__post);
app.post("/api/parent/admin/run-schema-v2", parent__admin__run_schema_v2__post);
app.post("/api/parent/admin/run-schema-v3", parent__admin__run_schema_v3__post);
app.post("/api/parent/admin/run-schema-v4", parent__admin__run_schema_v4__post);
app.post("/api/parent/admin/run-schema-v5", parent__admin__run_schema_v5__post);
app.post("/api/parent/admin/run-schema-v6", parent__admin__run_schema_v6__post);
app.get("/api/parent/admin/schema-status", parent__admin__schema_status__get);
app.post("/api/parent/admin/seed-catalog-teams", parent__admin__seed_catalog_teams__post);
app.post("/api/parent/admin/seed-competitions", parent__admin__seed_competitions__post);
app.post("/api/parent/admin/seed-recruiting", parent__admin__seed_recruiting__post);
app.post("/api/parent/admin/seed-sources", parent__admin__seed_sources__post);
app.post("/api/parent/admin/seed-team-competitions", parent__admin__seed_team_competitions__post);
app.post("/api/parent/admin/seed-team-sources", parent__admin__seed_team_sources__post);
app.post("/api/parent/admin/seed-teams", parent__admin__seed_teams__post);
app.get("/api/parent/admin/session-debug", parent__admin__session_debug__get);
app.get("/api/parent/admin/youtube-cache", parent__admin__youtube_cache__get);
app.post("/api/parent/admin/youtube-cache/force-fetch", parent__admin__youtube_cache__force_fetch__post);
app.get("/api/parent/build-info", parent__build_info__get);
app.get("/api/parent/calendar", parent__calendar__get);
app.get("/api/parent/calendar/feeds", parent__calendar__feeds__get);
app.post("/api/parent/calendar/feeds", parent__calendar__feeds__post);
app.post("/api/parent/calendar/feeds/import", parent__calendar__feeds__import__post);
app.post("/api/parent/calendar/feeds/import/preview", parent__calendar__feeds__import__preview__post);
app.post("/api/parent/calendar/feeds/validate", parent__calendar__feeds__validate__post);
app.delete("/api/parent/calendar/feeds/:feedId", parent__calendar__feeds__feedId__delete);
app.patch("/api/parent/calendar/feeds/:feedId", parent__calendar__feeds__feedId__patch);
app.get("/api/parent/calendar/feeds/:feedId/preview", parent__calendar__feeds__feedId__preview__get);
app.post("/api/parent/calendar/feeds/:feedId/sync", parent__calendar__feeds__feedId__sync__post);
app.get("/api/parent/clubs", parent__clubs__get);
app.get("/api/parent/connections", parent__connections__get);
app.post("/api/parent/connections", parent__connections__post);
app.delete("/api/parent/connections/:connectionId", parent__connections__connectionId__delete);
app.patch("/api/parent/connections/:connectionId", parent__connections__connectionId__patch);
app.get("/api/parent/family", parent__family__get);
app.get("/api/parent/feed", parent__feed__get);
app.get("/api/parent/follows", parent__follows__get);
app.post("/api/parent/follows", parent__follows__post);
app.delete("/api/parent/follows/:followId", parent__follows__followId__delete);
app.get("/api/parent/manual-events", parent__manual_events__get);
app.post("/api/parent/manual-events", parent__manual_events__post);
app.delete("/api/parent/manual-events/:eventId", parent__manual_events__eventId__delete);
app.put("/api/parent/manual-events/:eventId", parent__manual_events__eventId__put);
app.get("/api/parent/media", parent__media__get);
app.post("/api/parent/media/upload", parent__media__upload__post);
app.delete("/api/parent/media/:mediaId", parent__media__mediaId__delete);
app.patch("/api/parent/media/:mediaId", parent__media__mediaId__patch);
app.put("/api/parent/onboarding", parent__onboarding__put);
app.get("/api/parent/onboarding-draft", parent__onboarding_draft__get);
app.put("/api/parent/onboarding-draft", parent__onboarding_draft__put);
app.delete("/api/parent/pilot/assignment", parent__pilot__assignment__delete);
app.get("/api/parent/pilot/assignment", parent__pilot__assignment__get);
app.post("/api/parent/pilot/assignment", parent__pilot__assignment__post);
app.get("/api/parent/pilot/fixtures", parent__pilot__fixtures__get);
app.get("/api/parent/pilot/records", parent__pilot__records__get);
app.post("/api/parent/pilot/records", parent__pilot__records__post);
app.delete("/api/parent/pilot/records/:recordId", parent__pilot__records__recordId__delete);
app.put("/api/parent/pilot/records/:recordId", parent__pilot__records__recordId__put);
app.post("/api/parent/pilot/reset", parent__pilot__reset__post);
app.get("/api/parent/pilot/teams", parent__pilot__teams__get);
app.get("/api/parent/players", parent__players__get);
app.post("/api/parent/players", parent__players__post);
app.get("/api/parent/players/match-records-summary", parent__players__match_records_summary__get);
app.delete("/api/parent/players/:playerId", parent__players__playerId__delete);
app.get("/api/parent/players/:playerId", parent__players__playerId__get);
app.patch("/api/parent/players/:playerId", parent__players__playerId__patch);
app.get("/api/parent/players/:playerId/affiliations", parent__players__playerId__affiliations__get);
app.post("/api/parent/players/:playerId/affiliations", parent__players__playerId__affiliations__post);
app.delete("/api/parent/players/:playerId/affiliations/:affiliationId", parent__players__playerId__affiliations__affiliationId__delete);
app.get("/api/parent/players/:playerId/coach-fields", parent__players__playerId__coach_fields__get);
app.get("/api/parent/players/:playerId/coach-links", parent__players__playerId__coach_links__get);
app.post("/api/parent/players/:playerId/coach-links", parent__players__playerId__coach_links__post);
app.delete("/api/parent/players/:playerId/coach-links/:linkId", parent__players__playerId__coach_links__linkId__delete);
app.get("/api/parent/players/:playerId/coach-preview", parent__players__playerId__coach_preview__get);
app.get("/api/parent/players/:playerId/coach-requests", parent__players__playerId__coach_requests__get);
app.get("/api/parent/players/:playerId/collections", parent__players__playerId__collections__get);
app.post("/api/parent/players/:playerId/collections", parent__players__playerId__collections__post);
app.delete("/api/parent/players/:playerId/collections/:collectionId", parent__players__playerId__collections__collectionId__delete);
app.delete("/api/parent/players/:playerId/collections/:collectionId/items", parent__players__playerId__collections__collectionId__items__delete);
app.post("/api/parent/players/:playerId/collections/:collectionId/items", parent__players__playerId__collections__collectionId__items__post);
app.get("/api/parent/players/:playerId/match-records", parent__players__playerId__match_records__get);
app.post("/api/parent/players/:playerId/match-records", parent__players__playerId__match_records__post);
app.delete("/api/parent/players/:playerId/match-records/:recordId", parent__players__playerId__match_records__recordId__delete);
app.put("/api/parent/players/:playerId/match-records/:recordId", parent__players__playerId__match_records__recordId__put);
app.get("/api/parent/players/:playerId/media-assignments", parent__players__playerId__media_assignments__get);
app.post("/api/parent/players/:playerId/media-assignments", parent__players__playerId__media_assignments__post);
app.delete("/api/parent/players/:playerId/media-assignments/:assignmentId", parent__players__playerId__media_assignments__assignmentId__delete);
app.get("/api/parent/players/:playerId/media-preview/:assignmentId", parent__players__playerId__media_preview__assignmentId__get);
app.get("/api/parent/players/:playerId/media-ref-debug", parent__players__playerId__media_ref_debug__get);
app.post("/api/parent/players/:playerId/photo", parent__players__playerId__photo__post);
app.post("/api/parent/players/:playerId/restore", parent__players__playerId__restore__post);
app.get("/api/parent/players/:playerId/schedule", parent__players__playerId__schedule__get);
app.post("/api/parent/players/:playerId/schedule/games", parent__players__playerId__schedule__games__post);
app.post("/api/parent/players/:playerId/schedule/practices", parent__players__playerId__schedule__practices__post);
app.get("/api/parent/posts", parent__posts__get);
app.post("/api/parent/posts", parent__posts__post);
app.delete("/api/parent/posts/:postId", parent__posts__postId__delete);
app.put("/api/parent/posts/:postId", parent__posts__postId__put);
app.get("/api/parent/profile", parent__profile__get);
app.put("/api/parent/profile", parent__profile__put);
app.post("/api/parent/profile/cover", parent__profile__cover__post);
app.get("/api/parent/recruiting/bulk-outreach", parent__recruiting__bulk_outreach__get);
app.post("/api/parent/recruiting/bulk-outreach", parent__recruiting__bulk_outreach__post);
app.get("/api/parent/recruiting/camps", parent__recruiting__camps__get);
app.get("/api/parent/recruiting/coaches", parent__recruiting__coaches__get);
app.get("/api/parent/recruiting/drafts", parent__recruiting__drafts__get);
app.post("/api/parent/recruiting/drafts", parent__recruiting__drafts__post);
app.delete("/api/parent/recruiting/drafts/:draftId", parent__recruiting__drafts__draftId__delete);
app.patch("/api/parent/recruiting/drafts/:draftId", parent__recruiting__drafts__draftId__patch);
app.get("/api/parent/recruiting/programs", parent__recruiting__programs__get);
app.get("/api/parent/recruiting/saved", parent__recruiting__saved__get);
app.post("/api/parent/recruiting/saved", parent__recruiting__saved__post);
app.delete("/api/parent/recruiting/saved/:savedId", parent__recruiting__saved__savedId__delete);
app.get("/api/parent/recruiting/showcases", parent__recruiting__showcases__get);
app.get("/api/parent/settings/guardians", parent__settings__guardians__get);
app.post("/api/parent/settings/guardians", parent__settings__guardians__post);
app.delete("/api/parent/settings/guardians/:grantId", parent__settings__guardians__grantId__delete);
app.get("/api/parent/settings/notifications", parent__settings__notifications__get);
app.put("/api/parent/settings/notifications", parent__settings__notifications__put);
app.post("/api/parent/setup", parent__setup__post);
app.get("/api/parent/team-chat", parent__team_chat__get);
app.get("/api/parent/tryout-prefs", parent__tryout_prefs__get);
app.put("/api/parent/tryout-prefs", parent__tryout_prefs__put);
app.get("/api/parent/upcoming-events", parent__upcoming_events__get);
app.get("/api/parent/uploads/media/:mediaId", parent__uploads__media__mediaId__get);
app.get("/api/parent/uploads/player-photo/:playerId", parent__uploads__player_photo__playerId__get);
app.get("/api/pro-sources", pro_sources__get);
app.get("/api/scores/leagues", scores__leagues__get_85ab);
app.get("/api/scores/matches", scores__matches__get_db86);
app.get("/api/tryouts", tryouts__get);
app.post("/api/tryouts/run-scraper", tryouts__run_scraper__post);
app.get("/api/tryouts/scraper-status", tryouts__scraper_status__get);
app.get("/api/tryouts-db", tryouts_db__get);
app.post("/api/tryouts-db", tryouts_db__post);
// </api-registrations>

// Error middleware must be registered AFTER the routes it protects; Express
// only passes errors to middleware defined later in the stack.
app.use("/api", (err: unknown, req: Request, res: Response, _next: NextFunction) => {
	// Always respond JSON on /api so clients parsing response.json() don't
	// receive Express's default HTML error page for non-Error throws.
	// redactCoachToken strips the bearer token from /coach/profile/:token URLs
	// so raw tokens never appear in crash logs.
	console.error("ssr.api.error", {
		url: redactCoachToken(req.url),
		error: err instanceof Error ? err.stack : String(err),
	});
	res.status(500).json({ error: "Internal server error" });
});

function baseUrl(req: Request): string {
	return `${req.protocol}://${req.hostname}`;
}

function escapeXml(s: string): string {
	return s.replace(/[&<>"']/g, (c) =>
		({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
	);
}

app.get("/robots.txt", (req, res) => {
	if (isSystemHost(req)) {
		res
			.type("text/plain")
			.set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host")
			.send("User-agent: *\nDisallow: /\n");
		return;
	}
	const base = baseUrl(req);
	const body = [
		"User-agent: *",
		"Allow: /",
		"",
		`Sitemap: ${base}/sitemap.xml`,
		"",
	].join("\n");
	res.type("text/plain").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(body);
});

app.get("/sitemap.xml", (req, res) => {
	if (isSystemHost(req)) {
		const empty = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>\n`;
		res.type("application/xml").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(empty);
		return;
	}
	const base = baseUrl(req);
	const urls = seoRoutes
		.filter((r) => typeof r.path === "string" && r.path.startsWith("/"))
		.map((r) => {
			const loc = `${base}${r.path}`;
			const parts = [`    <loc>${escapeXml(loc)}</loc>`];
			if (r.lastmod) parts.push(`    <lastmod>${escapeXml(r.lastmod)}</lastmod>`);
			if (r.changefreq) parts.push(`    <changefreq>${r.changefreq}</changefreq>`);
			if (r.priority !== undefined)
				parts.push(`    <priority>${r.priority.toFixed(1)}</priority>`);
			return `  <url>\n${parts.join("\n")}\n  </url>`;
		})
		.join("\n");
	const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
	res.type("application/xml").set("Cache-Control", "public, max-age=60, must-revalidate").set("Vary", "Host").send(body);
});

app.get("/llms.txt", llmsTxtHandler);

if (import.meta.env.PROD) {
	const __dirname = dirname(fileURLToPath(import.meta.url));
	const clientDir = join(__dirname, "client");
	const adSenseRuntimeConfig = loadAdSenseRuntimeConfig(__dirname);
	const indexNowKey = loadIndexNowKey(__dirname);

	registerAdSenseTextRoutes(app, adSenseRuntimeConfig);

	if (indexNowKey !== null) {
		app.get(`/${indexNowKey}.txt`, (_req, res) => {
			res.type("text/plain").set("Cache-Control", "public, max-age=86400").send(indexNowKey);
		});
	}

	// Explicit routes for Locked In static pages — serve before the SSR catch-all
	// so that extensionless and trailing-slash variants don't fall through to React.
	for (const pattern of [
		'/locked-in',
		'/locked-in/',
		'/locked-in/index.html',
		'/locked-in/connected',
		'/locked-in/connected/',
		'/locked-in/connected/index.html',
	]) {
		const file = pattern.includes('connected')
			? join(clientDir, 'locked-in', 'connected', 'index.html')
			: join(clientDir, 'locked-in', 'index.html');
		app.get(pattern, (_req: Request, res: Response) => {
			res.set('Cache-Control', 'no-cache').sendFile(file);
		});
	}

	app.use(
		express.static(clientDir, {
			index: false,
			setHeaders(res, filePath) {
				res.set(
					"Cache-Control",
					filePath.includes("/assets/")
						? "public, max-age=31536000, immutable"
						: "no-cache",
				);
			},
		}),
	);

	app.use((_req, res, next) => {
		res.set("Cache-Control", "no-cache");
		next();
	});

	let template: string;
	try {
		template = readFileSync(join(clientDir, "index.html"), "utf-8");
	} catch (err) {
		console.error("ssr.template.load-failed", {
			path: join(clientDir, "index.html"),
			error: err instanceof Error ? err.message : String(err),
		});
		process.exit(1);
	}
	if (!template.includes("<!--app-head-->") || !template.includes("<!--app-html-->")) {
		// Fail fast at boot, same as a template load failure above: without
		// markers, every .replace() call on the render path is a no-op and we
		// would serve a shell with no <head> content and no rendered body on
		// every request. Preferring process.exit over a degraded mode ensures
		// an operator notices and fixes the build rather than serving broken
		// SEO-invisible pages indefinitely.
		console.error("ssr.template.markers-missing", {
			hasHead: template.includes("<!--app-head-->"),
			hasHtml: template.includes("<!--app-html-->"),
		});
		process.exit(1);
	}
	const fallbackShell = template
		.replace("<!--app-head-->", "")
		.replace("<!--app-html-->", "");

	// Resolve the SSR module once into a stable render function. A failed
	// load is unrecoverable at runtime - exiting lets the container
	// scheduler restart with a clean slate rather than leaving the server
	// to serve silent 503s indefinitely against a single startup log.
	let renderFn: ((url: string, siteOrigin?: string) => Promise<SsrRenderResult>) | null = null;
	const SSR_MODULE_LOAD_TIMEOUT_MS = 30_000;
	const loadTimeout = setTimeout(() => {
		if (renderFn !== null) return;
		console.error("ssr.module.load-timeout", {
			timeoutMs: SSR_MODULE_LOAD_TIMEOUT_MS,
		});
		process.exit(1);
	}, SSR_MODULE_LOAD_TIMEOUT_MS);
	loadTimeout.unref();
	import("../entry-server").then(
		(mod) => {
			clearTimeout(loadTimeout);
			renderFn = mod.render;
		},
		(err) => {
			clearTimeout(loadTimeout);
			console.error("ssr.module.load-failed", {
				error: err instanceof Error ? err.stack : String(err),
			});
			process.exit(1);
		},
	);

	// redactCoachToken is defined in src/server/lib/redact-coach-token.ts
	// and imported at the top of this file so the test suite can import
	// the real implementation rather than a copied function.

	app.get(/.*/, async (req, res, next) => {
		if (req.method !== "GET") return next();
		if (req.path.startsWith("/api")) return next();
		if (extname(req.path)) return next();
		const sendFallback = () => {
			// Coach profile pages: add Referrer-Policy so the token in the URL
			// cannot leak into Referer headers even on error/fallback responses.
			if (req.path.startsWith('/coach/profile/')) {
				res.set('Referrer-Policy', 'no-referrer');
			}
			res
				.status(503)
				.set("Content-Type", "text/html; charset=utf-8")
				.set("Cache-Control", "no-store")
				.send(fallbackShell);
		};
		if (renderFn === null) {
			// Module not yet resolved; fall back without logging to avoid startup
			// noise before the first render is even possible. A terminal load
			// failure (import reject or 30s timeout) process.exit(1)s from the
			// loader above, so this branch is only the brief warmup window.
			return sendFallback();
		}
		try {
			const result = await renderFn(
				req.url,
				`${req.protocol}://${req.hostname}`,
			);
			if (result.redirect) {
				// Redirect thrown from a loader/action surfaces as a Response.
				// Forward it so the browser actually navigates to the new URL
				// instead of seeing an empty shell with a stale status.
				res.redirect(result.status, result.redirect);
				return;
			}
			if (!result.html) {
				// A non-redirect Response was thrown from a loader (e.g.
				// `throw new Response(null, { status: 404 })`). renderToString
				// produced no markup, so we have a real status but no body.
				// Log so the case is observable in ops dashboards, and mark
				// no-store so CDNs don't cache an empty page as a valid hit.
				// User-visible 404 / error pages should come from a route
				// errorElement, not from this fallback path.
				console.error("ssr.render.error-response", {
					url: redactCoachToken(req.url),
					status: result.status,
				});
				if (req.path.startsWith('/coach/profile/')) {
					res.set('Referrer-Policy', 'no-referrer');
				}
				res
					.status(result.status)
					.set("Content-Type", "text/html; charset=utf-8")
					.set("Cache-Control", "no-store")
					.send(fallbackShell);
				return;
			}
			// Per-host SEO injection. System URLs get a noindex meta so
			// crawlers drop them from the index over time; customer-attached
			// hosts get a self-canonical link so search engines treat them
			// as authoritative for the rendered content.
			const seoHead = isSystemHost(req)
				? `<meta name="robots" content="noindex,nofollow">`
				: `<link rel="canonical" href="${escapeXml(`${req.protocol}://${req.hostname}${req.path}`)}">`;
			// Function replacements disable String.replace's $-special sequences
			// ($&, $', $`, $$) so user-authored titles / JSON-LD like
			// "Save $& today" insert literally instead of being interpolated.
			// Coach profile pages must not carry advertising or analytics scripts:
			// the page is shared with external parties (college coaches) and the
			// token in the URL must not be exposed to third-party ad networks.
			const pageAdSenseConfig = req.path.startsWith('/coach/profile/')
				? { scriptHtml: '' }
				: adSenseRuntimeConfig;
			const out = renderSsrDocument(
				template,
				{ ...result, head: seoHead + result.head },
				pageAdSenseConfig,
			);
			// Coach profile pages carry the bearer token in the URL.
			// Set no-store (not no-cache) and Referrer-Policy: no-referrer so the
			// token is never written to any cache and cannot leak into Referer
			// headers on outbound links from the rendered page.
			if (req.path.startsWith('/coach/profile/')) {
				res.set('Cache-Control', 'no-store');
				res.set('Referrer-Policy', 'no-referrer');
			}
			// Default Cache-Control for SSR pages. Coach profile pages already
			// set no-store above; this default applies to all other pages.
			if (!res.getHeader("Cache-Control")) {
				res.set("Cache-Control", "no-cache");
			}
			res
				.status(result.status)
				.set("Content-Type", "text/html; charset=utf-8")
				.send(out);
		} catch (err) {
			// 503 surfaces the failure in CDN/monitoring without caching a broken
			// page as success. console.error (not warn) puts it at the right log
			// level for the observability pipeline to alert on.
			console.error("ssr.render.failed", {
				url: redactCoachToken(req.url),
				// Log the full stack — React's renderToString annotates it with
				// the failing component's call tree, which the message alone
				// discards.
				error: err instanceof Error ? err.stack : String(err),
			});
			sendFallback();
		}
	});

	const shutdown = async (signal: string) => {
		console.log(`Got ${signal}, shutting down gracefully...`);
		// Scope the ERR_MODULE_NOT_FOUND suppression to the import() only.
		// A closeConnection() failure that happens to carry the same code
		// (unlikely but possible for wrapped errors) must not be silently
		// swallowed - it indicates a real db-close failure worth logging.
		let mod: { closeConnection?: () => Promise<void> | void } | null = null;
		try {
			const dbClient = "./db/client" + ".js";
			// Source-literal optional module path; no request, environment, or user input reaches import().
			// eslint-disable-next-line no-unsanitized/method
			mod = await import(/* @vite-ignore */ dbClient);
		} catch (error: unknown) {
			const code = (error as { code?: string } | null)?.code;
			if (code !== "ERR_MODULE_NOT_FOUND") {
				console.error("ssr.shutdown.db-import-failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		if (mod && typeof mod.closeConnection === "function") {
			try {
				await mod.closeConnection();
				console.log("Database connections closed");
			} catch (error: unknown) {
				console.error("ssr.shutdown.db-close-failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		process.exit(0);
	};

	(["SIGTERM", "SIGINT"] as const).forEach((signal) => {
		process.once(signal, () => {
			void shutdown(signal);
		});
	});

	const rawPort = process.env.PORT || "3000";

// ─── Startup migrations (idempotent schema changes) ───────────────────────────
async function runStartupMigrations() {
	// ── verification.value VARCHAR(255) → TEXT ─────────────────────────────────
	// BetterAuth stores OAuth PKCE state (codeVerifier + callbackURL + oauthState)
	// as a JSON blob in verification.value. The original VARCHAR(255) overflows
	// when callbackURL is longer than ~40 chars, causing ER_DATA_TOO_LONG (1406)
	// and a silent 500 on /api/auth/sign-in/social. TEXT supports 65,535 chars.
	// We probe the column type first so this is idempotent across restarts.
	try {
		const colResult = await db.execute(sql.raw(
			"SHOW COLUMNS FROM `verification` LIKE 'value'"
		)) as unknown;
		const [colRows] = colResult as [Array<{ Type?: string; type?: string }>, unknown];
		const colType = (colRows[0]?.Type ?? colRows[0]?.type ?? '').toLowerCase();
		if (colType && !colType.startsWith('text') && !colType.startsWith('mediumtext') && !colType.startsWith('longtext')) {
			await db.execute(sql.raw(
				"ALTER TABLE `verification` MODIFY COLUMN `value` TEXT NOT NULL"
			));
			console.log("startup.migration: verification.value widened to TEXT (was " + colType + ")");
		}
	} catch (e) {
		// Table may not exist yet on a fresh install — not fatal
		console.warn("startup.migration: verification.value probe/alter skipped:", e instanceof Error ? e.message : String(e));
	}

	try {
		await db.execute(sql`ALTER TABLE sc_dev_content ADD COLUMN dev_category varchar(32)`);
		console.log("startup.migration: added dev_category column");
	} catch {
		// Column already exists — expected on subsequent starts
	}

	// Create sc_dev_playlists table if it doesn't exist
	try {
		await db.execute(sql`
			CREATE TABLE IF NOT EXISTS sc_dev_playlists (
				playlist_id varchar(64) PRIMARY KEY,
				dev_category varchar(32) NOT NULL,
				label varchar(128),
				last_imported_at timestamp NULL,
				last_import_count int DEFAULT 0,
				enabled boolean DEFAULT true,
				created_at timestamp DEFAULT CURRENT_TIMESTAMP
			)
		`);
	} catch {
		// Table already exists
	}

	// ── Curated dev videos ────────────────────────────────────────────────────
	// Upsert by content_id (dev-yt-<videoId>). Title/source are only overwritten
	// when the stored value is still a generic placeholder — real YouTube titles
	// fetched by /api/admin/enrich-dev-videos are preserved across restarts.
	// editorial_priority controls display order within each category.
	const VIDEOS = [
		// Defending
		{ videoId: '4vBZzkVRqbE', title: '5 DEFENSE Tips that Stop Forwards',                   source: 'AllAttack',                description: 'Practical tips for defending against attacking players.',                                   devCategory: 'defending',   priority: 1 },
		{ videoId: 'sxSWLpDv770', title: 'Defending',                                            source: '',                         description: 'Defending technique and training.',                                                    devCategory: 'defending',   priority: 2 },
		{ videoId: 'k9Xhdv_IyN4', title: 'Defending',                                            source: '',                         description: 'Defending technique and training.',                                                    devCategory: 'defending',   priority: 3 },
		{ videoId: 'jtv_fdLrYZ0', title: 'Defending',                                            source: '',                         description: 'Defending technique and training.',                                                    devCategory: 'defending',   priority: 4 },
		{ videoId: 'ay42qx4NSZY', title: 'Defending',                                            source: '',                         description: 'Defending technique and training.',                                                    devCategory: 'defending',   priority: 5 },
		// Attacking
		{ videoId: 'dLVqO2RgP3A', title: 'Improve Your Finishing With Both Feet',                source: '7mlc',                     description: 'Finishing practice to develop confidence with both feet.',                            devCategory: 'attacking',   priority: 1 },
		{ videoId: 'e5RxAJM-oxc', title: '10 EASY Ball Mastery Exercises For Beginners',         source: '7mlc',                     description: 'Ball-control exercises for developing close control and dribbling.',                  devCategory: 'attacking',   priority: 2 },
		{ videoId: 'qmaQSEJaz6I', title: 'Attacking',                                            source: '',                         description: 'Attacking technique and finishing.',                                                   devCategory: 'attacking',   priority: 3 },
		{ videoId: 'x_H_Q-tJVS8', title: 'Attacking',                                            source: '',                         description: 'Attacking movement and combination play.',                                            devCategory: 'attacking',   priority: 4 },
		{ videoId: 'vwk53EIM5AM', title: 'Attacking',                                            source: '',                         description: 'Attacking drills and goal-scoring skills.',                                           devCategory: 'attacking',   priority: 5 },
		{ videoId: 'hCgt6-ag7VA', title: 'Attacking',                                            source: '',                         description: 'Attacking positioning and runs.',                                                      devCategory: 'attacking',   priority: 6 },
		{ videoId: 'iN5YxaM1PpM', title: 'Attacking',                                            source: '',                         description: 'Attacking skills and 1v1 techniques.',                                                devCategory: 'attacking',   priority: 7 },
		{ videoId: 'Zdg232Eoqfw', title: 'Attacking',                                            source: '',                         description: 'Attacking combinations and finishing exercises.',                                      devCategory: 'attacking',   priority: 8 },
		{ videoId: 'r-xNitT6VTY', title: 'Attacking',                                            source: '',                         description: 'Attacking play and forward movement.',                                                devCategory: 'attacking',   priority: 9 },
		// Midfield
		{ videoId: 'Y9Af7MwsSvc', title: 'How to Play Midfield in Soccer/Football',              source: 'AllAttack',                description: 'An introduction to playing effectively in midfield.',                                devCategory: 'midfield',    priority: 1 },
		{ videoId: 'ud84rp3Vphs', title: '10 Exercises To Master Your First Touch',              source: '7mlc',                     description: 'First-touch exercises for controlling the ball and preparing your next action.',      devCategory: 'midfield',    priority: 2 },
		{ videoId: '4Y_64ANmC9c', title: 'Midfield',                                             source: '',                         description: 'Midfield training and technique.',                                                    devCategory: 'midfield',    priority: 3 },
		{ videoId: 'dV0OCVPAFmA', title: 'Midfield',                                             source: '',                         description: 'Midfield training and technique.',                                                    devCategory: 'midfield',    priority: 4 },
		{ videoId: 'KcSVEInRAGs', title: 'Midfield',                                             source: '',                         description: 'Midfield training and technique.',                                                    devCategory: 'midfield',    priority: 5 },
		{ videoId: '-_E_0weZhls', title: 'Midfield',                                             source: '',                         description: 'Midfield training and technique.',                                                    devCategory: 'midfield',    priority: 6 },
		{ videoId: 'bhSlFjBWlzc', title: 'Midfield',                                             source: '',                         description: 'Midfield training and technique.',                                                    devCategory: 'midfield',    priority: 7 },
		{ videoId: '2UpKcNuSSO0', title: 'Midfield',                                             source: '',                         description: 'Midfield training and technique.',                                                    devCategory: 'midfield',    priority: 8 },
		{ videoId: '-UY2lPNeWI8', title: 'Midfield',                                             source: '',                         description: 'Midfield training and technique.',                                                    devCategory: 'midfield',    priority: 9 },
		// Goalkeeping
		{ videoId: 'lQQUrbATlhI', title: '3 pro goalkeeper drills to improve your technique and handling', source: 'Unisport',       description: 'Player-focused exercises for goalkeeper technique and ball handling.',               devCategory: 'goalkeeping', priority: 1 },
		{ videoId: 'O_SqhE2MbZw', title: 'The Handling Secrets Goalkeepers Never Get Taught',   source: 'Ground Glory Goalkeeping', description: 'A tutorial on catching technique, hand shapes, and body position.',                  devCategory: 'goalkeeping', priority: 2 },
		{ videoId: 'vxtsvUrSC1w', title: 'General goalkeeping',                                  source: '',                         description: 'Goalkeeping fundamentals.',                                                           devCategory: 'goalkeeping', priority: 3 },
		{ videoId: 'Hy10XUls8xs', title: 'One-on-ones',                                          source: '',                         description: 'Goalkeeper one-on-one situations.',                                                   devCategory: 'goalkeeping', priority: 4 },
		{ videoId: 'dkxN7nFAybk', title: 'Advanced techniques',                                  source: '',                         description: 'Advanced goalkeeper techniques.',                                                     devCategory: 'goalkeeping', priority: 5 },
		{ videoId: 'wE8fXiPnD7I', title: 'Advanced techniques',                                  source: '',                         description: 'Advanced goalkeeper techniques.',                                                     devCategory: 'goalkeeping', priority: 6 },
		{ videoId: 'lshxX3S9ShU', title: 'Footwork',                                             source: '',                         description: 'Goalkeeper footwork training.',                                                       devCategory: 'goalkeeping', priority: 7 },
		{ videoId: 'yfvj7E14lAM', title: 'Basics — diving',                                      source: '',                         description: 'Goalkeeper diving basics.',                                                           devCategory: 'goalkeeping', priority: 8 },
		{ videoId: 'vbtGG9Kiqmc', title: 'Handling',                                             source: '',                         description: 'Goalkeeper handling technique.',                                                      devCategory: 'goalkeeping', priority: 9 },
	] as const;

	// Generic placeholder titles — when a row already has a real YouTube title
	// (written by /api/admin/enrich-dev-videos), we preserve it.
	const PLACEHOLDER_TITLES = new Set([
		'Defending', 'Midfield', 'Attacking',
		'General goalkeeping', 'One-on-ones', 'Advanced techniques',
		'Footwork', 'Basics — diving', 'Handling',
	]);

	const curatedIds = VIDEOS.map((v) => `dev-yt-${v.videoId}`);

	for (const v of VIDEOS) {
		const contentId = `dev-yt-${v.videoId}`;
		const url = `https://www.youtube.com/watch?v=${v.videoId}`;
		const isPlaceholder = PLACEHOLDER_TITLES.has(v.title);
		try {
			await db.execute(sql`
				INSERT INTO sc_dev_content
					(content_id, title, description, source, url, content_type,
					 youtube_video_id, dev_category, embed_verified, admin_status,
					 playback_status, editorial_priority, positions, interests, tags, audience)
				VALUES (
					${contentId}, ${v.title}, ${v.description}, ${v.source}, ${url},
					'youtube_video', ${v.videoId}, ${v.devCategory},
					true, 'approved', NULL, ${v.priority}, '[]', '[]', '[]', '["player"]'
				)
				ON DUPLICATE KEY UPDATE
					-- Preserve real YouTube titles; only overwrite if still a placeholder
					title = CASE
						WHEN title IS NULL OR title = ${v.title} OR ${isPlaceholder ? sql`1` : sql`0`} = 0
						THEN VALUES(title)
						ELSE title
					END,
					description = VALUES(description),
					-- Preserve real channel names; only overwrite if blank
					source = CASE WHEN source = '' OR source IS NULL THEN VALUES(source) ELSE source END,
					url = VALUES(url),
					youtube_video_id = VALUES(youtube_video_id),
					dev_category = VALUES(dev_category),
					embed_verified = true,
					admin_status = 'approved',
					editorial_priority = VALUES(editorial_priority)
			`);
		} catch (e) {
			console.error(`startup.migration: failed to upsert ${contentId}`, e);
		}
	}

	// Hide old non-curated approved rows (keeps the list clean)
	// Exclude fitness category — those are managed by the playlist import, not VIDEOS.
	try {
		await db.execute(sql`
			UPDATE sc_dev_content
			SET admin_status = 'unpublished'
			WHERE admin_status = 'approved'
			  AND dev_category != 'fitness'
			  AND content_id NOT IN (${sql.join(curatedIds.map((id) => sql`${id}`), sql`, `)})
		`);
	} catch (e) {
		console.error("startup.migration: failed to hide old rows", e);
	}

	// ── Enrich new attacking videos with real YouTube metadata ────────────────
	// Only runs when the rows still have placeholder titles (idempotent).
	const NEW_ATTACKING_IDS = [
		'qmaQSEJaz6I', 'x_H_Q-tJVS8', 'vwk53EIM5AM',
		'hCgt6-ag7VA', 'iN5YxaM1PpM', 'Zdg232Eoqfw', 'r-xNitT6VTY',
	];
	try {
		const rawKey = getSecret('YOUTUBE_API_KEY');
		const apiKey = typeof rawKey === 'string' ? rawKey : '';
		if (apiKey) {
			const api = apiClient(apiKey);
			const data = await api('videos', {
				part: 'snippet,status,contentDetails',
				id: NEW_ATTACKING_IDS.join(','),
				maxResults: 50,
			});
			const items: unknown[] = data.items ?? [];
			const byId = new Map<string, unknown>();
			for (const item of items) {
				const v = item as { id?: string };
				if (v.id) byId.set(v.id, item);
			}
			for (const videoId of NEW_ATTACKING_IDS) {
				const contentId = `dev-yt-${videoId}`;
				const raw = byId.get(videoId) as {
					snippet?: { title?: string; channelTitle?: string; thumbnails?: { high?: { url: string }; medium?: { url: string }; default?: { url: string } } };
					status?: { privacyStatus?: string; embeddable?: boolean };
					contentDetails?: { regionRestriction?: { allowed?: string[]; blocked?: string[] }; contentRating?: { ytRating?: string } };
				} | undefined;
				if (!raw) {
					await db.execute(sql`UPDATE sc_dev_content SET playback_status = 'unavailable', embed_verified = false WHERE content_id = ${contentId}`);
					console.log(`startup.migration: attacking video ${videoId} not found in YouTube API`);
					continue;
				}
				const title = raw.snippet?.title ?? null;
				const channelTitle = raw.snippet?.channelTitle ?? null;
				const privacyStatus = raw.status?.privacyStatus ?? null;
				const embeddable = raw.status?.embeddable === true && raw.contentDetails?.contentRating?.ytRating !== 'ytAgeRestricted';
				const regionOk = regionAllowed(raw, 'US');
				let playbackStatus: string | null = null;
				if (privacyStatus !== 'public') playbackStatus = 'unavailable';
				else if (!regionOk) playbackStatus = 'region_blocked';
				else if (!embeddable) playbackStatus = 'embed_blocked';
				await db.execute(sql`
					UPDATE sc_dev_content
					SET
						title = CASE WHEN title = 'Attacking' OR title IS NULL THEN COALESCE(${title}, title) ELSE title END,
						source = CASE WHEN source = '' OR source IS NULL THEN COALESCE(${channelTitle}, source) ELSE source END,
						playback_status = ${playbackStatus},
						embed_verified = ${embeddable && regionOk && privacyStatus === 'public'}
					WHERE content_id = ${contentId}
				`);
				console.log(`startup.migration: enriched attacking video ${videoId} — "${title ?? 'unknown'}" (${playbackStatus ?? 'ok'})`);
			}
		}
	} catch (e) {
		console.error("startup.migration: attacking video enrichment failed", e);
	}

	console.log("startup.migration: dev videos seeded (32 videos across 4 categories)");

	// ── fav_publishers column (sc_member_profiles) ────────────────────────────
	// Added in Oct 2026 to support publisher video feed follows.
	// Uses SHOW COLUMNS probe — ADD COLUMN IF NOT EXISTS is not supported on MySQL 5.7.
	try {
		const colResult = await db.execute(sql.raw(
			"SHOW COLUMNS FROM `sc_member_profiles` LIKE 'fav_publishers'"
		)) as unknown;
		const [colRows] = colResult as [unknown[], unknown];
		if (!Array.isArray(colRows) || colRows.length === 0) {
			await db.execute(sql.raw(
				"ALTER TABLE `sc_member_profiles` ADD COLUMN `fav_publishers` TEXT NULL"
			));
			console.log("startup.migration: added fav_publishers column to sc_member_profiles");
		}
	} catch (e) {
		console.warn("startup.migration: fav_publishers probe/alter skipped:", e instanceof Error ? e.message : String(e));
	}

	// ── sc_calendar_feeds.player_ids (v6 migration) ───────────────────────────
	// Added to scope iCal feeds to specific players. Column may not exist on
	// databases created before this migration was introduced. Run automatically
	// so the Drizzle ORM schema (which now selects player_ids) never hits a
	// missing-column error in production.
	try {
		const colResult6 = await db.execute(sql.raw(
			"SHOW COLUMNS FROM `sc_calendar_feeds` LIKE 'player_ids'"
		)) as unknown;
		const [colRows6] = colResult6 as [unknown[], unknown];
		if (!Array.isArray(colRows6) || colRows6.length === 0) {
			await db.execute(sql.raw(
				"ALTER TABLE `sc_calendar_feeds` ADD COLUMN `player_ids` VARCHAR(2048) NULL COMMENT 'JSON array of sc_player_profiles.id; NULL = all players'"
			));
			console.log("startup.migration: added player_ids column to sc_calendar_feeds");
		}
	} catch (e) {
		// sc_calendar_feeds may not exist yet on a fresh DB — skip silently.
		console.warn("startup.migration: player_ids probe/alter skipped:", e instanceof Error ? e.message : String(e));
	}

	// ── Recruiting tables (CREATE IF NOT EXISTS) ──────────────────────────────
	// Six tables for the private recruiting feature. All use IF NOT EXISTS so
	// this is safe to run on every boot. Errors are logged but never fatal.
	const recruitingDDLs: Array<[string, string]> = [
		['sc_college_programs', `
			CREATE TABLE IF NOT EXISTS sc_college_programs (
				id           VARCHAR(36)  NOT NULL PRIMARY KEY,
				import_key   VARCHAR(128) NOT NULL UNIQUE,
				institution  VARCHAR(255) NOT NULL,
				short_name   VARCHAR(128),
				gender       VARCHAR(8)   NOT NULL,
				division     VARCHAR(32),
				conference   VARCHAR(128),
				city         VARCHAR(128),
				state        VARCHAR(64),
				regions      VARCHAR(512) NOT NULL,
				program_url  VARCHAR(512),
				staff_url    VARCHAR(512),
				checked_date VARCHAR(16),
				source_url   VARCHAR(512),
				active       TINYINT(1)   NOT NULL DEFAULT 1,
				created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
		['sc_college_coaches', `
			CREATE TABLE IF NOT EXISTS sc_college_coaches (
				id                 VARCHAR(36)  NOT NULL PRIMARY KEY,
				import_key         VARCHAR(128) NOT NULL UNIQUE,
				program_id         VARCHAR(36)  NOT NULL,
				name               VARCHAR(255) NOT NULL,
				role               VARCHAR(128),
				email              VARCHAR(255),
				email_is_personal  TINYINT(1),
				phone              VARCHAR(64),
				staff_page_url     VARCHAR(512),
				checked_date       VARCHAR(16),
				source_url         VARCHAR(512),
				active             TINYINT(1)   NOT NULL DEFAULT 1,
				created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				CONSTRAINT fk_coach_program FOREIGN KEY (program_id) REFERENCES sc_college_programs(id) ON DELETE CASCADE
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
		['sc_id_camps', `
			CREATE TABLE IF NOT EXISTS sc_id_camps (
				id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
				import_key            VARCHAR(128) NOT NULL UNIQUE,
				program_id            VARCHAR(36),
				institution           VARCHAR(255) NOT NULL,
				camp_name             VARCHAR(255) NOT NULL,
				region                VARCHAR(64)  NOT NULL,
				city                  VARCHAR(128),
				state                 VARCHAR(64),
				gender                VARCHAR(8),
				age_eligibility       VARCHAR(128),
				start_date            VARCHAR(16),
				end_date              VARCHAR(16),
				registration_opens    VARCHAR(16),
				registration_deadline VARCHAR(16),
				price                 VARCHAR(64),
				registration_url      VARCHAR(512),
				listing_status        VARCHAR(32)  NOT NULL,
				estimate_evidence     TEXT,
				source_url            VARCHAR(512),
				checked_date          VARCHAR(16),
				active                TINYINT(1)   NOT NULL DEFAULT 1,
				created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				CONSTRAINT fk_camp_program FOREIGN KEY (program_id) REFERENCES sc_college_programs(id) ON DELETE SET NULL
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
		['sc_showcases', `
			CREATE TABLE IF NOT EXISTS sc_showcases (
				id                    VARCHAR(36)  NOT NULL PRIMARY KEY,
				import_key            VARCHAR(128) NOT NULL UNIQUE,
				name                  VARCHAR(255) NOT NULL,
				organizer             VARCHAR(255),
				region                VARCHAR(64)  NOT NULL,
				city                  VARCHAR(128),
				state                 VARCHAR(64),
				official_url          VARCHAR(512),
				gender                VARCHAR(8),
				age_groups            VARCHAR(128),
				start_date            VARCHAR(16),
				end_date              VARCHAR(16),
				registration_deadline VARCHAR(16),
				entry_type            VARCHAR(16),
				listing_status        VARCHAR(32)  NOT NULL,
				recruiting_evidence   TEXT,
				historical_attendance TEXT,
				source_url            VARCHAR(512),
				checked_date          VARCHAR(16),
				active                TINYINT(1)   NOT NULL DEFAULT 1,
				created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
		['sc_recruiting_saved', `
			CREATE TABLE IF NOT EXISTS sc_recruiting_saved (
				id                VARCHAR(36)  NOT NULL PRIMARY KEY,
				user_id           VARCHAR(36)  NOT NULL,
				player_id         VARCHAR(36)  NOT NULL,
				item_type         VARCHAR(16)  NOT NULL,
				item_id           VARCHAR(36)  NOT NULL,
				status            VARCHAR(16)  NOT NULL DEFAULT 'interested',
				calendar_event_id VARCHAR(36),
				notes             TEXT,
				saved_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				CONSTRAINT fk_rs_user   FOREIGN KEY (user_id)   REFERENCES user(id)                ON DELETE CASCADE,
				CONSTRAINT fk_rs_player FOREIGN KEY (player_id) REFERENCES sc_player_profiles(id)  ON DELETE CASCADE,
				UNIQUE KEY uq_rs_player_item (player_id, item_type, item_id)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
		['sc_outreach_drafts', `
			CREATE TABLE IF NOT EXISTS sc_outreach_drafts (
				id                      VARCHAR(36)  NOT NULL PRIMARY KEY,
				user_id                 VARCHAR(36)  NOT NULL,
				player_id               VARCHAR(36)  NOT NULL,
				coach_id                VARCHAR(36)  NOT NULL,
				approved_fields         TEXT,
				selected_collection_id  VARCHAR(36),
				selected_media          TEXT,
				selected_match_records  TEXT,
				introduction            TEXT,
				draft_status            VARCHAR(16)  NOT NULL DEFAULT 'draft',
				created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				CONSTRAINT fk_od_user   FOREIGN KEY (user_id)   REFERENCES user(id)                ON DELETE CASCADE,
				CONSTRAINT fk_od_player FOREIGN KEY (player_id) REFERENCES sc_player_profiles(id)  ON DELETE CASCADE,
				CONSTRAINT fk_od_coach  FOREIGN KEY (coach_id)  REFERENCES sc_college_coaches(id)  ON DELETE CASCADE
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
	];
	for (const [tableName, ddl] of recruitingDDLs) {
		try {
			await db.execute(sql.raw(ddl.trim()));
			// IF NOT EXISTS means this is a no-op when the table already exists.
		} catch (e) {
			console.warn(`startup.migration: recruiting table ${tableName} skipped:`, e instanceof Error ? e.message : String(e));
		}
	}
	console.log("startup.migration: recruiting tables ensured (CREATE IF NOT EXISTS)");

	// Recruiting data is NOT auto-seeded here. Coach names and event dates require
	// manual verification before import. Use POST /api/parent/admin/seed-recruiting
	// (admin-only, idempotent per record via INSERT IGNORE) once data is verified.

	// ── Parent portal tables (CREATE IF NOT EXISTS) ───────────────────────────
	// sc_parent_media, sc_parent_connections, sc_parent_manual_events were
	// previously only created by the admin run-schema-v3 endpoint. Moving them
	// here ensures they exist on every boot without requiring a manual admin call.
	// sc_player_match_records was similarly gated behind run-schema-match-records.
	// sc_player_media_assignments and the two collection tables were already here.
	// All CREATE TABLE IF NOT EXISTS — idempotent, no-op when tables already exist.
	const playerMediaDDLs: Array<[string, string]> = [
		['sc_parent_media', `
			CREATE TABLE IF NOT EXISTS sc_parent_media (
				id              VARCHAR(36)   NOT NULL PRIMARY KEY,
				user_id         VARCHAR(36)   NOT NULL,
				post_id         VARCHAR(36)   NULL,
				storage_path    VARCHAR(512)  NOT NULL,
				public_url      VARCHAR(512)  NOT NULL,
				media_type      VARCHAR(8)    NOT NULL,
				original_name   VARCHAR(255)  NULL,
				mime_type       VARCHAR(64)   NULL,
				size_bytes      BIGINT        NULL,
				caption         VARCHAR(512)  NULL,
				deleted_at      TIMESTAMP     NULL,
				created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				CONSTRAINT fk_spm_user FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
		['sc_parent_connections', `
			CREATE TABLE IF NOT EXISTS sc_parent_connections (
				id            VARCHAR(36)   NOT NULL PRIMARY KEY,
				requester_id  VARCHAR(36)   NOT NULL,
				addressee_id  VARCHAR(36)   NOT NULL,
				status        VARCHAR(16)   NOT NULL DEFAULT 'pending',
				message       VARCHAR(256)  NULL,
				accepted_at   TIMESTAMP     NULL,
				rejected_at   TIMESTAMP     NULL,
				removed_at    TIMESTAMP     NULL,
				created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				CONSTRAINT fk_spc_requester FOREIGN KEY (requester_id) REFERENCES \`user\`(id) ON DELETE CASCADE,
				CONSTRAINT fk_spc_addressee FOREIGN KEY (addressee_id) REFERENCES \`user\`(id) ON DELETE CASCADE
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
		['sc_parent_manual_events', `
			CREATE TABLE IF NOT EXISTS sc_parent_manual_events (
				id          VARCHAR(36)   NOT NULL PRIMARY KEY,
				user_id     VARCHAR(36)   NOT NULL,
				title       VARCHAR(512)  NOT NULL,
				start_at    VARCHAR(32)   NOT NULL,
				end_at      VARCHAR(32)   NULL,
				all_day     TINYINT(1)    NOT NULL DEFAULT 0,
				location    VARCHAR(512)  NULL,
				notes       TEXT          NULL,
				event_type  VARCHAR(32)   NULL DEFAULT 'event',
				player_id   VARCHAR(36)   NULL,
				created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				CONSTRAINT fk_spme_user FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
		['sc_player_match_records', `
			CREATE TABLE IF NOT EXISTS sc_player_match_records (
				id                     VARCHAR(36)  NOT NULL PRIMARY KEY,
				user_id                VARCHAR(36)  NOT NULL,
				player_id              VARCHAR(36)  NOT NULL,
				event_ref              VARCHAR(256) NOT NULL,
				match_date             VARCHAR(10)  NULL,
				opponent               VARCHAR(256) NULL,
				season                 VARCHAR(64)  NULL,
				position_played        VARCHAR(64)  NULL,
				participated           BOOLEAN      NOT NULL DEFAULT FALSE,
				stat_gp                INT          NULL,
				stat_goals             INT          NULL,
				stat_assists           INT          NULL,
				stat_shots             INT          NULL,
				stat_ga                INT          NULL,
				stat_saves             INT          NULL,
				stat_so                INT          NULL,
				notes                  TEXT         NULL,
				season_totals_override BOOLEAN      NOT NULL DEFAULT FALSE,
				created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				UNIQUE KEY uq_player_event (player_id, event_ref),
				CONSTRAINT fk_pmr_user FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
		['sc_player_media_assignments', `
			CREATE TABLE IF NOT EXISTS sc_player_media_assignments (
				id             VARCHAR(36)  NOT NULL PRIMARY KEY,
				user_id        VARCHAR(36)  NOT NULL,
				media_id       VARCHAR(36)  NOT NULL,
				player_id      VARCHAR(36)  NOT NULL,
				season         VARCHAR(64),
				game_event_ref VARCHAR(256),
				kind           VARCHAR(16)  NOT NULL DEFAULT 'photo',
				title          VARCHAR(255),
				created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				CONSTRAINT fk_pma_user   FOREIGN KEY (user_id)   REFERENCES user(id)                ON DELETE CASCADE,
				CONSTRAINT fk_pma_player FOREIGN KEY (player_id) REFERENCES sc_player_profiles(id)  ON DELETE CASCADE,
				UNIQUE KEY uq_pma_media_player (media_id, player_id)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
		['sc_player_highlight_collections', `
			CREATE TABLE IF NOT EXISTS sc_player_highlight_collections (
				id         VARCHAR(36)  NOT NULL PRIMARY KEY,
				user_id    VARCHAR(36)  NOT NULL,
				player_id  VARCHAR(36)  NOT NULL,
				name       VARCHAR(255) NOT NULL,
				sort_order INT          NOT NULL DEFAULT 0,
				created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				CONSTRAINT fk_phc_user   FOREIGN KEY (user_id)   REFERENCES user(id)               ON DELETE CASCADE,
				CONSTRAINT fk_phc_player FOREIGN KEY (player_id) REFERENCES sc_player_profiles(id) ON DELETE CASCADE
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
		['sc_player_collection_items', `
			CREATE TABLE IF NOT EXISTS sc_player_collection_items (
				id            VARCHAR(36) NOT NULL PRIMARY KEY,
				collection_id VARCHAR(36) NOT NULL,
				assignment_id VARCHAR(36) NOT NULL,
				sort_order    INT         NOT NULL DEFAULT 0,
				created_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
				CONSTRAINT fk_pci_collection FOREIGN KEY (collection_id) REFERENCES sc_player_highlight_collections(id) ON DELETE CASCADE,
				CONSTRAINT fk_pci_assignment FOREIGN KEY (assignment_id) REFERENCES sc_player_media_assignments(id)     ON DELETE CASCADE,
				UNIQUE KEY uq_pci_coll_assign (collection_id, assignment_id)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`],
	];
	for (const [tableName, ddl] of playerMediaDDLs) {
		try {
			await db.execute(sql.raw(ddl.trim()));
		} catch (e) {
			console.warn(`startup.migration: player-media table ${tableName} skipped:`, e instanceof Error ? e.message : String(e));
		}
	}
	console.log("startup.migration: player-media tables ensured (CREATE IF NOT EXISTS)");

	// ── Schema column additions (ALTER TABLE IF NOT EXISTS equivalent) ────────
	// MySQL 5.7 does not support ADD COLUMN IF NOT EXISTS, so we catch the
	// duplicate-column error (ER_DUP_FIELDNAME / 1060) and treat it as a no-op.
	// Each statement is idempotent: safe to run on every boot.
	const columnMigrations: Array<[string, string]> = [
		// sc_parent_media: deleted_at was added to the DDL after the table was
		// first created in production — existing tables need the column added.
		['sc_parent_media.deleted_at',
			`ALTER TABLE sc_parent_media ADD COLUMN deleted_at TIMESTAMP NULL`],

		// sc_outreach_drafts: v2 columns (subject, recipient_name, recipient_email,
		// sent_at) were added to the UI and API but never applied to the DDL or
		// existing tables. All four are needed for the email-draft workflow.
		['sc_outreach_drafts.subject',
			`ALTER TABLE sc_outreach_drafts ADD COLUMN subject VARCHAR(255) NULL`],
		['sc_outreach_drafts.recipient_name',
			`ALTER TABLE sc_outreach_drafts ADD COLUMN recipient_name VARCHAR(255) NULL`],
		['sc_outreach_drafts.recipient_email',
			`ALTER TABLE sc_outreach_drafts ADD COLUMN recipient_email VARCHAR(255) NULL`],
		['sc_outreach_drafts.sent_at',
			`ALTER TABLE sc_outreach_drafts ADD COLUMN sent_at TIMESTAMP NULL`],
	];
	for (const [label, ddl] of columnMigrations) {
		try {
			await db.execute(sql.raw(ddl));
			console.log(`startup.migration: column added — ${label}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			// 1060 = ER_DUP_FIELDNAME — column already exists, expected on repeat boots
			if (msg.includes('1060') || msg.toLowerCase().includes('duplicate column')) {
				// no-op — already present
			} else {
				console.warn(`startup.migration: column migration skipped (${label}):`, msg);
			}
		}
	}

	// ── sc_saved_tryouts — create if not exists ───────────────────────────────
	// This table was defined in schema.ts but never added to the startup DDL block.
	// The top-level Saved tab and PpTryoutsTab both depend on it.
	try {
		await db.execute(sql.raw(`
			CREATE TABLE IF NOT EXISTS sc_saved_tryouts (
				id         VARCHAR(36)  NOT NULL PRIMARY KEY,
				user_id    VARCHAR(36)  NOT NULL,
				tryout_id  VARCHAR(64)  NOT NULL,
				saved_at   TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
				CONSTRAINT fk_sst_user FOREIGN KEY (user_id) REFERENCES \`user\`(id) ON DELETE CASCADE,
				UNIQUE KEY uq_sst_user_tryout (user_id, tryout_id)
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`.trim()));
		console.log("startup.migration: sc_saved_tryouts ensured");
	} catch (e) {
		console.warn("startup.migration: sc_saved_tryouts skipped:", e instanceof Error ? e.message : String(e));
	}

	// ── Sources catalog auto-seed ─────────────────────────────────────────────
	// Upserts the canonical sc_sources catalog on every boot so feed URLs are
	// always correct without requiring a manual admin POST /api/parent/admin/seed-sources.
	// Idempotent — never changes sc_sources.id, so sc_user_following rows are safe.
	try {
		const { upserted, inserted, errors } = await upsertSourcesCatalog();
		console.log(`startup.migration: sources catalog seeded — ${upserted} updated, ${inserted} inserted, ${errors} errors`);
	} catch (e) {
		console.error("startup.migration: sources catalog seed failed", e);
	}

	// ── Import Fitness & speed training playlist (idempotent) ─────────────────
	// Runs on every boot; ON DUPLICATE KEY UPDATE preserves real titles already in DB.
	const FITNESS_PLAYLIST_ID = 'PLSYLQBF8yu6eZrzCbzaF3s_7PcIZhax9e';
	const FITNESS_INDIVIDUAL_IDS = ['d01bxcf-VhQ', 'jxc1R8N8ZgY', '7AfjAgpQgbw', '8cCISQG1SuA'];
	const FITNESS_CATEGORY = 'fitness';
	try {
		const rawKey = getSecret('YOUTUBE_API_KEY');
		const apiKey = typeof rawKey === 'string' ? rawKey : '';
		if (apiKey) {
			// Collect playlist video IDs (paginated)
			const playlistIds: string[] = [];
			let pageToken: string | undefined;
			let pageCount = 0;
			do {
				const params: Record<string, string> = { part: 'contentDetails,status', playlistId: FITNESS_PLAYLIST_ID, maxResults: '50' };
				if (pageToken) params.pageToken = pageToken;
				const data = await apiClient(apiKey)('playlistItems', params) as {
					items?: { contentDetails?: { videoId?: string }; status?: { privacyStatus?: string } }[];
					nextPageToken?: string;
				};
				for (const item of data.items ?? []) {
					const vid = item.contentDetails?.videoId;
					if (vid && item.status?.privacyStatus !== 'private') playlistIds.push(vid);
				}
				pageToken = data.nextPageToken;
				pageCount++;
			} while (pageToken && pageCount < 10);

			// Merge individual IDs, deduplicate
			const seen = new Set<string>();
			const allIds: string[] = [];
			for (const id of [...playlistIds, ...FITNESS_INDIVIDUAL_IDS]) {
				if (!seen.has(id)) { seen.add(id); allIds.push(id); }
			}

			// Fetch metadata in batches of 50
			const metaMap = new Map<string, { title: string; channel: string; ps: string | null; embedOk: boolean }>();
			for (let i = 0; i < allIds.length; i += 50) {
				const batch = allIds.slice(i, i + 50);
				const data = await apiClient(apiKey)('videos', { part: 'snippet,status,contentDetails', id: batch.join(','), maxResults: 50 }) as { items?: unknown[] };
				for (const raw of data.items ?? []) {
					const item = raw as import('./youtube.js').RawVideo;
					if (!item.id) continue;
					const priv = item.status?.privacyStatus ?? null;
					const emb = item.status?.embeddable === true && item.contentDetails?.contentRating?.ytRating !== 'ytAgeRestricted';
					const reg = regionAllowed(item, 'US');
					let ps: string | null = null;
					if (priv !== 'public') ps = 'unavailable';
					else if (!reg) ps = 'region_blocked';
					else if (!emb) ps = 'embed_blocked';
					metaMap.set(item.id, { title: item.snippet?.title ?? 'Fitness & speed training', channel: item.snippet?.channelTitle ?? '', ps, embedOk: emb && reg && priv === 'public' });
				}
			}

			// Upsert all fitness videos
			let priority = 10;
			let upsertCount = 0;
			for (const videoId of allIds) {
				const contentId = `dev-yt-${videoId}`;
				const url = `https://www.youtube.com/watch?v=${videoId}`;
				const meta = metaMap.get(videoId);
				const title = meta?.title ?? 'Fitness & speed training';
				const channel = meta?.channel ?? '';
				const ps = meta?.ps ?? null;
				const embedOk = meta?.embedOk ?? false;
				try {
					await db.execute(sql`
						INSERT INTO sc_dev_content
							(content_id, title, description, source, url, content_type,
							 youtube_video_id, dev_category, embed_verified, admin_status,
							 playback_status, editorial_priority, positions, interests, tags, audience)
						VALUES (
							${contentId}, ${title}, 'Fitness and speed training for soccer players.',
							${channel}, ${url}, 'youtube_video', ${videoId}, ${FITNESS_CATEGORY},
							${embedOk}, 'approved', ${ps}, ${priority},
							'[]', '[]', '["fitness","speed","conditioning"]', '["player"]'
						)
						ON DUPLICATE KEY UPDATE
							title = CASE WHEN title IN ('Fitness & speed training','') OR title IS NULL THEN VALUES(title) ELSE title END,
							source = CASE WHEN source = '' OR source IS NULL THEN VALUES(source) ELSE source END,
							dev_category = ${FITNESS_CATEGORY},
							admin_status = 'approved',
							playback_status = ${ps},
							embed_verified = ${embedOk},
							editorial_priority = VALUES(editorial_priority)
					`);
					upsertCount++;
				} catch (e) {
					console.error(`startup.migration: fitness upsert failed for ${videoId}`, e);
				}
				priority++;
			}

			// Register playlist tracking row
			try {
				await db.execute(sql`
					INSERT INTO sc_dev_playlists (playlist_id, dev_category, label, last_imported_at, last_import_count, enabled)
					VALUES (${FITNESS_PLAYLIST_ID}, ${FITNESS_CATEGORY}, 'Fitness & speed training', NOW(), ${upsertCount}, true)
					ON DUPLICATE KEY UPDATE last_imported_at = NOW(), last_import_count = ${upsertCount}
				`);
			} catch { /* non-fatal */ }

			// Also ensure fitness videos are not hidden by the curated-ID cleanup above
			// (they have content_id = dev-yt-<id> but aren't in VIDEOS — re-approve them)
			await db.execute(sql`
				UPDATE sc_dev_content
				SET admin_status = 'approved'
				WHERE dev_category = ${FITNESS_CATEGORY}
				  AND admin_status = 'unpublished'
			`);

			console.log(`startup.migration: fitness videos imported — ${upsertCount} rows (${playlistIds.length} playlist + ${FITNESS_INDIVIDUAL_IDS.length} individual, deduped to ${allIds.length})`);
		}
	} catch (e) {
		console.error("startup.migration: fitness import failed", e);
	}

	// ── Coach profile schema (v3 — additive) ─────────────────────────────────
	// Four columns on sc_player_profiles + two new tables.
	// All probes use SHOW COLUMNS / INFORMATION_SCHEMA so this is safe to run
	// on every boot regardless of whether the feature flag is set.
	try {
		// graduation_year
		const [gyRows] = await db.execute(sql.raw(
			"SHOW COLUMNS FROM `sc_player_profiles` LIKE 'graduation_year'"
		)) as unknown as [unknown[]];
		if (!Array.isArray(gyRows) || gyRows.length === 0) {
			await db.execute(sql.raw("ALTER TABLE `sc_player_profiles` ADD COLUMN `graduation_year` INT NULL"));
			console.log("startup.migration: added graduation_year to sc_player_profiles");
		}
	} catch (e) {
		console.warn("startup.migration: graduation_year probe/alter skipped:", e instanceof Error ? e.message : String(e));
	}
	try {
		// profile_introduction
		const [piRows] = await db.execute(sql.raw(
			"SHOW COLUMNS FROM `sc_player_profiles` LIKE 'profile_introduction'"
		)) as unknown as [unknown[]];
		if (!Array.isArray(piRows) || piRows.length === 0) {
			await db.execute(sql.raw("ALTER TABLE `sc_player_profiles` ADD COLUMN `profile_introduction` TEXT NULL"));
			console.log("startup.migration: added profile_introduction to sc_player_profiles");
		}
	} catch (e) {
		console.warn("startup.migration: profile_introduction probe/alter skipped:", e instanceof Error ? e.message : String(e));
	}
	try {
		// achievements
		const [achRows] = await db.execute(sql.raw(
			"SHOW COLUMNS FROM `sc_player_profiles` LIKE 'achievements'"
		)) as unknown as [unknown[]];
		if (!Array.isArray(achRows) || achRows.length === 0) {
			await db.execute(sql.raw("ALTER TABLE `sc_player_profiles` ADD COLUMN `achievements` TEXT NULL"));
			console.log("startup.migration: added achievements to sc_player_profiles");
		}
	} catch (e) {
		console.warn("startup.migration: achievements probe/alter skipped:", e instanceof Error ? e.message : String(e));
	}
	try {
		// playing_level
		const [plRows] = await db.execute(sql.raw(
			"SHOW COLUMNS FROM `sc_player_profiles` LIKE 'playing_level'"
		)) as unknown as [unknown[]];
		if (!Array.isArray(plRows) || plRows.length === 0) {
			await db.execute(sql.raw("ALTER TABLE `sc_player_profiles` ADD COLUMN `playing_level` VARCHAR(64) NULL"));
			console.log("startup.migration: added playing_level to sc_player_profiles");
		}
	} catch (e) {
		console.warn("startup.migration: playing_level probe/alter skipped:", e instanceof Error ? e.message : String(e));
	}
	try {
		// sc_coach_profile_links
		await db.execute(sql.raw(`
			CREATE TABLE IF NOT EXISTS sc_coach_profile_links (
				id                       VARCHAR(36)  NOT NULL PRIMARY KEY,
				player_id                VARCHAR(36)  NOT NULL,
				user_id                  VARCHAR(36)  NOT NULL,
				token_hash               VARCHAR(64)  NOT NULL UNIQUE,
				approved_fields          TEXT         NOT NULL,
				selected_media           TEXT         NOT NULL,
				selected_match_records   TEXT         NOT NULL,
				selected_collection_id   VARCHAR(36)  NULL,
				selected_events          TEXT         NULL,
				expires_at               TIMESTAMP    NULL,
				revoked_at               TIMESTAMP    NULL,
				label                    VARCHAR(255) NULL,
				created_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				CONSTRAINT fk_cpl_player FOREIGN KEY (player_id) REFERENCES sc_player_profiles(id) ON DELETE CASCADE,
				CONSTRAINT fk_cpl_user   FOREIGN KEY (user_id)   REFERENCES \`user\`(id)           ON DELETE CASCADE
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`));
		console.log("startup.migration: sc_coach_profile_links ensured");
	} catch (e) {
		console.warn("startup.migration: sc_coach_profile_links skipped:", e instanceof Error ? e.message : String(e));
	}
	try {
		// sc_coach_profile_requests — columns match Drizzle schema (requester_name, requester_email, status, player_id)
		await db.execute(sql.raw(`
			CREATE TABLE IF NOT EXISTS sc_coach_profile_requests (
				id               VARCHAR(36)  NOT NULL PRIMARY KEY,
				link_id          VARCHAR(36)  NOT NULL,
				player_id        VARCHAR(36)  NOT NULL,
				requester_name   VARCHAR(255) NULL,
				requester_email  VARCHAR(255) NULL,
				message          TEXT         NULL,
				status           VARCHAR(16)  NOT NULL DEFAULT 'pending',
				created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
				CONSTRAINT fk_cpr_link FOREIGN KEY (link_id) REFERENCES sc_coach_profile_links(id) ON DELETE CASCADE
			) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
		`));
		console.log("startup.migration: sc_coach_profile_requests ensured");
	} catch (e) {
		console.warn("startup.migration: sc_coach_profile_requests skipped:", e instanceof Error ? e.message : String(e));
	}
	// Additive column probes for sc_coach_profile_requests (fixes installs created with wrong DDL)
	for (const [col, ddl] of [
		['player_id',       "ALTER TABLE `sc_coach_profile_requests` ADD COLUMN `player_id` VARCHAR(36) NOT NULL DEFAULT ''"],
		['requester_name',  "ALTER TABLE `sc_coach_profile_requests` ADD COLUMN `requester_name` VARCHAR(255) NULL"],
		['requester_email', "ALTER TABLE `sc_coach_profile_requests` ADD COLUMN `requester_email` VARCHAR(255) NULL"],
		['status',          "ALTER TABLE `sc_coach_profile_requests` ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'pending'"],
		['updated_at',      "ALTER TABLE `sc_coach_profile_requests` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"],
	] as [string, string][]) {
		try {
			const [colRows] = await db.execute(sql.raw(
				`SHOW COLUMNS FROM \`sc_coach_profile_requests\` LIKE '${col}'`
			)) as unknown as [unknown[]];
			if (!Array.isArray(colRows) || colRows.length === 0) {
				await db.execute(sql.raw(ddl));
				console.log(`startup.migration: added ${col} to sc_coach_profile_requests`);
			}
		} catch (e) {
			console.warn(`startup.migration: sc_coach_profile_requests.${col} probe/alter skipped:`, e instanceof Error ? e.message : String(e));
		}
	}

	// ── sc_coach_profile_links.selected_events (additive) ───────────────────
	// Column was missing from the original CREATE TABLE DDL. Probe and add if absent.
	try {
		const [seRows] = await db.execute(sql.raw(
			"SHOW COLUMNS FROM `sc_coach_profile_links` LIKE 'selected_events'"
		)) as unknown as [unknown[]];
		if (!Array.isArray(seRows) || seRows.length === 0) {
			await db.execute(sql.raw(
				"ALTER TABLE `sc_coach_profile_links` ADD COLUMN `selected_events` TEXT NULL"
			));
			console.log("startup.migration: added selected_events to sc_coach_profile_links");
		}
	} catch (e) {
		// Table may not exist yet — will be created with the column above
		const msg = e instanceof Error ? e.message : String(e);
		if (!msg.includes("doesn't exist") && !msg.includes('1146')) {
			console.warn("startup.migration: selected_events probe/alter skipped:", msg);
		}
	}

	// ── v5: school info columns on sc_player_profiles ──────────────────────────
	for (const col of [
		{ name: 'high_school',  ddl: 'VARCHAR(128) NULL' },
		{ name: 'school_city',  ddl: 'VARCHAR(64)  NULL' },
		{ name: 'school_state', ddl: 'VARCHAR(32)  NULL' },
	] as const) {
		try {
			const probe = await db.execute(sql.raw(
				`SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sc_player_profiles' AND COLUMN_NAME = '${col.name}'`
			)) as unknown;
			const cnt = Number(((probe as [Array<{ cnt: number }>])[0][0])?.cnt ?? 0);
			if (cnt === 0) {
				await db.execute(sql.raw(`ALTER TABLE sc_player_profiles ADD COLUMN ${col.name} ${col.ddl}`));
				console.log(`startup.migration: added ${col.name} to sc_player_profiles`);
			}
		} catch (e) {
			console.warn(`startup.migration: column migration skipped (sc_player_profiles.${col.name}):`, e instanceof Error ? e.message : String(e));
		}
	}

	// ── Wire DrizzleCoachLinkStore when feature flag is active ────────────────
	{
		const _raw = getSecret('COACH_PROFILE_LINKS_ENABLED');
		const _len = _raw != null ? String(_raw).length : null;
		const _enabled = isCoachProfileEnabled();
		console.log(`startup: COACH_PROFILE_LINKS_ENABLED len=${String(_len)} enabled=${String(_enabled)}`);
	}
	if (isCoachProfileEnabled()) {
		try {
			const { DrizzleCoachLinkStore, setCoachLinkStore } = await import('./lib/coach-link-store.js');
			setCoachLinkStore(new DrizzleCoachLinkStore(db));
			console.log("startup: DrizzleCoachLinkStore registered");
		} catch (e) {
			console.error("startup: DrizzleCoachLinkStore registration failed:", e instanceof Error ? e.message : String(e));
		}
	}
}

// Run immediately when the module loads (works in both dev SSR and production)
void (async () => {
	try { await runStartupMigrations(); } catch (e) { console.error("startup.migration: error", e); }
})();


	// ── Process-level crash guard ─────────────────────────────────────────────
	// Node.js v22 undici (the built-in fetch) can throw an AssertionError from
	// its TLS parser when a remote server sends a malformed response and then
	// closes the connection mid-stream. This is a Node.js bug (not app code) and
	// the error bypasses all try/catch blocks — it surfaces as an uncaughtException
	// that kills the process. We catch it here, log it, and keep the server alive.
	// The broken feed is already marked 'error' in the DB by the time this fires.
	process.on('uncaughtException', (err: Error) => {
		const isUndiciAssertion =
			err.name === 'AssertionError' &&
			(err.stack?.includes('undici') ?? false);
		if (isUndiciAssertion) {
			// Known Node.js v22 undici TLS bug — log and continue
			console.error('[process] uncaughtException (undici TLS assertion — non-fatal):', err.message);
		} else {
			// Unknown exception — log with full stack, then exit so the supervisor
			// can restart the process rather than leaving it in an unknown state.
			console.error('[process] uncaughtException (fatal):', err);
			process.exit(1);
		}
	});

	process.on('unhandledRejection', (reason: unknown) => {
		// Log unhandled promise rejections without crashing — the scheduler
		// already catches and records per-feed errors, but belt-and-suspenders.
		console.error('[process] unhandledRejection:', reason);
	});

	const port = parseInt(rawPort, 10);
	if (!Number.isInteger(port) || port <= 0 || port > 65535) {
		// parseInt("abc") returns NaN; passing that to app.listen throws
		// synchronously before the server.on("error") handler below can catch
		// it. Fail fast with an actionable log rather than a cryptic crash.
		console.error("ssr.server.invalid-port", { rawPort });
		process.exit(1);
	}
	const host = process.env.HOST || "0.0.0.0";
	const server = app.listen(port, host, () => {
		console.log(`Server listening on http://${host}:${port}`);
		// Apply any pending schema changes (idempotent)
		void runStartupMigrations();
		// Start the tryout scraper scheduler (reads durable state from DB)
		void startScraperScheduler();
		// Start the 15-minute iCal feed refresh — first run after 3 min
		startCalendarRefreshScheduler();
		// Start the YouTube highlights refresh — checks every 60s, refreshes each channel at most every 4h
		startHighlightsRefreshScheduler();
	});
	server.on("error", (err: NodeJS.ErrnoException) => {
		console.error("ssr.server.listen-failed", {
			port,
			host,
			code: err.code,
			error: err.message,
		});
		process.exit(1);
	});
}

export default app;
