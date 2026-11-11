/**
 * PpCommunityTab — Community tab for the Parent Portal.
 *
 * - Full multi-region community catalog (mirrors the public /community page)
 * - Region selector: Colorado, Arizona, SoCal, NorCal, Oregon, Washington, Nevada
 * - Vendor section: UNDER CONSTRUCTION — text names only
 * - Family Network tab: accepted/pending guardian cards + activity feed
 * - Followed Updates tab: 4 illustrative demo cards + End of updates marker
 */

import { useState } from 'react';
import {
  Users, Globe, Bell,
  Clock, UserPlus, Info, ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { PpCard, PpButton, PpBadge, PpSectionHeading } from './PpPrimitives';
import PpCommunityFeed from './PpCommunityFeed';

// ─── Sub-tab types ────────────────────────────────────────────────────────────

type CommunitySubTab = 'community' | 'network' | 'updates';

// ─── Community catalog ────────────────────────────────────────────────────────
// Full multi-region catalog — mirrors the public /community page.
// Kept as static data (not virtual:content) since it is a curated reference
// catalog, not user-editable page copy.

interface CommunityResource {
  id: string;
  tag: string;
  name: string;
  description: string;
  url: string;
}

interface CommunityCategory {
  id: string;
  label: string;
  resources: CommunityResource[];
}

interface CommunityRegion {
  id: string;
  label: string;
  categories: CommunityCategory[];
}

const COMMUNITY_REGIONS: CommunityRegion[] = [
  {
    id: 'region-colorado', label: 'Colorado',
    categories: [
      { id: 'co-assoc', label: 'State soccer association', resources: [
        { id: 'co-csa', tag: 'State association', name: 'Colorado Soccer Association', description: 'The governing body for soccer in Colorado. Find league information, club registration, and coaching resources.', url: 'https://www.coloradosoccer.org/' },
        { id: 'co-ussf', tag: 'National federation', name: 'U.S. Soccer Federation', description: 'National governing body for soccer in the United States.', url: 'https://www.ussoccer.com/' },
        { id: 'co-usys', tag: 'Youth governing body', name: 'US Youth Soccer', description: 'The largest youth sports organization in the US — player registration, leagues, and tournaments.', url: 'https://www.usyouthsoccer.org/' },
      ]},
      { id: 'co-rec', label: 'Park & rec programs', resources: [
        { id: 'co-dpr', tag: 'City-run youth sports', name: 'Denver Parks & Recreation', description: 'Recreational soccer programs and field reservations for Denver families.', url: 'https://www.denveryouthsports.org/soccer' },
        { id: 'co-aurora', tag: 'City recreation', name: 'Aurora Parks & Recreation', description: 'Youth soccer leagues and recreational programs in Aurora.', url: 'https://www.auroragov.org/things_to_do/parks___recreation/sports' },
        { id: 'co-sspr', tag: 'Recreation district', name: 'South Suburban Parks & Recreation', description: 'Youth soccer programs for the south Denver metro area.', url: 'https://www.southsuburbansports.com/youth-soccer' },
        { id: 'co-boulder', tag: 'City recreation', name: 'Boulder Parks & Recreation', description: 'Youth soccer and recreational sports in Boulder.', url: 'https://bouldercolorado.gov/services/sports' },
        { id: 'co-parker', tag: 'Town-run youth sports', name: 'Parker Parks & Recreation', description: 'Youth soccer leagues and programs in Parker, CO.', url: 'https://www.parkerrec.com/1166/Youth-Soccer' },
      ]},
      { id: 'co-coaching', label: 'Coaching programs', resources: [
        { id: 'co-csa-coach', tag: 'State coaching education', name: 'CSA coaching education', description: 'Colorado Soccer Association coaching licenses and education programs.', url: 'https://www.coloradosoccer.org/coaches' },
        { id: 'co-ussf-learn', tag: 'National coaching education', name: 'U.S. Soccer Learning Center', description: 'Online coaching courses and licensing from U.S. Soccer.', url: 'https://learning.ussoccer.com/' },
        { id: 'co-usc', tag: 'Coaching association', name: 'United Soccer Coaches', description: 'Professional development, clinics, and resources for soccer coaches.', url: 'https://unitedsoccercoaches.org/' },
      ]},
      { id: 'co-financial', label: 'Financial assistance', resources: [
        { id: 'co-eks', tag: 'Youth sports fee assistance', name: 'Every Kid Sports Pass', description: 'Free passes for youth from low-income families to participate in organized sports.', url: 'https://pass.everykidsports.org/' },
        { id: 'co-cu-scholar', tag: 'Club-specific assistance', name: 'Colorado United scholarships', description: 'Scholarship and financial assistance programs from Colorado United Soccer.', url: 'https://www.coloradounitedsoccer.com/scholorships' },
        { id: 'co-topsoccer', tag: 'Inclusive soccer', name: 'Colorado TOPSoccer', description: 'Adaptive soccer program for players with physical and cognitive disabilities.', url: 'https://www.coloradosoccer.org/topsoccer' },
        { id: 'co-safesport', tag: 'Player safety', name: 'SafeSport parent resources', description: 'Resources for parents on athlete safety, abuse prevention, and reporting.', url: 'https://uscenterforsafesport.org/parents/' },
      ]},
    ],
  },
  {
    id: 'region-arizona', label: 'Arizona',
    categories: [
      { id: 'az-assoc', label: 'State soccer association', resources: [
        { id: 'az-asa', tag: 'State association', name: 'Arizona Soccer Association', description: 'Governing body for youth and adult soccer in Arizona.', url: 'https://www.arizonasoccer.org/' },
        { id: 'az-ayso', tag: 'Youth recreational soccer', name: 'AYSO Arizona regions', description: 'American Youth Soccer Organization recreational programs across Arizona.', url: 'https://www.ayso.org/find-a-region' },
        { id: 'az-usys', tag: 'Youth governing body', name: 'US Youth Soccer', description: 'National youth soccer organization — player registration and tournaments.', url: 'https://www.usyouthsoccer.org/' },
      ]},
      { id: 'az-rec', label: 'Park & rec programs', resources: [
        { id: 'az-phoenix', tag: 'City recreation', name: 'Phoenix Parks & Recreation', description: 'Youth sports and soccer programs in Phoenix.', url: 'https://www.phoenix.gov/parks/sports/youth' },
        { id: 'az-mesa', tag: 'City recreation', name: 'Mesa Parks & Recreation', description: 'Youth soccer and recreational sports in Mesa.', url: 'https://www.mesaparks.com/parks-facilities/sports/youth-sports' },
        { id: 'az-scottsdale', tag: 'City recreation', name: 'Scottsdale Parks & Recreation', description: 'Youth sports programs in Scottsdale.', url: 'https://www.scottsdaleaz.gov/parks/recreation-programs' },
        { id: 'az-tucson', tag: 'City recreation', name: 'Tucson Parks & Recreation', description: 'Youth soccer and sports programs in Tucson.', url: 'https://www.tucsonaz.gov/parks/sports-and-recreation' },
        { id: 'az-chandler', tag: 'City recreation', name: 'Chandler Parks & Recreation', description: 'Youth sports and soccer in Chandler.', url: 'https://www.chandleraz.gov/residents/parks-recreation/sports' },
      ]},
      { id: 'az-coaching', label: 'Coaching programs', resources: [
        { id: 'az-asa-coach', tag: 'State coaching education', name: 'Arizona Soccer Association — coaches', description: 'Coaching licenses and education from the Arizona Soccer Association.', url: 'https://www.arizonasoccer.org/coaches' },
        { id: 'az-ussf-learn', tag: 'National coaching education', name: 'U.S. Soccer Learning Center', description: 'Online coaching courses and licensing from U.S. Soccer.', url: 'https://learning.ussoccer.com/' },
        { id: 'az-usc', tag: 'Coaching association', name: 'United Soccer Coaches', description: 'Professional development and resources for soccer coaches.', url: 'https://unitedsoccercoaches.org/' },
      ]},
      { id: 'az-financial', label: 'Financial assistance', resources: [
        { id: 'az-eks', tag: 'Youth sports fee assistance', name: 'Every Kid Sports Pass', description: 'Free passes for youth from low-income families to participate in organized sports.', url: 'https://pass.everykidsports.org/' },
        { id: 'az-topsoccer', tag: 'Inclusive soccer', name: 'TOPSoccer — Arizona', description: 'Adaptive soccer program for players with disabilities in Arizona.', url: 'https://www.arizonasoccer.org/topsoccer' },
        { id: 'az-safesport', tag: 'Player safety', name: 'SafeSport parent resources', description: 'Resources for parents on athlete safety and abuse prevention.', url: 'https://uscenterforsafesport.org/parents/' },
      ]},
    ],
  },
  {
    id: 'region-socal', label: 'Southern California',
    categories: [
      { id: 'socal-assoc', label: 'State soccer association', resources: [
        { id: 'socal-calsouth', tag: 'State association — south', name: 'Cal South (CYSA-South)', description: 'Governing body for youth soccer in Southern California.', url: 'https://www.calsouth.com/' },
        { id: 'socal-csas', tag: 'State association — adult', name: 'California Soccer Association South', description: 'Adult soccer association for Southern California.', url: 'https://www.csasoccer.com/' },
        { id: 'socal-usys', tag: 'Youth governing body', name: 'US Youth Soccer', description: 'National youth soccer organization.', url: 'https://www.usyouthsoccer.org/' },
      ]},
      { id: 'socal-rec', label: 'Park & rec programs', resources: [
        { id: 'socal-la', tag: 'City recreation', name: 'LA City Parks & Recreation', description: 'Youth soccer programs across Los Angeles city parks.', url: 'https://www.laparks.org/sports/soccer' },
        { id: 'socal-sd', tag: 'City recreation', name: 'San Diego Parks & Recreation', description: 'Youth soccer and sports programs in San Diego.', url: 'https://www.sandiego.gov/park-and-recreation/activities/sports' },
        { id: 'socal-lb', tag: 'City recreation', name: 'Long Beach Parks & Recreation', description: 'Youth sports programs in Long Beach.', url: 'https://www.longbeach.gov/park/recreation-programs/sports/' },
        { id: 'socal-anaheim', tag: 'City recreation', name: 'Anaheim Community Services', description: 'Youth sports and soccer in Anaheim.', url: 'https://www.anaheim.net/1120/Youth-Sports' },
        { id: 'socal-ayso', tag: 'Youth recreational soccer', name: 'AYSO Southern California regions', description: 'AYSO recreational soccer programs across Southern California.', url: 'https://www.ayso.org/find-a-region' },
      ]},
      { id: 'socal-coaching', label: 'Coaching programs', resources: [
        { id: 'socal-calsouth-coach', tag: 'State coaching education', name: 'Cal South — coaches', description: 'Coaching licenses and education from Cal South.', url: 'https://www.calsouth.com/coaches' },
        { id: 'socal-ussf-learn', tag: 'National coaching education', name: 'U.S. Soccer Learning Center', description: 'Online coaching courses from U.S. Soccer.', url: 'https://learning.ussoccer.com/' },
        { id: 'socal-usc', tag: 'Coaching association', name: 'United Soccer Coaches', description: 'Professional development for soccer coaches.', url: 'https://unitedsoccercoaches.org/' },
      ]},
      { id: 'socal-financial', label: 'Financial assistance', resources: [
        { id: 'socal-eks', tag: 'Youth sports fee assistance', name: 'Every Kid Sports Pass', description: 'Free passes for youth from low-income families.', url: 'https://pass.everykidsports.org/' },
        { id: 'socal-calsouth-assist', tag: 'Association assistance', name: 'Cal South player assistance', description: 'Financial assistance programs from Cal South.', url: 'https://www.calsouth.com/contact' },
        { id: 'socal-topsoccer', tag: 'Inclusive soccer', name: 'TOPSoccer — Southern California', description: 'Adaptive soccer for players with disabilities in SoCal.', url: 'https://www.calsouth.com/topsoccer' },
        { id: 'socal-safesport', tag: 'Player safety', name: 'SafeSport parent resources', description: 'Athlete safety resources for parents.', url: 'https://uscenterforsafesport.org/parents/' },
      ]},
    ],
  },
  {
    id: 'region-norcal', label: 'Northern California',
    categories: [
      { id: 'norcal-assoc', label: 'State soccer association', resources: [
        { id: 'norcal-calnorth', tag: 'State association — north', name: 'Cal North (CYSA-North)', description: 'Governing body for youth soccer in Northern California.', url: 'https://www.calnorth.org/' },
        { id: 'norcal-csan', tag: 'State association — adult', name: 'California Soccer Association North', description: 'Adult soccer association for Northern California.', url: 'https://www.csanorth.org/' },
        { id: 'norcal-usys', tag: 'Youth governing body', name: 'US Youth Soccer', description: 'National youth soccer organization.', url: 'https://www.usyouthsoccer.org/' },
      ]},
      { id: 'norcal-rec', label: 'Park & rec programs', resources: [
        { id: 'norcal-sf', tag: 'City recreation', name: 'SF Recreation & Parks', description: 'Youth sports and soccer programs in San Francisco.', url: 'https://sfrecpark.org/programs/sports-and-athletics' },
        { id: 'norcal-sj', tag: 'City recreation', name: 'San Jose Parks & Recreation', description: 'Youth soccer and sports in San Jose.', url: 'https://www.sanjoseca.gov/your-government/departments-offices/parks-recreation-neighborhood-services' },
        { id: 'norcal-oak', tag: 'City recreation', name: 'Oakland Recreation & Parks', description: 'Youth sports programs in Oakland.', url: 'https://www.oaklandca.gov/topics/parks-recreation' },
        { id: 'norcal-sac', tag: 'City recreation', name: 'Sacramento Parks & Recreation', description: 'Youth soccer and sports in Sacramento.', url: 'https://www.cityofsacramento.org/parks-recreation/sports' },
        { id: 'norcal-ayso', tag: 'Youth recreational soccer', name: 'AYSO Northern California regions', description: 'AYSO recreational soccer across Northern California.', url: 'https://www.ayso.org/find-a-region' },
      ]},
      { id: 'norcal-coaching', label: 'Coaching programs', resources: [
        { id: 'norcal-calnorth-coach', tag: 'State coaching education', name: 'Cal North — coaches', description: 'Coaching licenses and education from Cal North.', url: 'https://www.calnorth.org/coaches' },
        { id: 'norcal-ussf-learn', tag: 'National coaching education', name: 'U.S. Soccer Learning Center', description: 'Online coaching courses from U.S. Soccer.', url: 'https://learning.ussoccer.com/' },
        { id: 'norcal-usc', tag: 'Coaching association', name: 'United Soccer Coaches', description: 'Professional development for soccer coaches.', url: 'https://unitedsoccercoaches.org/' },
      ]},
      { id: 'norcal-financial', label: 'Financial assistance', resources: [
        { id: 'norcal-eks', tag: 'Youth sports fee assistance', name: 'Every Kid Sports Pass', description: 'Free passes for youth from low-income families.', url: 'https://pass.everykidsports.org/' },
        { id: 'norcal-calnorth-assist', tag: 'Association assistance', name: 'Cal North player assistance', description: 'Financial assistance from Cal North.', url: 'https://www.calnorth.org/contact' },
        { id: 'norcal-topsoccer', tag: 'Inclusive soccer', name: 'TOPSoccer — Northern California', description: 'Adaptive soccer for players with disabilities in NorCal.', url: 'https://www.calnorth.org/topsoccer' },
        { id: 'norcal-safesport', tag: 'Player safety', name: 'SafeSport parent resources', description: 'Athlete safety resources for parents.', url: 'https://uscenterforsafesport.org/parents/' },
      ]},
    ],
  },
  {
    id: 'region-oregon', label: 'Oregon',
    categories: [
      { id: 'or-assoc', label: 'State soccer association', resources: [
        { id: 'or-oysa', tag: 'State association', name: 'Oregon Youth Soccer Association', description: 'Governing body for youth soccer in Oregon.', url: 'https://www.oregonyouthsoccer.org/' },
        { id: 'or-osa', tag: 'Adult state association', name: 'Oregon Soccer Association', description: 'Adult soccer association for Oregon.', url: 'https://www.oregonsoccer.com/' },
        { id: 'or-usys', tag: 'Youth governing body', name: 'US Youth Soccer', description: 'National youth soccer organization.', url: 'https://www.usyouthsoccer.org/' },
      ]},
      { id: 'or-rec', label: 'Park & rec programs', resources: [
        { id: 'or-portland', tag: 'City recreation', name: 'Portland Parks & Recreation', description: 'Youth sports and soccer programs in Portland.', url: 'https://www.portland.gov/parks/sports-and-recreation' },
        { id: 'or-eugene', tag: 'City recreation', name: 'Eugene Parks & Recreation', description: 'Youth soccer and sports in Eugene.', url: 'https://www.eugene-or.gov/2066/Youth-Sports' },
        { id: 'or-salem', tag: 'City recreation', name: 'Salem Parks & Recreation', description: 'Youth sports programs in Salem.', url: 'https://www.cityofsalem.net/community/parks-recreation/youth-sports' },
        { id: 'or-bend', tag: 'City recreation', name: 'Bend Park & Recreation District', description: 'Youth soccer programs in Bend.', url: 'https://www.bendparksandrec.org/activity/soccer/' },
        { id: 'or-ayso', tag: 'Youth recreational soccer', name: 'AYSO Oregon regions', description: 'AYSO recreational soccer across Oregon.', url: 'https://www.ayso.org/find-a-region' },
      ]},
      { id: 'or-coaching', label: 'Coaching programs', resources: [
        { id: 'or-oysa-coach', tag: 'State coaching education', name: 'OYSA — coaches', description: 'Coaching licenses and education from OYSA.', url: 'https://www.oregonyouthsoccer.org/coaches' },
        { id: 'or-ussf-learn', tag: 'National coaching education', name: 'U.S. Soccer Learning Center', description: 'Online coaching courses from U.S. Soccer.', url: 'https://learning.ussoccer.com/' },
        { id: 'or-usc', tag: 'Coaching association', name: 'United Soccer Coaches', description: 'Professional development for soccer coaches.', url: 'https://unitedsoccercoaches.org/' },
      ]},
      { id: 'or-financial', label: 'Financial assistance', resources: [
        { id: 'or-eks', tag: 'Youth sports fee assistance', name: 'Every Kid Sports Pass', description: 'Free passes for youth from low-income families.', url: 'https://pass.everykidsports.org/' },
        { id: 'or-oysa-assist', tag: 'Association assistance', name: 'OYSA player assistance', description: 'Financial assistance from OYSA.', url: 'https://www.oregonyouthsoccer.org/contact' },
        { id: 'or-topsoccer', tag: 'Inclusive soccer', name: 'TOPSoccer — Oregon', description: 'Adaptive soccer for players with disabilities in Oregon.', url: 'https://www.oregonyouthsoccer.org/topsoccer' },
        { id: 'or-safesport', tag: 'Player safety', name: 'SafeSport parent resources', description: 'Athlete safety resources for parents.', url: 'https://uscenterforsafesport.org/parents/' },
      ]},
    ],
  },
  {
    id: 'region-washington', label: 'Washington',
    categories: [
      { id: 'wa-assoc', label: 'State soccer association', resources: [
        { id: 'wa-wys', tag: 'State association', name: 'Washington Youth Soccer', description: 'Governing body for youth soccer in Washington state.', url: 'https://www.washingtonyouthsoccer.org/' },
        { id: 'wa-wssa', tag: 'Adult state association', name: 'Washington State Soccer Association', description: 'Adult soccer association for Washington.', url: 'https://www.wssa.net/' },
        { id: 'wa-usys', tag: 'Youth governing body', name: 'US Youth Soccer', description: 'National youth soccer organization.', url: 'https://www.usyouthsoccer.org/' },
      ]},
      { id: 'wa-rec', label: 'Park & rec programs', resources: [
        { id: 'wa-seattle', tag: 'City recreation', name: 'Seattle Parks & Recreation', description: 'Youth soccer and sports programs in Seattle.', url: 'https://www.seattle.gov/parks/find/sports-and-recreation/soccer' },
        { id: 'wa-tacoma', tag: 'City recreation', name: 'Metro Parks Tacoma', description: 'Youth sports programs in Tacoma.', url: 'https://www.metroparkstacoma.org/sports/' },
        { id: 'wa-spokane', tag: 'City recreation', name: 'Spokane Parks & Recreation', description: 'Youth soccer and sports in Spokane.', url: 'https://my.spokanecity.org/parksrec/sports/' },
        { id: 'wa-bellevue', tag: 'City recreation', name: 'Bellevue Parks & Community Services', description: 'Youth sports programs in Bellevue.', url: 'https://bellevuewa.gov/city-government/departments/parks/recreation' },
        { id: 'wa-ayso', tag: 'Youth recreational soccer', name: 'AYSO Washington regions', description: 'AYSO recreational soccer across Washington.', url: 'https://www.ayso.org/find-a-region' },
      ]},
      { id: 'wa-coaching', label: 'Coaching programs', resources: [
        { id: 'wa-wys-coach', tag: 'State coaching education', name: 'Washington Youth Soccer — coaches', description: 'Coaching licenses and education from Washington Youth Soccer.', url: 'https://www.washingtonyouthsoccer.org/coaches' },
        { id: 'wa-ussf-learn', tag: 'National coaching education', name: 'U.S. Soccer Learning Center', description: 'Online coaching courses from U.S. Soccer.', url: 'https://learning.ussoccer.com/' },
        { id: 'wa-usc', tag: 'Coaching association', name: 'United Soccer Coaches', description: 'Professional development for soccer coaches.', url: 'https://unitedsoccercoaches.org/' },
      ]},
      { id: 'wa-financial', label: 'Financial assistance', resources: [
        { id: 'wa-eks', tag: 'Youth sports fee assistance', name: 'Every Kid Sports Pass', description: 'Free passes for youth from low-income families.', url: 'https://pass.everykidsports.org/' },
        { id: 'wa-wys-assist', tag: 'Association assistance', name: 'Washington Youth Soccer — assistance', description: 'Financial assistance from Washington Youth Soccer.', url: 'https://www.washingtonyouthsoccer.org/contact' },
        { id: 'wa-topsoccer', tag: 'Inclusive soccer', name: 'TOPSoccer — Washington', description: 'Adaptive soccer for players with disabilities in Washington.', url: 'https://www.washingtonyouthsoccer.org/topsoccer' },
        { id: 'wa-safesport', tag: 'Player safety', name: 'SafeSport parent resources', description: 'Athlete safety resources for parents.', url: 'https://uscenterforsafesport.org/parents/' },
      ]},
    ],
  },
  {
    id: 'region-nevada', label: 'Nevada',
    categories: [
      { id: 'nv-assoc', label: 'State soccer association', resources: [
        { id: 'nv-nysa', tag: 'State association', name: 'Nevada Youth Soccer Association', description: 'Governing body for youth soccer in Nevada.', url: 'https://www.nevadayouthsoccer.org/' },
        { id: 'nv-nsa', tag: 'Adult state association', name: 'Nevada Soccer Association', description: 'Adult soccer association for Nevada.', url: 'https://www.nevadasoccer.org/' },
        { id: 'nv-usys', tag: 'Youth governing body', name: 'US Youth Soccer', description: 'National youth soccer organization.', url: 'https://www.usyouthsoccer.org/' },
      ]},
      { id: 'nv-rec', label: 'Park & rec programs', resources: [
        { id: 'nv-lv', tag: 'City recreation', name: 'Las Vegas Parks & Recreation', description: 'Youth soccer and sports programs in Las Vegas.', url: 'https://www.lasvegasnevada.gov/Residents/Parks-Recreation/Sports' },
        { id: 'nv-henderson', tag: 'City recreation', name: 'Henderson Parks & Recreation', description: 'Youth sports programs in Henderson.', url: 'https://www.cityofhenderson.com/parks-recreation/sports-athletics' },
        { id: 'nv-reno', tag: 'City recreation', name: 'Reno Parks & Recreation', description: 'Youth soccer and sports in Reno.', url: 'https://www.reno.gov/government/departments/parks-recreation' },
        { id: 'nv-clark', tag: 'County recreation', name: 'Clark County Parks & Recreation', description: 'Youth sports programs in Clark County.', url: 'https://www.clarkcountynv.gov/government/departments/parks__recreation' },
        { id: 'nv-ayso', tag: 'Youth recreational soccer', name: 'AYSO Nevada regions', description: 'AYSO recreational soccer across Nevada.', url: 'https://www.ayso.org/find-a-region' },
      ]},
      { id: 'nv-coaching', label: 'Coaching programs', resources: [
        { id: 'nv-nysa-coach', tag: 'State coaching education', name: 'Nevada Youth Soccer — coaches', description: 'Coaching licenses and education from Nevada Youth Soccer.', url: 'https://www.nevadayouthsoccer.org/coaches' },
        { id: 'nv-ussf-learn', tag: 'National coaching education', name: 'U.S. Soccer Learning Center', description: 'Online coaching courses from U.S. Soccer.', url: 'https://learning.ussoccer.com/' },
        { id: 'nv-usc', tag: 'Coaching association', name: 'United Soccer Coaches', description: 'Professional development for soccer coaches.', url: 'https://unitedsoccercoaches.org/' },
      ]},
      { id: 'nv-financial', label: 'Financial assistance', resources: [
        { id: 'nv-eks', tag: 'Youth sports fee assistance', name: 'Every Kid Sports Pass', description: 'Free passes for youth from low-income families.', url: 'https://pass.everykidsports.org/' },
        { id: 'nv-nysa-assist', tag: 'Association assistance', name: 'Nevada Youth Soccer — assistance', description: 'Financial assistance from Nevada Youth Soccer.', url: 'https://www.nevadayouthsoccer.org/contact' },
        { id: 'nv-topsoccer', tag: 'Inclusive soccer', name: 'TOPSoccer — Nevada', description: 'Adaptive soccer for players with disabilities in Nevada.', url: 'https://www.nevadayouthsoccer.org/topsoccer' },
        { id: 'nv-safesport', tag: 'Player safety', name: 'SafeSport parent resources', description: 'Athlete safety resources for parents.', url: 'https://uscenterforsafesport.org/parents/' },
      ]},
    ],
  },
];

const VENDOR_NAMES = [
  'Soccer.com', 'Nike', 'Adidas', 'Capelli Sport', 'New Balance',
  'Mizuno', 'Reusch', 'Uhlsport', 'JustKeepers', 'TOCA Soccer',
  'Soccer IQ', 'Sogility',
];

// ─── Community sub-tab ────────────────────────────────────────────────────────

function CommunitySubTabContent() {
  const [selectedRegion, setSelectedRegion] = useState(COMMUNITY_REGIONS[0].id);
  const region = COMMUNITY_REGIONS.find(r => r.id === selectedRegion) ?? COMMUNITY_REGIONS[0];

  return (
    <div className="space-y-5">
      {/* Region selector */}
      <div>
        <p className="text-xs font-medium mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }}>Region</p>
        <div className="flex flex-wrap gap-2">
          {COMMUNITY_REGIONS.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelectedRegion(r.id)}
              className="text-xs rounded-full px-3 py-1.5 border font-medium transition-colors"
              style={selectedRegion === r.id
                ? { background: 'hsl(var(--pp-navy))', color: 'hsl(var(--pp-white))', borderColor: 'hsl(var(--pp-navy))' }
                : { background: 'transparent', color: 'hsl(var(--pp-text-muted))', borderColor: 'hsl(var(--pp-border))' }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Categories for selected region */}
      {region.categories.map(cat => (
        <div key={cat.id}>
          <PpSectionHeading>{cat.label}</PpSectionHeading>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cat.resources.map(res => (
              <div
                key={res.id}
                className="rounded-2xl border p-4 space-y-2"
                style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-card-bg))' }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'hsl(var(--pp-text))', fontFamily: 'var(--font-heading)' }}>
                      {res.name}
                    </p>
                    <PpBadge variant="default">{res.tag}</PpBadge>
                  </div>
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-full shrink-0 transition-colors"
                    style={{ color: 'hsl(var(--pp-blue))' }}
                    aria-label={`Visit ${res.name}`}
                  >
                    <ExternalLink size={14} />
                  </a>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'hsl(var(--pp-text-muted))' }}>
                  {res.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Vendor section — UNDER CONSTRUCTION */}
      <PpCard>
        <div className="flex items-center gap-2 mb-3">
          <PpSectionHeading>Gear &amp; training vendors</PpSectionHeading>
          <span
            className="text-[9px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5"
            style={{ background: 'hsl(var(--pp-badge-warning-bg))', color: 'hsl(var(--pp-badge-warning-fg))' }}
          >
            Under construction
          </span>
        </div>
        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-4 text-xs"
          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
        >
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            Vendor links and shopping integrations are not yet available. The following vendors are listed for reference only — no purchasing or booking is possible from this page.
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {VENDOR_NAMES.map(name => (
            <span
              key={name}
              className="text-xs rounded-full px-3 py-1 border"
              style={{ borderColor: 'hsl(var(--pp-border))', color: 'hsl(var(--pp-text-muted))' }}
            >
              {name}
            </span>
          ))}
        </div>
      </PpCard>
    </div>
  );
}

// ─── Network sub-tab ──────────────────────────────────────────────────────────

function NetworkSubTabContent() {
  return (
    <div className="space-y-5">
      {/* Guardians */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <PpSectionHeading>Family guardians</PpSectionHeading>
          <PpButton variant="outline" size="sm">
            <UserPlus size={12} />
            Invite guardian
          </PpButton>
        </div>

        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2.5 mb-3 text-xs"
          style={{ background: 'hsl(var(--pp-blue-light))', color: 'hsl(var(--pp-navy))' }}
        >
          <Info size={12} className="mt-0.5 shrink-0" />
          <span>
            Guardians can view player profiles and calendar events you share with them. They cannot edit profiles or make changes. Manage permissions in the Settings tab.
          </span>
        </div>

        <div className="space-y-3">
          {/* Guardians — no hardcoded demo data */}
          <div
            className="rounded-xl border px-4 py-6 text-center"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
          >
            <Users size={22} className="mx-auto mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }} />
            <p className="text-sm font-semibold mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
              No guardians yet
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Guardian invitations will appear here once the sharing feature is enabled.
            </p>
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div>
        <PpSectionHeading>Family activity</PpSectionHeading>
        <div className="space-y-2">
          {/* Activity — no hardcoded demo data */}
          <div
            className="rounded-xl border px-4 py-6 text-center"
            style={{ borderColor: 'hsl(var(--pp-border))', background: 'hsl(var(--pp-page-bg))' }}
          >
            <Clock size={22} className="mx-auto mb-2" style={{ color: 'hsl(var(--pp-text-muted))' }} />
            <p className="text-sm font-semibold mb-1" style={{ color: 'hsl(var(--pp-text))' }}>
              No activity yet
            </p>
            <p className="text-xs" style={{ color: 'hsl(var(--pp-text-muted))' }}>
              Guardian and family activity will appear here once sharing is active.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PpCommunityTab() {
  const [subTab, setSubTab] = useState<CommunitySubTab>('community');

  const SUB_TABS: { id: CommunitySubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'community', label: 'Community', icon: <Globe size={13} /> },
    { id: 'network',   label: 'Family Network', icon: <Users size={13} /> },
    { id: 'updates',   label: 'Followed Updates', icon: <Bell size={13} /> },
  ];

  return (
    <div className="space-y-5">
      {/* Sub-tab nav */}
      <div
        className="flex gap-1 rounded-xl p-1"
        style={{ background: 'hsl(var(--pp-blue-light))' }}
      >
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors"
            style={{
              background: subTab === t.id ? 'hsl(var(--pp-card-bg))' : 'transparent',
              color: subTab === t.id ? 'hsl(var(--pp-navy))' : 'hsl(var(--pp-text-muted))',
              boxShadow: subTab === t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {subTab === 'community' && <CommunitySubTabContent />}
      {subTab === 'network'   && <NetworkSubTabContent />}
      {subTab === 'updates'   && <PpCommunityFeed />}
    </div>
  );
}
