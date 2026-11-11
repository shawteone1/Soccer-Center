/**
 * Professional soccer source catalog.
 *
 * Connection status:
 *   'youtube-live'  — channel is in channels.json with a verified channelId; live feed available
 *   'link-only'     — verified website/social links exist but no YouTube channel confirmed
 *   'unresolved'    — source is known but no verified links yet
 *
 * This catalog is additive — it never replaces channels.json.
 * channels.json remains the single source of truth for YouTube channel IDs.
 */

export type ConnectionStatus = 'youtube-live' | 'link-only' | 'unresolved';
export type ProSourceKind = 'club' | 'league' | 'competition' | 'national_team' | 'media';

export interface ProSource {
  id: string;
  name: string;
  kind: ProSourceKind;
  competition?: string;   // slug of parent competition (for clubs)
  country: string;        // ISO-3166 alpha-3 or confederation code
  status: ConnectionStatus;
  website?: string;
  youtubeUrl?: string;
  twitterHandle?: string;
  instagramHandle?: string;
  /** Slug in channels.json — only set when status === 'youtube-live' */
  channelSlug?: string;
}

export interface ProCompetition {
  slug: string;
  name: string;
  shortName: string;
  kind: 'league' | 'competition';
  confederation: string;
  country?: string;
  channelSlug?: string; // slug in channels.json if the competition itself has a YouTube channel
}

// ─── Competitions ─────────────────────────────────────────────────────────────

export const PRO_COMPETITIONS: ProCompetition[] = [
  // Domestic leagues
  { slug: 'premier-league',  name: 'Premier League',       shortName: 'PL',        kind: 'league',      confederation: 'UEFA', country: 'ENG', channelSlug: 'premier-league' },
  { slug: 'laliga',          name: 'LaLiga',                shortName: 'LaLiga',    kind: 'league',      confederation: 'UEFA', country: 'ESP', channelSlug: 'laliga' },
  { slug: 'bundesliga',      name: 'Bundesliga',            shortName: 'BL',        kind: 'league',      confederation: 'UEFA', country: 'GER', channelSlug: 'bundesliga' },
  { slug: 'ligue-1',         name: 'Ligue 1',               shortName: 'L1',        kind: 'league',      confederation: 'UEFA', country: 'FRA', channelSlug: 'ligue-1' },
  { slug: 'serie-a',         name: 'Serie A',               shortName: 'SA',        kind: 'league',      confederation: 'UEFA', country: 'ITA' },
  { slug: 'mls',             name: 'MLS',                   shortName: 'MLS',       kind: 'league',      confederation: 'CONCACAF', country: 'USA', channelSlug: 'mls' },
  { slug: 'nwsl',            name: 'NWSL',                  shortName: 'NWSL',      kind: 'league',      confederation: 'CONCACAF', country: 'USA', channelSlug: 'nwsl' },
  // Continental / cup competitions
  { slug: 'champions-league', name: 'UEFA Champions League', shortName: 'UCL',      kind: 'competition', confederation: 'UEFA', channelSlug: 'champions-league' },
  { slug: 'europa-league',   name: 'UEFA Europa League',    shortName: 'UEL',       kind: 'competition', confederation: 'UEFA' },
  { slug: 'nations-league',  name: 'UEFA Nations League',   shortName: 'UNL',       kind: 'competition', confederation: 'UEFA' },
  { slug: 'world-cup',       name: 'FIFA World Cup',        shortName: 'WC',        kind: 'competition', confederation: 'FIFA' },
  { slug: 'copa-america',    name: 'Copa América',          shortName: 'CA',        kind: 'competition', confederation: 'CONMEBOL' },
];

// ─── Clubs ────────────────────────────────────────────────────────────────────
// Premier League — all 20 clubs have YouTube channels in channels.json

const PL_CLUBS: ProSource[] = [
  { id: 'afc-bournemouth',   name: 'AFC Bournemouth',       kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'afc-bournemouth',   website: 'https://www.afcb.co.uk/' },
  { id: 'arsenal',           name: 'Arsenal',               kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'arsenal',           website: 'https://www.arsenal.com/' },
  { id: 'aston-villa',       name: 'Aston Villa',           kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'aston-villa',       website: 'https://www.avfc.co.uk/' },
  { id: 'brentford',         name: 'Brentford',             kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'brentford',         website: 'https://www.brentfordfc.com/' },
  { id: 'brighton',          name: 'Brighton & Hove Albion',kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'brighton',          website: 'https://www.brightonandhovealbion.com/' },
  { id: 'chelsea',           name: 'Chelsea',               kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'chelsea',           website: 'https://www.chelseafc.com/' },
  { id: 'coventry-city',     name: 'Coventry City',         kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'coventry-city',     website: 'https://www.ccfc.co.uk/' },
  { id: 'crystal-palace',    name: 'Crystal Palace',        kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'crystal-palace',    website: 'https://www.cpfc.co.uk/' },
  { id: 'everton',           name: 'Everton',               kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'everton',           website: 'https://www.evertonfc.com/' },
  { id: 'fulham',            name: 'Fulham',                kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'fulham',            website: 'https://www.fulhamfc.com/' },
  { id: 'hull-city',         name: 'Hull City',             kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'hull-city',         website: 'https://www.wearehullcity.co.uk/' },
  { id: 'ipswich-town',      name: 'Ipswich Town',          kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'ipswich-town',      website: 'https://www.itfc.co.uk/' },
  { id: 'leeds-united',      name: 'Leeds United',          kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'leeds-united',      website: 'https://www.leedsunited.com/' },
  { id: 'liverpool',         name: 'Liverpool',             kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'liverpool',         website: 'https://www.liverpoolfc.com/' },
  { id: 'manchester-city',   name: 'Manchester City',       kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'manchester-city',   website: 'https://www.mancity.com/' },
  { id: 'manchester-united', name: 'Manchester United',     kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'manchester-united', website: 'https://www.manutd.com/' },
  { id: 'newcastle-united',  name: 'Newcastle United',      kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'newcastle-united',  website: 'https://www.newcastleunited.com/' },
  { id: 'nottingham-forest', name: 'Nottingham Forest',     kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'nottingham-forest', website: 'https://www.nottinghamforest.co.uk/' },
  { id: 'sunderland',        name: 'Sunderland',            kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'sunderland',        website: 'https://www.safc.com/' },
  { id: 'tottenham-hotspur', name: 'Tottenham Hotspur',     kind: 'club', competition: 'premier-league', country: 'ENG', status: 'youtube-live', channelSlug: 'tottenham-hotspur', website: 'https://www.tottenhamhotspur.com/' },
];

// LaLiga — verified websites; YouTube channels not yet in channels.json
const LALIGA_CLUBS: ProSource[] = [
  { id: 'real-madrid',       name: 'Real Madrid',           kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'real-madrid',       website: 'https://www.realmadrid.com/' },
  { id: 'barcelona',         name: 'FC Barcelona',          kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'barcelona',         website: 'https://www.fcbarcelona.com/' },
  { id: 'atletico-madrid',   name: 'Atlético de Madrid',    kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'atletico-madrid',   website: 'https://www.atleticodemadrid.com/' },
  { id: 'sevilla',           name: 'Sevilla FC',            kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'sevilla',           website: 'https://www.sevillafc.es/' },
  { id: 'real-sociedad',     name: 'Real Sociedad',         kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'real-sociedad',     website: 'https://www.realsociedad.eus/' },
  { id: 'villarreal',        name: 'Villarreal CF',         kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'villarreal',        website: 'https://www.villarrealcf.es/' },
  { id: 'athletic-bilbao',   name: 'Athletic Club',         kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'athletic-bilbao',   website: 'https://www.athletic-club.eus/' },
  { id: 'real-betis',        name: 'Real Betis',            kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'real-betis',        website: 'https://www.realbetisbalompie.es/' },
  { id: 'celta-vigo',        name: 'RC Celta',              kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'celta-vigo',        website: 'https://www.celtavigo.net/' },
  { id: 'getafe',            name: 'Getafe CF',             kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'getafe',            website: 'https://www.getafecf.com/' },
  { id: 'osasuna',           name: 'CA Osasuna',            kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'osasuna',           website: 'https://www.osasuna.es/' },
  { id: 'rayo-vallecano',    name: 'Rayo Vallecano',        kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'rayo-vallecano',    website: 'https://www.rayovallecano.es/' },
  { id: 'espanyol',          name: 'RCD Espanyol',          kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'espanyol',          website: 'https://www.rcdespanyol.com/' },
  { id: 'girona',            name: 'Girona FC',             kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'girona',            website: 'https://www.gironafc.cat/' },
  { id: 'mallorca',          name: 'RCD Mallorca',          kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'mallorca',          website: 'https://www.rcdmallorca.es/' },
  { id: 'alaves',            name: 'Deportivo Alavés',      kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'alaves',            website: 'https://www.deportivoalaves.com/' },
  { id: 'leganes',           name: 'CD Leganés',            kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'leganes',           website: 'https://www.cdleganes.com/' },
  { id: 'las-palmas',        name: 'UD Las Palmas',         kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'las-palmas',        website: 'https://www.udlaspalmas.es/' },
  { id: 'valencia',          name: 'Valencia CF',           kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'valencia',          website: 'https://www.valenciacf.com/' },
  { id: 'valladolid',        name: 'Real Valladolid',       kind: 'club', competition: 'laliga', country: 'ESP', status: 'youtube-live', channelSlug: 'valladolid',        website: 'https://www.realvalladolid.es/' },
];

// Bundesliga — verified websites; YouTube channels not yet in channels.json
const BUNDESLIGA_CLUBS: ProSource[] = [
  { id: 'bayer-leverkusen',  name: 'Bayer 04 Leverkusen',  kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.bayer04.de/',         youtubeUrl: 'https://www.youtube.com/@bayer04' },
  { id: 'bayern-munich',     name: 'FC Bayern München',    kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://fcbayern.com/',            youtubeUrl: 'https://www.youtube.com/@FCBayern' },
  { id: 'borussia-dortmund', name: 'Borussia Dortmund',    kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.bvb.de/',              youtubeUrl: 'https://www.youtube.com/@BVB' },
  { id: 'rb-leipzig',        name: 'RB Leipzig',           kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.rbleipzig.com/',       youtubeUrl: 'https://www.youtube.com/@RBLeipzig' },
  { id: 'eintracht-frankfurt', name: 'Eintracht Frankfurt', kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.eintracht.de/',      youtubeUrl: 'https://www.youtube.com/@EintrachtFrankfurt' },
  { id: 'borussia-mgladbach', name: 'Borussia Mönchengladbach', kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.borussia.de/', youtubeUrl: 'https://www.youtube.com/@borussia' },
  { id: 'vfb-stuttgart',     name: 'VfB Stuttgart',        kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.vfb.de/',              youtubeUrl: 'https://www.youtube.com/@VfBStuttgart' },
  { id: 'sc-freiburg',       name: 'SC Freiburg',          kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.scfreiburg.com/',      youtubeUrl: 'https://www.youtube.com/@SCFreiburg' },
  { id: 'werder-bremen',     name: 'SV Werder Bremen',     kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.werder.de/',           youtubeUrl: 'https://www.youtube.com/@werderbremen' },
  { id: 'hoffenheim',        name: 'TSG Hoffenheim',       kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.achtzehn99.de/',       youtubeUrl: 'https://www.youtube.com/@TSGHoffenheim' },
  { id: 'wolfsburg',         name: 'VfL Wolfsburg',        kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.vfl-wolfsburg.de/',    youtubeUrl: 'https://www.youtube.com/@VfLWolfsburg' },
  { id: 'mainz',             name: '1. FSV Mainz 05',      kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.mainz05.de/',          youtubeUrl: 'https://www.youtube.com/@Mainz05' },
  { id: 'augsburg',          name: 'FC Augsburg',          kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.fcaugsburg.de/',       youtubeUrl: 'https://www.youtube.com/@FCAugsburg' },
  { id: 'union-berlin',      name: '1. FC Union Berlin',   kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.fc-union-berlin.de/',  youtubeUrl: 'https://www.youtube.com/@fcunionberlin' },
  { id: 'heidenheim',        name: '1. FC Heidenheim',     kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.fc-heidenheim.de/',    youtubeUrl: 'https://www.youtube.com/@FCHeidenheim' },
  { id: 'holstein-kiel',     name: 'Holstein Kiel',        kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.holstein-kiel.de/',    youtubeUrl: 'https://www.youtube.com/@HolsteinKiel' },
  { id: 'st-pauli',          name: 'FC St. Pauli',         kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.fcstpauli.com/',       youtubeUrl: 'https://www.youtube.com/@FCSanktPauli' },
  { id: 'hamburger-sv',      name: 'Hamburger SV',         kind: 'club', competition: 'bundesliga', country: 'GER', status: 'link-only', website: 'https://www.hsv.de/',              youtubeUrl: 'https://www.youtube.com/@HamburgerSV' },
];

// Ligue 1 — verified websites; YouTube channels not yet in channels.json
const LIGUE1_CLUBS: ProSource[] = [
  { id: 'psg',               name: 'Paris Saint-Germain',  kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.psg.fr/',              youtubeUrl: 'https://www.youtube.com/@PSG' },
  { id: 'olympique-marseille', name: 'Olympique de Marseille', kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.om.fr/',          youtubeUrl: 'https://www.youtube.com/@OM' },
  { id: 'olympique-lyonnais', name: 'Olympique Lyonnais',  kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.ol.fr/',               youtubeUrl: 'https://www.youtube.com/@OL' },
  { id: 'as-monaco',         name: 'AS Monaco',            kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.asmonaco.com/',        youtubeUrl: 'https://www.youtube.com/@ASMonaco' },
  { id: 'stade-rennais',     name: 'Stade Rennais FC',     kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.staderennais.com/',    youtubeUrl: 'https://www.youtube.com/@StadeRennaisFC' },
  { id: 'rc-lens',           name: 'RC Lens',              kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.rclens.fr/',           youtubeUrl: 'https://www.youtube.com/@RCLens' },
  { id: 'losc-lille',        name: 'LOSC Lille',           kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.losc.fr/',             youtubeUrl: 'https://www.youtube.com/@LOSC' },
  { id: 'nice',              name: 'OGC Nice',             kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.ogcnice.com/',         youtubeUrl: 'https://www.youtube.com/@OGCNice' },
  { id: 'strasbourg',        name: 'RC Strasbourg',        kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.rcsa.fr/',             youtubeUrl: 'https://www.youtube.com/@RCStrasbourg' },
  { id: 'montpellier',       name: 'Montpellier HSC',      kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.mhscfoot.com/',        youtubeUrl: 'https://www.youtube.com/@MontpellierHSC' },
  { id: 'nantes',            name: 'FC Nantes',            kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.fcnantes.com/',        youtubeUrl: 'https://www.youtube.com/@FCNantes' },
  { id: 'toulouse',          name: 'Toulouse FC',          kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.toulousefc.com/',      youtubeUrl: 'https://www.youtube.com/@ToulouseFC' },
  { id: 'reims',             name: 'Stade de Reims',       kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.stade-de-reims.com/',  youtubeUrl: 'https://www.youtube.com/@StadeDeReims' },
  { id: 'brest',             name: 'Stade Brestois 29',    kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.stade-brestois.com/',  youtubeUrl: 'https://www.youtube.com/@StadeBrestois' },
  { id: 'havre',             name: 'Le Havre AC',          kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.lehavreac.fr/',        youtubeUrl: 'https://www.youtube.com/@LeHavreAC' },
  { id: 'auxerre',           name: 'AJ Auxerre',           kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.aja.fr/',              youtubeUrl: 'https://www.youtube.com/@AJAuxerre' },
  { id: 'angers',            name: 'Angers SCO',           kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.angers-sco.fr/',       youtubeUrl: 'https://www.youtube.com/@AngersSCO' },
  { id: 'saint-etienne',     name: 'AS Saint-Étienne',     kind: 'club', competition: 'ligue-1', country: 'FRA', status: 'link-only', website: 'https://www.asse.fr/',             youtubeUrl: 'https://www.youtube.com/@ASSE' },
];

// Serie A — verified websites; YouTube channels not yet in channels.json
const SERIE_A_CLUBS: ProSource[] = [
  { id: 'inter-milan',       name: 'Inter Milan',          kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.inter.it/',            youtubeUrl: 'https://www.youtube.com/@Inter' },
  { id: 'ac-milan',          name: 'AC Milan',             kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.acmilan.com/',         youtubeUrl: 'https://www.youtube.com/@ACMilan' },
  { id: 'juventus',          name: 'Juventus',             kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.juventus.com/',        youtubeUrl: 'https://www.youtube.com/@Juventus' },
  { id: 'napoli',            name: 'SSC Napoli',           kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.sscnapoli.it/',        youtubeUrl: 'https://www.youtube.com/@SSCNapoli' },
  { id: 'as-roma',           name: 'AS Roma',              kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.asroma.com/',          youtubeUrl: 'https://www.youtube.com/@ASRoma' },
  { id: 'lazio',             name: 'SS Lazio',             kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.sslazio.it/',          youtubeUrl: 'https://www.youtube.com/@SSLazio' },
  { id: 'atalanta',          name: 'Atalanta BC',          kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.atalanta.it/',         youtubeUrl: 'https://www.youtube.com/@Atalanta' },
  { id: 'fiorentina',        name: 'ACF Fiorentina',       kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.acffiorentina.com/',   youtubeUrl: 'https://www.youtube.com/@ACFFiorentina' },
  { id: 'torino',            name: 'Torino FC',            kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.torinofc.it/',         youtubeUrl: 'https://www.youtube.com/@TorinoFC' },
  { id: 'bologna',           name: 'Bologna FC',           kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.bolognafootballclub.it/', youtubeUrl: 'https://www.youtube.com/@BolognaFC' },
  { id: 'udinese',           name: 'Udinese Calcio',       kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.udinese.it/',          youtubeUrl: 'https://www.youtube.com/@UdineseCalcio' },
  { id: 'sassuolo',          name: 'US Sassuolo',          kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.sassuolocalcio.it/',   youtubeUrl: 'https://www.youtube.com/@USSassuolo' },
  { id: 'sampdoria',         name: 'UC Sampdoria',         kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.sampdoria.it/',        youtubeUrl: 'https://www.youtube.com/@UCSampdoria' },
  { id: 'cagliari',          name: 'Cagliari Calcio',      kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.cagliaricalcio.com/',  youtubeUrl: 'https://www.youtube.com/@CagliariCalcio' },
  { id: 'hellas-verona',     name: 'Hellas Verona',        kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.hellasverona.it/',     youtubeUrl: 'https://www.youtube.com/@HellasVerona' },
  { id: 'genoa',             name: 'Genoa CFC',            kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.genoacfc.it/',         youtubeUrl: 'https://www.youtube.com/@GenoaCFC' },
  { id: 'lecce',             name: 'US Lecce',             kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.uslecce.it/',          youtubeUrl: 'https://www.youtube.com/@USLecce' },
  { id: 'empoli',            name: 'Empoli FC',            kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.empolifc.com/',        youtubeUrl: 'https://www.youtube.com/@EmpoliFC' },
  { id: 'frosinone',         name: 'Frosinone Calcio',     kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.frosinonecalcio.com/', youtubeUrl: 'https://www.youtube.com/@FrosinoneCalcio' },
  { id: 'monza',             name: 'AC Monza',             kind: 'club', competition: 'serie-a', country: 'ITA', status: 'link-only', website: 'https://www.acmonza.com/',         youtubeUrl: 'https://www.youtube.com/@ACMonza' },
];

// ─── National Teams ───────────────────────────────────────────────────────────

export const NATIONAL_TEAMS: ProSource[] = [
  // UEFA
  { id: 'nt-england',        name: 'England',              kind: 'national_team', country: 'ENG', status: 'link-only', website: 'https://www.thefa.com/',                youtubeUrl: 'https://www.youtube.com/@England' },
  { id: 'nt-spain',          name: 'Spain',                kind: 'national_team', country: 'ESP', status: 'link-only', website: 'https://www.rfef.es/',                  youtubeUrl: 'https://www.youtube.com/@SeFutbol' },
  { id: 'nt-germany',        name: 'Germany',              kind: 'national_team', country: 'GER', status: 'link-only', website: 'https://www.dfb.de/',                   youtubeUrl: 'https://www.youtube.com/@DFBTeam' },
  { id: 'nt-france',         name: 'France',               kind: 'national_team', country: 'FRA', status: 'link-only', website: 'https://www.fff.fr/',                   youtubeUrl: 'https://www.youtube.com/@equipedefrance' },
  { id: 'nt-italy',          name: 'Italy',                kind: 'national_team', country: 'ITA', status: 'link-only', website: 'https://www.figc.it/',                  youtubeUrl: 'https://www.youtube.com/@Azzurri' },
  { id: 'nt-portugal',       name: 'Portugal',             kind: 'national_team', country: 'POR', status: 'link-only', website: 'https://www.fpf.pt/',                   youtubeUrl: 'https://www.youtube.com/@SelecaoPortugal' },
  { id: 'nt-netherlands',    name: 'Netherlands',          kind: 'national_team', country: 'NED', status: 'link-only', website: 'https://www.knvb.nl/',                  youtubeUrl: 'https://www.youtube.com/@OnsOranje' },
  { id: 'nt-belgium',        name: 'Belgium',              kind: 'national_team', country: 'BEL', status: 'link-only', website: 'https://www.rbfa.be/',                  youtubeUrl: 'https://www.youtube.com/@BelgianRedDevils' },
  { id: 'nt-croatia',        name: 'Croatia',              kind: 'national_team', country: 'CRO', status: 'link-only', website: 'https://www.hns-cff.hr/',               youtubeUrl: 'https://www.youtube.com/@HNS' },
  // CONCACAF
  { id: 'nt-usa',            name: 'USA',                  kind: 'national_team', country: 'USA', status: 'link-only', website: 'https://www.ussoccer.com/',              youtubeUrl: 'https://www.youtube.com/@ussoccer' },
  { id: 'nt-mexico',         name: 'Mexico',               kind: 'national_team', country: 'MEX', status: 'link-only', website: 'https://www.femexfut.org.mx/',          youtubeUrl: 'https://www.youtube.com/@miseleccionmx' },
  { id: 'nt-canada',         name: 'Canada',               kind: 'national_team', country: 'CAN', status: 'link-only', website: 'https://www.canadasoccer.com/',         youtubeUrl: 'https://www.youtube.com/@CanadaSoccer' },
  // CONMEBOL
  { id: 'nt-brazil',         name: 'Brazil',               kind: 'national_team', country: 'BRA', status: 'link-only', website: 'https://www.cbf.com.br/',               youtubeUrl: 'https://www.youtube.com/@CBF_Futebol' },
  { id: 'nt-argentina',      name: 'Argentina',            kind: 'national_team', country: 'ARG', status: 'link-only', website: 'https://www.afa.com.ar/',               youtubeUrl: 'https://www.youtube.com/@AFA' },
  { id: 'nt-colombia',       name: 'Colombia',             kind: 'national_team', country: 'COL', status: 'link-only', website: 'https://fcf.com.co/',                   youtubeUrl: 'https://www.youtube.com/@FCF' },
  { id: 'nt-uruguay',        name: 'Uruguay',              kind: 'national_team', country: 'URU', status: 'link-only', website: 'https://www.auf.org.uy/',               youtubeUrl: 'https://www.youtube.com/@AUF' },
];

// ─── Media & Broadcast ────────────────────────────────────────────────────────

export const MEDIA_SOURCES: ProSource[] = [
  { id: 'media-sky-sports',       name: 'Sky Sports Football',   kind: 'media', country: 'GBR', status: 'link-only', website: 'https://www.skysports.com/football',    youtubeUrl: 'https://www.youtube.com/@SkySportsFootball' },
  { id: 'media-bbc-sport',        name: 'BBC Sport Football',    kind: 'media', country: 'GBR', status: 'link-only', website: 'https://www.bbc.com/sport/football',     youtubeUrl: 'https://www.youtube.com/@BBCSport' },
  { id: 'media-espn-fc',          name: 'ESPN FC',               kind: 'media', country: 'USA', status: 'link-only', website: 'https://www.espn.com/soccer/',           youtubeUrl: 'https://www.youtube.com/@ESPNFC' },
  { id: 'media-goal',             name: 'Goal',                  kind: 'media', country: 'INT', status: 'link-only', website: 'https://www.goal.com/',                  youtubeUrl: 'https://www.youtube.com/@goal' },
  { id: 'media-the-athletic',     name: 'The Athletic Soccer',   kind: 'media', country: 'USA', status: 'link-only', website: 'https://theathletic.com/soccer' },
  { id: 'media-transfermarkt',    name: 'Transfermarkt',         kind: 'media', country: 'GER', status: 'link-only', website: 'https://www.transfermarkt.com/' },
  { id: 'media-fbref',            name: 'FBref',                 kind: 'media', country: 'USA', status: 'link-only', website: 'https://fbref.com/' },
  { id: 'media-sofascore',        name: 'SofaScore',             kind: 'media', country: 'INT', status: 'link-only', website: 'https://www.sofascore.com/',             youtubeUrl: 'https://www.youtube.com/@SofaScore' },
  { id: 'media-tifo-football',    name: 'Tifo Football',         kind: 'media', country: 'GBR', status: 'link-only', website: 'https://www.tifofoot.com/',              youtubeUrl: 'https://www.youtube.com/@TifoFootball' },
  { id: 'media-statsbomb',        name: 'StatsBomb',             kind: 'media', country: 'GBR', status: 'link-only', website: 'https://statsbomb.com/' },
];

// ─── Combined export ──────────────────────────────────────────────────────────

export const ALL_PRO_SOURCES: ProSource[] = [
  ...PL_CLUBS,
  ...LALIGA_CLUBS,
  ...BUNDESLIGA_CLUBS,
  ...LIGUE1_CLUBS,
  ...SERIE_A_CLUBS,
  ...NATIONAL_TEAMS,
  ...MEDIA_SOURCES,
];

/** Look up a competition by slug */
export function getCompetition(slug: string): ProCompetition | undefined {
  return PRO_COMPETITIONS.find(c => c.slug === slug);
}

/** Get all clubs for a given competition slug */
export function getClubsByCompetition(competitionSlug: string): ProSource[] {
  return ALL_PRO_SOURCES.filter(s => s.kind === 'club' && s.competition === competitionSlug);
}

/** Coverage summary per competition */
export interface CompetitionCoverage {
  competition: ProCompetition;
  total: number;
  youtubeLive: number;
  linkOnly: number;
  unresolved: number;
}

export function getCoverageReport(): CompetitionCoverage[] {
  return PRO_COMPETITIONS.filter(c => c.kind === 'league').map(comp => {
    const clubs = getClubsByCompetition(comp.slug);
    return {
      competition: comp,
      total: clubs.length,
      youtubeLive: clubs.filter(c => c.status === 'youtube-live').length,
      linkOnly: clubs.filter(c => c.status === 'link-only').length,
      unresolved: clubs.filter(c => c.status === 'unresolved').length,
    };
  });
}
