/**
 * airo-video-slots.js — Runtime script for video slot patching.
 *
 * Fetches /airo-media.json to discover which media slots have mediaType 'video',
 * then uses a MutationObserver to replace <img> elements referencing those slots
 * with <video> elements (autoplay, muted, loop, playsInline). Reconciles the
 * reverse direction too, so a video→image replacement can't leave a blank area.
 *
 * Loaded synchronously in <head> so the observer is active before React hydrates.
 * Works in both dev and production modes — in dev mode the Vite plugin also handles
 * video patching via HMR, but this script acts as a fallback for direct page loads
 * (e.g. opening the preview link in a new tab without the builder parent frame).
 *
 * Safari notes:
 * - muted/playsinline must be HTML attributes (set before src) + explicit play()
 * - z-index:-1 fill videos paint behind the host's opaque background — clear it
 */
;(function () {
  var SLOT_PREFIX_IMAGES = '/airo-assets/images/'
  var SLOT_PREFIX_VIDEOS = '/airo-assets/videos/'
  var BG_VIDEO_FILL_STYLE = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-1;pointer-events:none;'
  var CLEAR_BG_ATTR = 'data-airo-bg-video-clear-bg'
  var mediaTypes = {}
  var committedSlots = {}

  function configureAutoplayVideo(video) {
    // Keep in lockstep with dev-tools/src/utils/autoplay-video.ts (parity test).
    video.muted = true
    video.defaultMuted = true
    video.autoplay = true
    video.loop = true
    video.playsInline = true
    video.preload = 'auto'
    video.setAttribute('muted', '')
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    var kick = function () {
      var p = video.play()
      if (p && typeof p.catch === 'function') p.catch(function () {})
    }
    if (video.isConnected) {
      // HAVE_CURRENT_DATA === 2 — mirror TS readyState gate
      if (video.readyState >= 2) {
        kick()
      } else {
        video.addEventListener('loadeddata', kick, { once: true })
        // Also try immediately — Safari sometimes needs the call before loadeddata
        kick()
      }
    } else if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(kick)
    } else {
      kick()
    }
  }

  function prepareBackgroundVideoHost(el) {
    var pos = window.getComputedStyle(el).position
    if (pos === 'static') el.style.position = 'relative'
    el.style.setProperty('background-color', 'transparent', 'important')
    el.setAttribute(CLEAR_BG_ATTR, 'true')
  }

  function restoreBackgroundVideoHost(el) {
    if (!el.getAttribute(CLEAR_BG_ATTR)) return
    el.style.removeProperty('background-color')
    el.removeAttribute(CLEAR_BG_ATTR)
  }

  // Requires the slot to be present in the manifest: an absent entry means
  // "unknown", not "image", and must never downgrade a video to an <img>.
  // Relies on mediaType being required on every slot write (@airo/shared MediaSlot).
  // A slot missing mediaType is skipped at ingest below, so it stays "unknown" and
  // a source-authored <video> for it is left alone rather than swapped.
  function isImageSlot(slotPath) {
    return !!slotPath
      && Object.prototype.hasOwnProperty.call(mediaTypes, slotPath)
      && mediaTypes[slotPath] !== 'video'
  }

  function isVideoSlot(slotPath) {
    return !!slotPath && mediaTypes[slotPath] === 'video'
  }

  function extractSlotPath(url) {
    if (!url) return null
    var prefixes = [SLOT_PREFIX_IMAGES, SLOT_PREFIX_VIDEOS]
    for (var i = 0; i < prefixes.length; i++) {
      var idx = url.indexOf(prefixes[i])
      if (idx !== -1) {
        var after = url.substring(idx + prefixes[i].length)
        return after.split('?')[0]
      }
    }
    return null
  }

  function patchImg(img) {
    if (!img.src) return
    var slotPath = extractSlotPath(img.src)

    if (img.getAttribute('data-airo-video-patched')) {
      // Slot reverted to image — reveal the img and drop the injected video.
      // Also covers the orphan case where React already removed the video.
      if (isImageSlot(slotPath)) {
        var stale = img.parentNode && img.parentNode.querySelector('video[data-slot="' + slotPath + '"]')
        if (stale) stale.remove()
        img.removeAttribute('data-airo-video-patched')
        img.style.display = ''
      }
      return
    }

    if (!isVideoSlot(slotPath)) return

    // Remove any existing video for this slot to prevent duplicates after re-renders
    var existing = img.parentNode && img.parentNode.querySelector('video[data-slot="' + slotPath + '"]')
    if (existing) existing.remove()

    var videoUrl = img.src.replace(SLOT_PREFIX_IMAGES, SLOT_PREFIX_VIDEOS)
    var video = document.createElement('video')
    video.className = img.className
    video.style.cssText = img.style.cssText
    if (img.width) video.width = img.width
    if (img.height) video.height = img.height
    video.setAttribute('data-airo-video', '')
    video.setAttribute('data-slot', slotPath)
    configureAutoplayVideo(video)
    video.src = videoUrl

    img.setAttribute('data-airo-video-patched', 'true')
    img.style.display = 'none'
    if (img.parentNode) {
      img.parentNode.insertBefore(video, img.nextSibling)
    }
  }

  function patchBgElement(el) {
    var bgImage = window.getComputedStyle(el).backgroundImage
    if (!bgImage || bgImage === 'none') return
    if (bgImage.indexOf(SLOT_PREFIX_IMAGES) === -1 && bgImage.indexOf(SLOT_PREFIX_VIDEOS) === -1) return
    var urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/)
    if (!urlMatch || !urlMatch[1]) return
    var slotPath = extractSlotPath(urlMatch[1])
    if (!isVideoSlot(slotPath)) return

    // If already patched and video exists, just re-hide background (React may have restored it)
    if (el.getAttribute('data-airo-video-bg-patched') === slotPath) {
      el.style.backgroundImage = 'none'
      return
    }

    // Remove any existing bg video to prevent duplicates
    var existing = el.querySelector('video[data-airo-bg-video]')
    if (existing) existing.remove()

    el.style.backgroundImage = 'none'
    el.setAttribute('data-airo-video-bg-patched', slotPath)
    var videoUrl = urlMatch[1].replace(SLOT_PREFIX_IMAGES, SLOT_PREFIX_VIDEOS)
    if (videoUrl.indexOf(SLOT_PREFIX_VIDEOS) === -1) {
      videoUrl = SLOT_PREFIX_VIDEOS + slotPath
    }
    var video = document.createElement('video')
    video.setAttribute('data-airo-bg-video', '')
    video.setAttribute('data-slot', slotPath)
    video.style.cssText = BG_VIDEO_FILL_STYLE
    configureAutoplayVideo(video)
    video.src = videoUrl
    prepareBackgroundVideoHost(el)
    el.insertBefore(video, el.firstChild)
  }

  function unpatchVideo(video) {
    if (video.hasAttribute('data-airo-bg-video')) return
    // dev-tools owns its provisional preview nodes (data-airo-media-preview)
    if (video.hasAttribute('data-airo-media-preview')) return
    var slotPath = video.getAttribute('data-slot') || extractSlotPath(video.src)
    if (!isImageSlot(slotPath)) return

    // The patched host can be an <img> (patchImg's upgrade) or a poster-only <video>
    // (patchVideoPoster's upgrade below) — either can precede our injected sibling.
    var prevHost = video.previousElementSibling
    var patchedHost = prevHost && (prevHost.tagName === 'IMG' || prevHost.tagName === 'VIDEO') && prevHost.getAttribute('data-airo-video-patched')
      ? prevHost
      : null

    if (patchedHost || video.hasAttribute('data-airo-video')) {
      if (patchedHost) {
        patchedHost.removeAttribute('data-airo-video-patched')
        patchedHost.style.display = ''
        if (patchedHost.tagName === 'VIDEO') holdPosterPlayback(patchedHost)
      }
      video.remove()
      return
    }

    // Source declares <video> for a slot that now holds an image — swap in an
    // <img> so the asset renders instead of leaving an empty video box.
    var img = document.createElement('img')
    img.src = SLOT_PREFIX_IMAGES + slotPath
    img.className = video.className
    img.style.cssText = video.style.cssText
    img.alt = video.getAttribute('aria-label') || ''
    if (video.parentNode) video.parentNode.replaceChild(img, video)
  }

  // Show the poster instead of an autoplaying frame. Leave src and <source> in
  // place so controls can still play them. Mirrors dev-tools holdPosterPlayback.
  function holdPosterPlayback(video) {
    if (video.hasAttribute('data-airo-poster-hold')) return
    if (video.hasAttribute('autoplay') || video.autoplay) {
      video.setAttribute('data-airo-preserved-autoplay', video.getAttribute('autoplay') || '')
    }
    video.setAttribute('data-airo-preserved-preload', video.getAttribute('preload') || '')
    video.setAttribute('data-airo-poster-hold', '')
    video.removeAttribute('autoplay')
    video.autoplay = false
    video.preload = 'none'
    video.pause()
    video.load()
  }

  // Put back the autoplay and preload a poster hold suspended.
  function releasePosterPlayback(video) {
    if (!video.hasAttribute('data-airo-poster-hold')) return
    video.removeAttribute('data-airo-poster-hold')
    var preload = video.getAttribute('data-airo-preserved-preload')
    video.removeAttribute('data-airo-preserved-preload')
    if (preload) video.setAttribute('preload', preload)
    else video.removeAttribute('preload')
    var restoreAutoplay = video.hasAttribute('data-airo-preserved-autoplay')
    if (restoreAutoplay) {
      video.setAttribute('autoplay', video.getAttribute('data-airo-preserved-autoplay') || '')
      video.removeAttribute('data-airo-preserved-autoplay')
      video.autoplay = true
    }
    if (restoreAutoplay && video.style.display !== 'none') video.load()
  }

  // Page load and observer passes must not pause an ordinary <video> that uses an
  // image slot as its poster. A hold is started only when unpatchVideo reveals a
  // host this script previously upgraded. This function only releases that hold
  // once the poster is no longer an image slot.
  function holdImagePoster(video) {
    if (video.hasAttribute('data-airo-video')) return
    if (video.hasAttribute('data-airo-bg-video')) return
    if (video.hasAttribute('data-airo-media-preview')) return
    var posterSlot = extractSlotPath(video.getAttribute('poster') || '')
    var shouldHold = isImageSlot(posterSlot)
    if (shouldHold) {
      var ownSlot = video.getAttribute('data-slot') || extractSlotPath(video.getAttribute('src') || '')
      if (ownSlot === posterSlot) shouldHold = false
      var sources = video.querySelectorAll('source')
      for (var i = 0; shouldHold && i < sources.length; i++) {
        if (extractSlotPath(sources[i].getAttribute('src')) === posterSlot) shouldHold = false
      }
    }
    if (!shouldHold) {
      if (video.style.display === 'none') return
      releasePosterPlayback(video)
    }
  }

  // The video's own content already represents this slot (not a poster-only
  // match) — nothing to insert. video.src is empty when playback comes from
  // a <source> child, so those children count too.
  function posterOwnContentMatches(video, posterSlot) {
    var ownSlot = video.getAttribute('data-slot') || extractSlotPath(video.src)
    if (ownSlot === posterSlot) return true
    var sources = video.querySelectorAll('source')
    for (var i = 0; i < sources.length; i++) {
      if (extractSlotPath(sources[i].getAttribute('src')) === posterSlot) return true
    }
    return false
  }

  // Upgrade a poster-only video host (not one of our injected/background/preview
  // nodes) to a video sibling if its poster's slot is mediaType 'video'. A host
  // already patched for a different poster slot is retargeted to the current one.
  function patchVideoPoster(video) {
    if (video.hasAttribute('data-airo-video')) return
    if (video.hasAttribute('data-airo-bg-video')) return
    if (video.hasAttribute('data-airo-media-preview')) return

    var posterSlot = extractSlotPath(video.getAttribute('poster') || '')
    var ownMatches = posterOwnContentMatches(video, posterSlot)
    var sibling = video.nextElementSibling
    var injectedSibling = sibling && sibling.tagName === 'VIDEO' && sibling.hasAttribute('data-airo-video') ? sibling : null

    if (video.getAttribute('data-airo-video-patched')) {
      if (isVideoSlot(posterSlot) && !ownMatches && injectedSibling && injectedSibling.getAttribute('data-slot') === posterSlot) return
      if (injectedSibling) injectedSibling.remove()
      video.removeAttribute('data-airo-video-patched')
      video.style.display = ''
      // Mirrors dev-tools patchVideoPosterHost: revealing this host can resume its own
      // (unrelated) autoplaying content, which must stay held while its poster slot is
      // still an image — otherwise unpatchVideo's hold is the only path that applies it.
      if (posterSlot && isImageSlot(posterSlot) && !ownMatches) holdPosterPlayback(video)
    }

    if (!isVideoSlot(posterSlot) || ownMatches) return

    var parent = video.parentNode
    if (!parent) return

    // Drop only this host's injected video: its next sibling, or a remount leftover
    // whose previous sibling is no longer a patched host. Another host's video in the
    // same parent stays.
    var child = parent.firstElementChild
    while (child) {
      var next = child.nextElementSibling
      var previous = child.previousElementSibling
      var ownedByPatchedHost = previous && previous.getAttribute('data-airo-video-patched')
      if (
        child !== video &&
        child.tagName === 'VIDEO' &&
        child.hasAttribute('data-airo-video') &&
        child.getAttribute('data-slot') === posterSlot &&
        !ownedByPatchedHost
      ) {
        child.remove()
      }
      child = next
    }

    var inserted = document.createElement('video')
    inserted.className = video.className
    inserted.style.cssText = video.style.cssText
    if (video.width) inserted.width = video.width
    if (video.height) inserted.height = video.height
    inserted.setAttribute('data-airo-video', '')
    inserted.setAttribute('data-slot', posterSlot)
    configureAutoplayVideo(inserted)
    inserted.src = SLOT_PREFIX_VIDEOS + posterSlot

    parent.insertBefore(inserted, video.nextSibling)
    video.setAttribute('data-airo-video-patched', 'true')
    // The original keeps playing (possibly with audio) once hidden unless its
    // playback is suspended first — mirrors dev-tools previewMediaSlot's
    // video-poster-to-video branch, which holds the original before hiding it.
    holdPosterPlayback(video)
    video.style.display = 'none'
  }

  function unpatchBgElement(el) {
    var slotPath = el.getAttribute('data-airo-video-bg-patched')
    if (!isImageSlot(slotPath)) return
    var bgVideo = el.querySelector('video[data-airo-bg-video]')
    if (bgVideo) bgVideo.remove()
    el.removeAttribute('data-airo-video-bg-patched')
    restoreBackgroundVideoHost(el)
    el.style.backgroundImage = 'url(' + JSON.stringify(SLOT_PREFIX_IMAGES + slotPath) + ')'
  }

  function patchAll() {
    document.querySelectorAll('video').forEach(unpatchVideo)
    document.querySelectorAll('video').forEach(patchVideoPoster)
    document.querySelectorAll('video').forEach(holdImagePoster)
    document.querySelectorAll('[data-airo-video-bg-patched]').forEach(unpatchBgElement)
    document.querySelectorAll('img').forEach(patchImg)
    // Check elements with inline background styles or already-patched elements
    document.querySelectorAll('[style*="background"], [data-airo-video-bg-patched]').forEach(patchBgElement)
    // Also scan all elements for CSS-class-based background-images referencing our slot prefixes.
    // patchBgElement uses getComputedStyle internally and bails early if no matching URL is found,
    // so this is safe but slightly more expensive — only run when we have video slots.
    var hasVideoSlots = false
    for (var k in mediaTypes) {
      if (isVideoSlot(k)) { hasVideoSlots = true; break }
    }
    if (hasVideoSlots) {
      document.querySelectorAll('section, div, header, main, [class*="hero"], [class*="banner"], [class*="background"]').forEach(function (el) {
        if (!el.getAttribute('data-airo-video-bg-patched') && !el.hasAttribute('style')) {
          patchBgElement(el)
        }
      })
    }
  }

  window.airoSetMediaSlotType = function (slotPath, mediaType) {
    if (slotPath && mediaType) {
      mediaTypes[slotPath] = mediaType // dev-tools commits a type after our load-time manifest read; without this the next observer pass reverts its swap
      committedSlots[slotPath] = mediaType
    }
  }

  // Both manifest ingest sites route through here. A dev-tools commit outranks manifest
  // responses that disagree with it — the in-flight initial fetch, or a poll that has not
  // caught up — but only until the manifest agrees, after which the slot rejoins normal
  // synchronization so a later change of kind is not ignored for the rest of the session.
  function ingestManifestType(slotPath, mediaType) {
    if (committedSlots[slotPath]) {
      if (committedSlots[slotPath] !== mediaType) return false
      delete committedSlots[slotPath]
    }
    if (mediaTypes[slotPath] === mediaType) return false
    mediaTypes[slotPath] = mediaType
    return true
  }

  // Fetch manifest then start observing
  fetch('/airo-media.json')
    .then(function (res) {
      if (!res.ok) return {}
      return res.json()
    })
    .then(function (manifest) {
      for (var key in manifest) {
        if (manifest[key] && manifest[key].mediaType) {
          ingestManifestType(key, manifest[key].mediaType)
        }
      }
      // Patch existing images
      patchAll()
      // Observe future DOM changes — childList for new nodes, attributes for style changes
      var isPatching = false
      var observer = new MutationObserver(function (mutations) {
        if (isPatching) return
        isPatching = true
        try {
        for (var i = 0; i < mutations.length; i++) {
          var mutation = mutations[i]
          if (mutation.type === 'childList') {
            if (mutation.target instanceof HTMLVideoElement) {
              var sourceChildChanged = false
              for (var a = 0; a < mutation.addedNodes.length && !sourceChildChanged; a++) {
                if (mutation.addedNodes[a] instanceof HTMLSourceElement) sourceChildChanged = true
              }
              for (var r = 0; r < mutation.removedNodes.length && !sourceChildChanged; r++) {
                if (mutation.removedNodes[r] instanceof HTMLSourceElement) sourceChildChanged = true
              }
              if (sourceChildChanged) {
                // A <source> inserted, removed, or replaced under this video changes
                // what its own content represents — reconcile the host, not just its
                // own src/poster attributes.
                patchVideoPoster(mutation.target)
                holdImagePoster(mutation.target)
              }
            }
            var added = mutation.addedNodes
            for (var j = 0; j < added.length; j++) {
              var node = added[j]
              if (node instanceof HTMLImageElement) {
                patchImg(node)
              } else if (node instanceof HTMLVideoElement) {
                unpatchVideo(node)
                patchVideoPoster(node)
                holdImagePoster(node)
              } else if (node instanceof HTMLElement) {
                node.querySelectorAll('video').forEach(function (v) {
                  unpatchVideo(v)
                  patchVideoPoster(v)
                  holdImagePoster(v)
                })
                node.querySelectorAll('img').forEach(patchImg)
                // Check added elements for background-image video slots
                patchBgElement(node)
                node.querySelectorAll('[style*="background"]').forEach(patchBgElement)
              }
            }
          } else if (mutation.type === 'attributes' && (mutation.attributeName === 'style' || mutation.attributeName === 'poster' || mutation.attributeName === 'src' || mutation.attributeName === 'srcset')) {
            var target = mutation.target
            if ((mutation.attributeName === 'poster' || mutation.attributeName === 'src') && target instanceof HTMLVideoElement) {
              // The video's own content, not just its poster, decides whether it's a
              // poster-only match — re-evaluate when that content's src changes too.
              patchVideoPoster(target)
              holdImagePoster(target)
            } else if (
              (mutation.attributeName === 'src' || mutation.attributeName === 'srcset') &&
              target instanceof HTMLSourceElement
            ) {
              // A bare <video><source> (no <picture> wrapper — not supported by this
              // script) reconciles via the video host its content represents.
              var sourceVideo = target.closest('video')
              if (sourceVideo) {
                patchVideoPoster(sourceVideo)
                holdImagePoster(sourceVideo)
              }
            } else if (target instanceof HTMLElement) {
              // Re-check: React may have re-rendered and set background-image back
              // Remove stale patch flag so patchBgElement re-evaluates
              if (target.getAttribute('data-airo-video-bg-patched')) {
                var bg = target.style.backgroundImage
                if (bg && bg !== 'none' && (bg.indexOf(SLOT_PREFIX_IMAGES) !== -1 || bg.indexOf(SLOT_PREFIX_VIDEOS) !== -1)) {
                  target.removeAttribute('data-airo-video-bg-patched')
                  patchBgElement(target)
                }
              } else {
                patchBgElement(target)
              }
            }
          }
        }
        } finally {
          isPatching = false
        }
      })
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'poster', 'src', 'srcset']
      })

      // Re-fetch manifest periodically to pick up changes (dev mode only — HMR may not work due to CORS)
      // Use __AIRO_DEV_MODE__ flag set by dev-supervisor, falling back to localhost check
      var isDevMode = window.__AIRO_DEV_MODE__ === true || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      if (isDevMode) {
        var pollFailures = 0
        var pollIntervalId = setInterval(function () {
          fetch('/airo-media.json').then(function (r) {
            if (!r.ok) return {}
            return r.json()
          }).then(function (m) {
            pollFailures = 0
            var changed = false
            for (var k in m) {
              if (m[k] && m[k].mediaType && ingestManifestType(k, m[k].mediaType)) {
                changed = true
              }
            }
            if (changed) patchAll()
          }).catch(function (err) {
            pollFailures++
            if (pollFailures === 1) {
              // eslint-disable-next-line no-console
              console.warn('[airo-video-slots] manifest poll failed:', err.message || err)
            }
            if (pollFailures >= 5) {
              clearInterval(pollIntervalId)
            }
          })
        }, 3000)
      }
    })
    .catch(function () {
      // Manifest not available — no video slots to patch
    })
})()
