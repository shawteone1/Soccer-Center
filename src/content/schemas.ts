import { z } from 'zod';
export const schemas = {
  pages: {
    home: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subtext": z.string(),
        "cta": z.string()
      }),
      "mission": z.object({
        "label": z.string(),
        "headline": z.string(),
        "body": z.string()
      }),
      "welcome": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "body": z.string(),
        "cta": z.string()
      }),
      "about": z.object({
        "eyebrow": z.string(),
        "siteTitle": z.string(),
        "paragraphs": z.array(z.object({
          "id": z.string(),
          "text": z.string()
        })),
        "signatureName": z.string(),
        "signatureTitle": z.string(),
        "regionCta": z.string()
      }),
      "contact": z.object({
        "headline": z.string(),
        "subheading": z.string(),
        "recaptchaNote": z.string()
      }),
      "newsletter": z.object({
        "headline": z.string(),
        "body": z.string()
      })
    }),
    soccer_directory: z.object({
      "eyebrow": z.string(),
      "headline": z.string(),
      "subheadline": z.string(),
      "dropdownPlaceholder": z.string(),
      "emptyStateHeading": z.string(),
      "emptyStateBody": z.string()
    }),
    resources: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subtext": z.string()
      }),
      "note": z.string(),
      "categories": z.array(z.object({
        "id": z.string(),
        "title": z.string(),
        "type": z.string(),
        "articles": z.array(z.object({
          "id": z.string(),
          "tag": z.string(),
          "heading": z.string(),
          "body": z.string(),
          "linkLabel": z.string(),
          "url": z.string()
        })),
        "pubs": z.array(z.unknown()),
        "tvRows": z.array(z.unknown()),
        "tvIntro": z.string(),
        "tvOutro": z.string(),
        "tvTimingTip": z.string()
      }))
    }),
    community: z.object({
      "eyebrow": z.string(),
      "headline": z.string(),
      "body": z.string(),
      "datasetNote": z.string(),
      "regions": z.array(z.object({
        "id": z.string(),
        "label": z.string(),
        "categories": z.array(z.object({
          "id": z.string(),
          "label": z.string(),
          "resources": z.array(z.object({
            "id": z.string(),
            "tag": z.string(),
            "name": z.string(),
            "description": z.string(),
            "linkLabel": z.string(),
            "url": z.string()
          }))
        }))
      })),
      "inclusiveSoccer": z.object({
        "sectionTitle": z.string(),
        "sectionDescription": z.string(),
        "categories": z.record(z.object({
          "label": z.string(),
          "description": z.string()
        })),
        "listings": z.array(z.object({
          "id": z.string(),
          "regionSlug": z.string(),
          "name": z.string(),
          "category": z.string(),
          "serviceArea": z.string(),
          "description": z.string(),
          "website": z.string(),
          "email": z.string().nullable(),
          "phone": z.string().nullable(),
          "eligibility": z.string().nullable(),
          "listingType": z.string(),
          "availability": z.string(),
          "officialSourceUrl": z.string(),
          "lastCheckedAt": z.string().nullable(),
          "lastVerifiedAt": z.string().nullable(),
          "adminNote": z.string().nullable(),
          "adminStatus": z.string()
        }))
      }).optional()
    }),
    fanzone: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "headline": z.string(),
        "subtext": z.string()
      }),
      "note": z.string(),
      "tvTitle": z.string(),
      "tvIntro": z.string(),
      "tvOutro": z.string(),
      "tvTimingTip": z.string(),
      "tvRows": z.array(z.object({
        "id": z.string(),
        "competition": z.string(),
        "streaming": z.string(),
        "tv": z.string(),
        "notes": z.string(),
        "link1Label": z.string(),
        "link1Url": z.string(),
        "link2Label": z.string(),
        "link2Url": z.string()
      })),
      "pubsTitle": z.string(),
      "pubsIntro": z.string(),
      "pubsOutro": z.string(),
      "pubRegions": z.array(z.object({
        "id": z.string(),
        "label": z.string(),
        "pubs": z.array(z.object({
          "id": z.string(),
          "tag": z.string(),
          "name": z.string(),
          "description": z.string(),
          "address": z.string(),
          "venueUrl": z.string(),
          "mapsUrl": z.string()
        }))
      })),
      "fansTitle": z.string(),
      "fansOutro": z.string(),
      "fanGroups": z.array(z.object({
        "id": z.string(),
        "tag": z.string(),
        "heading": z.string(),
        "body": z.string(),
        "linkLabel": z.string(),
        "url": z.string(),
        "barName": z.string(),
        "barAddress": z.string(),
        "barUrl": z.string()
      })),
      "jumpSections": z.array(z.object({
        "id": z.string(),
        "label": z.string()
      })),
      "plSupportersTitle": z.string(),
      "plSupportersIntro": z.string(),
      "plSupportersNote": z.string(),
      "plSupportersGroups": z.array(z.object({
        "id": z.string(),
        "plTeam": z.string(),
        "name": z.string(),
        "area": z.string(),
        "description": z.string(),
        "venueLabel": z.string(),
        "venueNote": z.string(),
        "links": z.array(z.object({
          "label": z.string(),
          "url": z.string(),
          "id": z.string()
        }))
      }))
    }),
    teams: z.object({
      "eyebrow": z.string(),
      "headline": z.string(),
      "body": z.string(),
      "proTitle": z.string(),
      "proIntro": z.string(),
      "collegeTitle": z.string(),
      "collegeIntro": z.string(),
      "collegeNote": z.string(),
      "regions": z.array(z.object({
        "id": z.string(),
        "name": z.string(),
        "proTeams": z.array(z.object({
          "id": z.string(),
          "tier": z.string(),
          "name": z.string(),
          "location": z.string(),
          "venue": z.string(),
          "description": z.string(),
          "linkLabel": z.string(),
          "url": z.string()
        })),
        "collegeTeams": z.array(z.object({
          "id": z.string(),
          "division": z.string(),
          "conference": z.string(),
          "name": z.string(),
          "school": z.string(),
          "location": z.string(),
          "description": z.string(),
          "linkLabel": z.string(),
          "url": z.string()
        }))
      }))
    }),
    tryouts: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "title": z.string(),
        "subtitle": z.string()
      }),
      "liveScanner": z.object({
        "title": z.string(),
        "description": z.string(),
        "emptyTitle": z.string(),
        "emptyNote": z.string()
      }),
      "submitCta": z.object({
        "title": z.string(),
        "body": z.string(),
        "buttonLabel": z.string()
      })
    }),
    my_soccer: z.object({
      "hero": z.object({
        "title": z.string(),
        "subtitle": z.string()
      }),
      "feeds": z.object({
        "emptyMessage": z.string(),
        "addLabel": z.string(),
        "sectionTitle": z.string()
      }),
      "events": z.object({
        "noFeedsMessage": z.string(),
        "noEventsMessage": z.string()
      }),
      "account": z.object({
        "sectionTitle": z.string()
      }),
      "myFeed": z.object({
        "tabLabel": z.string(),
        "heading": z.string(),
        "emptyHeading": z.string(),
        "emptyBody": z.string(),
        "emptyCtaLabel": z.string(),
        "filterAll": z.string(),
        "filterHighlights": z.string(),
        "filterTraining": z.string(),
        "filterInterviews": z.string(),
        "filterFeatures": z.string(),
        "loadMoreLabel": z.string(),
        "watchLabel": z.string(),
        "saveLabel": z.string(),
        "savedLabel": z.string(),
        "clubVideosHeading": z.string(),
        "recommendedHeading": z.string(),
        "matchReasonPrefix": z.string()
      }),
      "podcasts": z.object({
        "tabLabel": z.string(),
        "heading": z.string(),
        "emptyHeading": z.string(),
        "emptyBody": z.string(),
        "followLabel": z.string(),
        "followingLabel": z.string(),
        "officialBadge": z.string(),
        "fanBadge": z.string(),
        "mediaBadge": z.string(),
        "podcastBadge": z.string(),
        "videoBadge": z.string(),
        "newsBadge": z.string(),
        "youtubeBadge": z.string(),
        "visitLabel": z.string()
      }),
      "radar": z.object({
        "sectionHeading": z.string(),
        "tryoutsHeading": z.string(),
        "tryoutsEmptyBody": z.string(),
        "tryoutsCtaLabel": z.string(),
        "savedHeading": z.string(),
        "savedEmptyBody": z.string(),
        "savedCtaLabel": z.string(),
        "recommendedHeading": z.string(),
        "recommendedEmptyBody": z.string(),
        "viewAllLabel": z.string()
      }),
      "controls": z.object({
        "tabLabel": z.string(),
        "heading": z.string(),
        "teamsHeading": z.string(),
        "teamsBody": z.string(),
        "interestsHeading": z.string(),
        "interestsBody": z.string(),
        "regionHeading": z.string(),
        "memberTypeHeading": z.string(),
        "memberTypeFan": z.string(),
        "memberTypePlayer": z.string(),
        "memberTypeBoth": z.string(),
        "notificationsHeading": z.string(),
        "notificationsTryouts": z.string(),
        "notificationsNewVideos": z.string(),
        "notificationsRecommended": z.string(),
        "saveLabel": z.string(),
        "savedConfirm": z.string(),
        "savingLabel": z.string()
      })
    }),
    fanzone_highlights: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "title": z.string(),
        "subtitle": z.string(),
        "disclaimer": z.string()
      }),
      "filters": z.object({
        "channelLabel": z.string(),
        "channelAllOption": z.string(),
        "categoryLabel": z.string(),
        "searchLabel": z.string(),
        "searchPlaceholder": z.string()
      }),
      "statusMessages": z.object({
        "verificationRequired": z.string(),
        "notReady": z.string(),
        "expired": z.string(),
        "stale": z.string(),
        "ready": z.string()
      }),
      "emptyStates": z.object({
        "ready": z.string(),
        "unavailable": z.string()
      }),
      "disclosure": z.object({
        "heading": z.string(),
        "para1": z.string(),
        "para2": z.string(),
        "para3": z.string(),
        "para4": z.string(),
        "footnote": z.string()
      })
    }),
    admin_content: z.object({
      "pageTitle": z.string(),
      "pageSubtitle": z.string(),
      "importCsvLabel": z.string(),
      "hideCsvLabel": z.string(),
      "refreshLabel": z.string(),
      "importHeading": z.string(),
      "importPlaceholder": z.string(),
      "importButtonLabel": z.string(),
      "importingLabel": z.string(),
      "noItemsMessage": z.string(),
      "allTypesLabel": z.string(),
      "statusAll": z.string(),
      "statusApproved": z.string(),
      "statusPending": z.string(),
      "statusUnpublished": z.string(),
      "statusArchived": z.string(),
      "previewRequiredLabel": z.string(),
      "expandLabel": z.string(),
      "collapseLabel": z.string()
    }),
    portal_choice: z.object({
      "headline": z.string(),
      "subheadline": z.string(),
      "fanCard": z.object({
        "title": z.string(),
        "description": z.string(),
        "features": z.array(z.object({
          "id": z.string(),
          "label": z.string()
        })),
        "cta": z.string()
      }),
      "parentCard": z.object({
        "title": z.string(),
        "description": z.string(),
        "features": z.array(z.object({
          "id": z.string(),
          "label": z.string()
        })),
        "cta": z.string()
      }),
      "alreadyHaveAccount": z.string(),
      "signInLink": z.string(),
      "disclaimer": z.string()
    }),
    auth_page: z.object({
      "signInTitle": z.string(),
      "createAccountTitle": z.string(),
      "welcomeTitle": z.string(),
      "signInToContinue": z.string(),
      "signInToggle": z.string(),
      "signUpToggle": z.string(),
      "signUpLink": z.string(),
      "signInLink": z.string(),
      "termsNote": z.string()
    }),
    parent_setup_gate: z.object({
      "headline": z.string(),
      "subheadline": z.string(),
      "noticeTitle": z.string(),
      "noticeBody": z.string(),
      "checklistItems": z.array(z.object({
        "id": z.string(),
        "text": z.string()
      })),
      "ctaSetup": z.string(),
      "ctaFan": z.string(),
      "emailNotVerifiedTitle": z.string(),
      "emailNotVerifiedBody": z.string(),
      "successTitle": z.string(),
      "successBody": z.string(),
      "consentVersion": z.string()
    }),
    portal_switcher: z.object({
      "parentLabel": z.string(),
      "fanLabel": z.string(),
      "setupParentLabel": z.string(),
      "switchingToFan": z.string(),
      "switchingToParent": z.string()
    }),
    parent_portal: z.object({
      "demoEvents": z.array(z.object({
        "date": z.string(),
        "player": z.string(),
        "time": z.string(),
        "title": z.string(),
        "id": z.string()
      }))
    }),
    parent_portal_ui: z.object({
      "identityCard": z.object({
        "roleLabel": z.string(),
        "editButton": z.string(),
        "fanViewButton": z.string(),
        "parentBadge": z.string(),
        "privateBadge": z.string()
      }),
      "familyOverview": z.object({
        "playersHeading": z.string(),
        "noPlayersBody": z.string(),
        "addFirstPlayerButton": z.string(),
        "addPlayerButton": z.string(),
        "tryoutsHeading": z.string(),
        "tryoutsToggleLabel": z.string(),
        "tryoutsToggleDescription": z.string(),
        "regionsLabel": z.string(),
        "regionsSettingsHint": z.string(),
        "communityHeading": z.string(),
        "communityComingSoon": z.string()
      }),
      "playerCard": z.object({
        "continueSetupLabel": z.string(),
        "completeLabel": z.string(),
        "noDetailsLabel": z.string()
      }),
      "playerDetail": z.object({
        "positionsHeading": z.string(),
        "clubHeading": z.string(),
        "parentEnteredLabel": z.string(),
        "ageGroupNotSet": z.string(),
        "trainingHeading": z.string(),
        "modeLabel": z.string(),
        "sessionLengthLabel": z.string(),
        "frequencyLabel": z.string(),
        "focusAreasLabel": z.string(),
        "tryoutHeading": z.string(),
        "tryoutOnLabel": z.string(),
        "tryoutOffLabel": z.string(),
        "setupCtaHeading": z.string(),
        "setupCtaBody": z.string(),
        "setupCtaButton": z.string(),
        "parentManagedBadge": z.string(),
        "backButton": z.string(),
        "editButton": z.string()
      }),
      "sidebar": z.object({
        "familyLabel": z.string(),
        "allPlayersLabel": z.string(),
        "addPlayerLabel": z.string(),
        "calendarLabel": z.string(),
        "tryoutsLabel": z.string(),
        "communityLabel": z.string(),
        "settingsLabel": z.string(),
        "comingSoonLabel": z.string()
      }),
      "rightSidebar": z.object({
        "setupCtaHeading": z.string(),
        "setupCtaBody": z.string(),
        "setupCtaButton": z.string(),
        "tryoutsHeading": z.string(),
        "tryoutsListingsLabel": z.string(),
        "tryoutsManageHint": z.string(),
        "privacyNotice": z.string()
      }),
      "wizard": z.object({
        "welcomeHeading": z.string(),
        "welcomeBody": z.string(),
        "startButton": z.string(),
        "skipButton": z.string()
      }),
      "statCards": z.object({
        "playersLabel": z.string(),
        "tryoutInterestLabel": z.string(),
        "coloradoTryoutsLabel": z.string(),
        "profilesCompleteLabel": z.string()
      }),
      "mobileNav": z.object({
        "familyLabel": z.string(),
        "calendarLabel": z.string(),
        "tryoutsLabel": z.string(),
        "settingsLabel": z.string()
      })
    }),
    parent_portal_player: z.object({
      "identityCard": z.object({
        "editButton": z.string(),
        "backButton": z.string(),
        "parentManagedBadge": z.string(),
        "footLabel": z.string(),
        "profileCompleteLabel": z.string(),
        "profilePctLabel": z.string()
      }),
      "privacyNotice": z.string(),
      "setupCta": z.object({
        "heading": z.string(),
        "body": z.string(),
        "button": z.string(),
        "pctSuffix": z.string()
      }),
      "about": z.object({
        "heading": z.string(),
        "ageGroupLabel": z.string(),
        "birthYearLabel": z.string(),
        "jerseyLabel": z.string(),
        "levelLabel": z.string(),
        "footLabel": z.string()
      }),
      "positions": z.object({
        "heading": z.string(),
        "positionsLabel": z.string(),
        "primarySuffix": z.string(),
        "goalsLabel": z.string()
      }),
      "club": z.object({
        "heading": z.string(),
        "parentEnteredBadge": z.string(),
        "directoryMatchBadge": z.string(),
        "seasonNotSet": z.string(),
        "ageGroupNotSet": z.string()
      }),
      "training": z.object({
        "heading": z.string(),
        "modeLabel": z.string(),
        "sessionLengthLabel": z.string(),
        "frequencyLabel": z.string(),
        "focusAreasLabel": z.string(),
        "interestsLabel": z.string()
      }),
      "events": z.object({
        "heading": z.string(),
        "noCalendarBody": z.string()
      }),
      "tryouts": z.object({
        "heading": z.string(),
        "onLabel": z.string(),
        "offLabel": z.string()
      })
    }),
    pro_sources_coverage: z.object({
      "hero": z.object({
        "eyebrow": z.string(),
        "title": z.string(),
        "description": z.string()
      }),
      "legend": z.object({
        "label": z.string(),
        "live": z.string(),
        "liveDetail": z.string(),
        "link": z.string(),
        "linkDetail": z.string(),
        "unresolved": z.string(),
        "unresolvedDetail": z.string()
      }),
      "summary": z.object({
        "totalClubs": z.string(),
        "liveFeed": z.string(),
        "linkOnly": z.string(),
        "unresolvedLabel": z.string()
      }),
      "table": z.object({
        "colCompetition": z.string(),
        "colTotal": z.string(),
        "colCoverage": z.string(),
        "colStatus": z.string(),
        "liveSuffix": z.string()
      }),
      "groups": z.object({
        "nationalTeams": z.string(),
        "media": z.string()
      }),
      "note": z.object({
        "liveExplainer": z.string()
      })
    }),
    scores: z.object({
      "header": z.object({
        "title": z.string(),
        "liveLabel": z.string()
      }),
      "empty": z.object({
        "noFixtures": z.string(),
        "loading": z.string(),
        "cached": z.string()
      }),
      "nav": z.object({
        "today": z.string(),
        "yesterday": z.string(),
        "tomorrow": z.string(),
        "allScores": z.string()
      })
    }),
    parent_portal_player_create: z.object({
      "pageTitle": z.string(),
      "backLabel": z.string(),
      "fields": z.object({
        "name": z.object({
          "label": z.string(),
          "placeholder": z.string()
        }),
        "ageGroup": z.object({
          "label": z.string(),
          "placeholder": z.string()
        }),
        "primaryPosition": z.object({
          "label": z.string(),
          "placeholder": z.string()
        }),
        "secondaryPosition": z.object({
          "label": z.string(),
          "noneOption": z.string()
        }),
        "club": z.object({
          "label": z.string(),
          "placeholder": z.string()
        }),
        "jersey": z.object({
          "label": z.string(),
          "placeholder": z.string()
        }),
        "trainingInterests": z.object({
          "label": z.string()
        })
      }),
      "validation": z.object({
        "nameRequired": z.string()
      }),
      "actions": z.object({
        "cancel": z.string(),
        "save": z.string(),
        "saveFailed": z.string()
      }),
      "unsavedDialog": z.object({
        "title": z.string(),
        "body": z.string(),
        "stay": z.string(),
        "discard": z.string()
      }),
      "SEASONS": z.array(z.string()),
      "TRAINING_INTERESTS": z.array(z.string()),
      "COMMON_PROGRAMS": z.array(z.string()),
      "steps": z.array(z.string())
    }),
    locked_in_demo: z.object({
      "meta": z.object({
        "title": z.string(),
        "description": z.string()
      }),
      "banner": z.object({
        "label": z.string(),
        "resetButton": z.string(),
        "backButton": z.string()
      }),
      "header": z.object({
        "heading": z.string(),
        "tagline": z.string(),
        "subheading": z.string(),
        "playerContextNote": z.string()
      }),
      "progress": z.object({
        "label": z.string(),
        "completeLabel": z.string()
      }),
      "ageSection": z.object({
        "number": z.string(),
        "heading": z.string(),
        "ctaButton": z.string(),
        "ctaUrl": z.string(),
        "ctaSupporting": z.string(),
        "simulateButton": z.string(),
        "statusComplete": z.string(),
        "statusPending": z.string()
      }),
      "healthSection": z.object({
        "number": z.string(),
        "heading": z.string(),
        "ctaButton": z.string(),
        "ctaUrl": z.string(),
        "ctaSupporting": z.string(),
        "ctaNote": z.string(),
        "simulateButton": z.string(),
        "statusComplete": z.string(),
        "statusPending": z.string()
      }),
      "paymentSection": z.object({
        "number": z.string(),
        "heading": z.string(),
        "ctaButton": z.string(),
        "ctaUrl": z.string(),
        "ctaSupporting": z.string(),
        "ctaNote": z.string(),
        "simulateButton": z.string(),
        "statusComplete": z.string(),
        "statusPending": z.string()
      }),
      "completionSection": z.object({
        "previewButton": z.string(),
        "summaryHeading": z.string(),
        "samplePlayer": z.string(),
        "ageLabel": z.string(),
        "docsLabel": z.string(),
        "paymentLabel": z.string(),
        "recipientLabel": z.string(),
        "recipientValue": z.string(),
        "handoffButton": z.string(),
        "handoffHeading": z.string(),
        "handoffNotice": z.string(),
        "disclosure": z.string()
      }),
      "lockedInCard": z.object({
        "heading": z.string(),
        "body": z.string(),
        "badge": z.string(),
        "button": z.string()
      })
    }),
    demo_parent_portal: z.object({
      "banner": z.object({
        "label": z.string(),
        "resetBtn": z.string(),
        "backBtn": z.string()
      }),
      "header": z.object({
        "title": z.string(),
        "subtitle": z.string()
      }),
      "selector": z.object({
        "heading": z.string(),
        "clubLabel": z.string(),
        "clubPlaceholder": z.string(),
        "programLabel": z.string(),
        "programPlaceholder": z.string(),
        "ageGroupLabel": z.string(),
        "ageGroupPlaceholder": z.string(),
        "teamLabel": z.string(),
        "teamPlaceholder": z.string(),
        "noTeam": z.string(),
        "playerLabel": z.string(),
        "playerPlaceholder": z.string(),
        "hintClub": z.string(),
        "hintProgram": z.string(),
        "hintAgeGroup": z.string(),
        "hintTeam": z.string(),
        "hintPlayer": z.string(),
        "hintDone": z.string()
      }),
      "teamCard": z.object({
        "heading": z.string()
      }),
      "profileHeader": z.object({
        "clubLogoAlt": z.string(),
        "clubLogoNote": z.string()
      }),
      "photoPickerLabel": z.string(),
      "photoPickerRemove": z.string(),
      "photoPickerHint": z.string(),
      "tabs": z.object({
        "profile": z.string(),
        "schedule": z.string(),
        "stats": z.string(),
        "media": z.string(),
        "recruiting": z.string()
      }),
      "profileTab": z.object({
        "aboutHeading": z.string(),
        "ageGroupLabel": z.string(),
        "birthYearLabel": z.string(),
        "jerseyLabel": z.string(),
        "footLabel": z.string(),
        "positionHeading": z.string(),
        "primarySuffix": z.string(),
        "devFocusLabel": z.string(),
        "clubHeading": z.string(),
        "clubLogoNote": z.string()
      }),
      "lockedInCard": z.object({
        "heading": z.string(),
        "intro": z.string(),
        "simDisclaimer": z.string(),
        "clubLabel": z.string(),
        "seasonLabel": z.string(),
        "ageVerifLabel": z.string(),
        "ageVerifStatus": z.string(),
        "formsHeading": z.string(),
        "medicalLabel": z.string(),
        "medicalStatus": z.string(),
        "paymentLabel": z.string(),
        "paymentStatus": z.string(),
        "openDemoBtn": z.string(),
        "returnNote": z.string(),
        "formItems": z.array(z.string()),
        "formStatus": z.string()
      }),
      "scheduleTab": z.object({
        "heading": z.string(),
        "viewList": z.string(),
        "viewCalendar": z.string(),
        "filterAll": z.string(),
        "filterGames": z.string(),
        "filterPractices": z.string(),
        "noEvents": z.string(),
        "homeLabel": z.string(),
        "awayLabel": z.string(),
        "playedLabel": z.string(),
        "addStatsLabel": z.string(),
        "hideLabel": z.string(),
        "showLabel": z.string(),
        "calMonthPrev": z.string(),
        "calMonthNext": z.string(),
        "calGameDot": z.string(),
        "calPracticeDot": z.string(),
        "calNoEventsDay": z.string()
      }),
      "statsTab": z.object({
        "heading": z.string(),
        "totalsHeading": z.string(),
        "noStats": z.string(),
        "gpLabel": z.string(),
        "goalsLabel": z.string(),
        "assistsLabel": z.string(),
        "gaLabel": z.string(),
        "savesLabel": z.string(),
        "shutoutsLabel": z.string(),
        "gameLogHeading": z.string(),
        "noGameLog": z.string(),
        "vsLabel": z.string(),
        "atLabel": z.string()
      }),
      "statForm": z.object({
        "participatedLabel": z.string(),
        "goalsLabel": z.string(),
        "assistsLabel": z.string(),
        "gaLabel": z.string(),
        "savesLabel": z.string(),
        "shutoutsLabel": z.string(),
        "saveBtn": z.string(),
        "cancelBtn": z.string()
      }),
      "mediaTab": z.object({
        "heading": z.string(),
        "storageNote": z.string(),
        "seasonAll": z.string(),
        "gameTagNone": z.string(),
        "gameTagLabel": z.string(),
        "addItemBtn": z.string(),
        "addModalHeading": z.string(),
        "addModalKindLabel": z.string(),
        "addModalKindPhoto": z.string(),
        "addModalKindVideo": z.string(),
        "addModalKindHighlight": z.string(),
        "addModalTitleLabel": z.string(),
        "addModalTitlePlaceholder": z.string(),
        "addModalFileLabel": z.string(),
        "addModalFileHint": z.string(),
        "addModalFileBtn": z.string(),
        "addModalFileClear": z.string(),
        "addModalGameLabel": z.string(),
        "addModalGameNone": z.string(),
        "addModalSaveBtn": z.string(),
        "addModalCancelBtn": z.string(),
        "removeBtn": z.string(),
        "deleteConfirmHeading": z.string(),
        "deleteConfirmNote": z.string(),
        "deleteConfirmYes": z.string(),
        "deleteConfirmNo": z.string(),
        "unassignBtn": z.string(),
        "unassignConfirmNote": z.string(),
        "viewBtn": z.string(),
        "shareBtn": z.string(),
        "emptyHeading": z.string(),
        "emptyNote": z.string(),
        "shareNote": z.string(),
        "simDisclaimer": z.string(),
        "collectionsHeading": z.string(),
        "newCollectionBtn": z.string(),
        "collectionEmptyNote": z.string(),
        "collectionDeleteBtn": z.string(),
        "collectionEditBtn": z.string(),
        "collectionPlayBtn": z.string(),
        "collectionAddClipBtn": z.string(),
        "collectionNoClips": z.string(),
        "playlistHeading": z.string(),
        "playlistClose": z.string(),
        "playlistPrev": z.string(),
        "playlistNext": z.string()
      }),
      "shareSheet": z.object({
        "heading": z.string(),
        "captionLabel": z.string(),
        "captionPlaceholder": z.string(),
        "tagsLabel": z.string(),
        "tagsPlaceholder": z.string(),
        "destinationsHeading": z.string(),
        "destInstagram": z.string(),
        "destFacebook": z.string(),
        "destX": z.string(),
        "destInstagramNote": z.string(),
        "destFacebookNote": z.string(),
        "destXNote": z.string(),
        "nativeShareBtn": z.string(),
        "downloadBtn": z.string(),
        "copyBtn": z.string(),
        "copiedMsg": z.string(),
        "collectionShareNote": z.string(),
        "privateNote": z.string(),
        "cancelBtn": z.string()
      }),
      "newCollectionModal": z.object({
        "heading": z.string(),
        "nameLabel": z.string(),
        "namePlaceholder": z.string(),
        "selectClipsLabel": z.string(),
        "noHighlights": z.string(),
        "createBtn": z.string(),
        "cancelBtn": z.string()
      }),
      "editCollectionModal": z.object({
        "heading": z.string(),
        "nameLabel": z.string(),
        "clipsLabel": z.string(),
        "addClipsLabel": z.string(),
        "noClipsAvailable": z.string(),
        "saveBtn": z.string(),
        "cancelBtn": z.string()
      }),
      "recruitingTab": z.object({
        "heading": z.string(),
        "eligibleNote": z.string(),
        "phaseNote": z.string(),
        "intro": z.string(),
        "gpaLabel": z.string(),
        "gpaPlaceholder": z.string(),
        "gradYearLabel": z.string(),
        "gradYearPlaceholder": z.string(),
        "divisionLabel": z.string(),
        "divisionPlaceholder": z.string(),
        "readOnlyNote": z.string(),
        "programsHeading": z.string(),
        "programsEmpty": z.string(),
        "reachOutBtn": z.string(),
        "reachOutSubtitle": z.string()
      }),
      "coachOutreachForm": z.object({
        "heading": z.string(),
        "simDisclaimer": z.string(),
        "coachLabel": z.string(),
        "coachPlaceholder": z.string(),
        "introLabel": z.string(),
        "introPlaceholder": z.string(),
        "introHint": z.string(),
        "collectionsLabel": z.string(),
        "collectionsNoneHeading": z.string(),
        "collectionsNoneNote": z.string(),
        "tournamentsLabel": z.string(),
        "tournamentsHint": z.string(),
        "noGames": z.string(),
        "previewBtn": z.string(),
        "saveDraftBtn": z.string(),
        "cancelBtn": z.string(),
        "previewHeading": z.string(),
        "previewNote": z.string(),
        "previewCloseBtn": z.string(),
        "draftSavedMsg": z.string(),
        "coaches": z.array(z.object({
          "id": z.string(),
          "name": z.string(),
          "school": z.string(),
          "division": z.string(),
          "position": z.string()
        }))
      }),
      "recruitingGated": z.object({
        "heading": z.string(),
        "message": z.string(),
        "hint": z.string()
      }),
      "emptyState": z.object({
        "message": z.string(),
        "hint": z.string()
      })
    }),
    coach_profile: z.object({
      "pageTitle": z.string(),
      "pageDescription": z.string(),
      "srHeading": z.string(),
      "loadingText": z.string(),
      "unavailableHeading": z.string(),
      "unavailableBody": z.string()
    })
  },
  data: {
    blog: z.array(z.object({
      id: z.string(),
      slug: z.string().min(1),
      title: z.string(),
      excerpt: z.string(),
      content: z.string(),
      author: z.string().optional(),
      publishedAt: z.string(),
      updatedAt: z.string().optional(),
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      featuredImage: z.string().optional(),
      seoTitle: z.string().optional(),
      seoDescription: z.string().optional(),
      published: z.boolean(),
      status: z.enum(['published', 'scheduled', 'draft']).optional(),
      campaignId: z.string().optional()
    })).superRefine((posts, ctx) => {
      const seen = new Set<string>();
      posts.forEach((p, i) => {
        if (seen.has(p.slug)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate blog slug "${p.slug}"`,
            path: [i, 'slug']
          });
        }
        seen.add(p.slug);
      });
    }),
    directory_regions: z.array(z.object({
      "id": z.string(),
      "slug": z.string(),
      "label": z.string(),
      "abbr": z.string(),
      "tagline": z.string(),
      "listingCount": z.number(),
      "colorToken": z.string(),
      "subRegions": z.array(z.string()),
      "listings": z.array(z.object({
        "id": z.string(),
        "name": z.string(),
        "type": z.string(),
        "level": z.string(),
        "city": z.string(),
        "url": z.string().optional(),
        "importId": z.string().optional(),
        "programTypes": z.string().optional(),
        "directoryArea": z.string().optional(),
        "websiteStatus": z.string().optional(),
        "sourceUrl": z.string().optional(),
        "checkedDate": z.string().optional(),
        "email": z.string().optional(),
        "phone": z.string().optional()
      })),
      "indoorFacilities": z.array(z.object({
        "id": z.string(),
        "name": z.string(),
        "city": z.string(),
        "address": z.string(),
        "url": z.string(),
        "fields": z.number(),
        "surface": z.string(),
        "programs": z.array(z.string()),
        "notes": z.string()
      })),
      "futsalEntries": z.array(z.object({
        "id": z.string(),
        "name": z.string(),
        "city": z.string(),
        "type": z.string(),
        "level": z.string(),
        "url": z.string(),
        "notes": z.string()
      }))
    }))
  }
};
export type Schemas = typeof schemas;