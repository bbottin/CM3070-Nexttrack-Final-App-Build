// src/routes/playlist.js

// Import Express to define an HTTP router.
const express = require("express");
const router = express.Router();

// Import service functions from the ReccoBeats wrapper.
// - getRecommendations:          fetch recommendations for a set of ReccoBeats IDs
// - searchTrack:                 look up a track by Spotify ID
// - searchTrackByTitleAndArtist: look up a track by title + artist
// - extractSpotifyId:            normalise various ID formats to a clean Spotify ID
const {
  getRecommendations,
  searchTrack,
  searchTrackByTitleAndArtist,
  extractSpotifyId,
} = require("../services/reccobeats");

// YouTube search fallback helpers.
const { searchYouTube, getYouTubeEmbedUrl } = require("../services/youtube");

// Local sample dataset used as a fallback when external APIs fail or
// don't cover a requested track.
const sampleTracks = require("../data/sampleTracks.json");

/**
 * findTrackInSampleData
 * ------------------------------------------------------------
 * Case-insensitive substring search over the local sample dataset.
 * Matching is deliberately lenient (partial matches count) so that
 * minor formatting differences between the search results and the
 * sample data still resolve.
 *
 * @param {string} title  - Track title (may be empty)
 * @param {string} artist - Artist name (may be empty)
 * @returns {Object|null} The matching track object (with its sample
 *                        key as `id`) or null if not found.
 */
function findTrackInSampleData(title, artist) {
  if (!title && !artist) return null;

  const titleLower = title?.toLowerCase() || "";
  const artistLower = artist?.toLowerCase() || "";

  for (const [id, track] of Object.entries(sampleTracks)) {
    const trackTitleLower = track.title?.toLowerCase() || "";
    const trackArtistLower = track.artist?.toLowerCase() || "";

    const titleMatch = titleLower && trackTitleLower.includes(titleLower);
    const artistMatch = artistLower && trackArtistLower.includes(artistLower);

    // Both title and artist provided → require both to match.
    if (titleLower && artistLower) {
      if (titleMatch && artistMatch) {
        return { ...track, id };
      }
    }
    // Only title provided → match on title alone.
    else if (titleLower && !artistLower) {
      if (titleMatch) {
        return { ...track, id };
      }
    }
    // Only artist provided → match on artist alone.
    else if (!titleLower && artistLower) {
      if (artistMatch) {
        return { ...track, id };
      }
    }
  }
  return null;
}

/**
 * stripRedundantArtistPrefix
 * ------------------------------------------------------------
 * Removes a leading artist name from a track title when the artist
 * name is already baked into the title — e.g.
 *   title "Nirvana - Smells Like Teen Spirit", artist "Nirvana"
 *   → "Smells Like Teen Spirit"
 *
 * Last.fm's track name field sometimes already contains the artist
 * this way, which poisons any search that concatenates title+artist
 * together (the artist name effectively appears twice, drowning out
 * the actual song title in a fuzzy text match).
 */
function stripRedundantArtistPrefix(title, artist) {
  if (!title || !artist) return title;

  // Escape regex metacharacters in the artist name so it can be
  // safely embedded in a RegExp pattern.
  const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Match "<artist>", followed by optional whitespace, then a
  // separator (hyphen, colon, en-dash or em-dash), then whitespace.
  const prefixPattern = new RegExp(`^${escapedArtist}\\s*[-:–—]\\s*`, "i");

  // Return the stripped title or the original if stripping left
  // nothing (which would indicate the whole title was the artist).
  return title.replace(prefixPattern, "").trim() || title;
}

/**
 * stripFeaturingText
 * ------------------------------------------------------------
 * Removes parenthetical annotations and "feat./ft./featuring"
 * credits from a track title — e.g.
 *   "On My Own (Feat. Darla Jade)" → "On My Own"
 *
 * Search backends often match much better on the bare title than
 * on a string with a featured-artist annotation baked in.
 */
function stripFeaturingText(title) {
  if (!title) return title;

  return title
    .replace(/\([^)]*\)/g, "") // remove anything in ( )
    .replace(/\[[^\]]*\]/g, "") // remove anything in [ ]
    .replace(/\b(feat\.?|ft\.?|featuring)\b.*$/i, "") // remove trailing "feat. X"
    .replace(/\s+/g, " ") // collapse repeated spaces
    .trim();
}

/**
 * isValidSpotifyId
 * ------------------------------------------------------------
 * Heuristic check for whether an input looks like a Spotify ID.
 * Accepts:
 *   - Spotify URIs       (spotify:track:XXXXXXXX)
 *   - Spotify share URLs (open.spotify.com/track/XXXXXXXX)
 *   - Bare 22-char IDs   (alphanumeric + hyphen/underscore)
 */
function isValidSpotifyId(input) {
  if (!input) return false;
  if (input.startsWith("spotify:track:")) return true;
  if (input.includes("open.spotify.com/track/")) return true;
  if (/^[a-zA-Z0-9_-]{22}$/.test(input)) return true;
  return false;
}

/**
 * generateFromSampleData
 * ------------------------------------------------------------
 * Fallback playlist generator. Ranks candidate tracks from the
 * local sample dataset using a simple weighted heuristic based on
 * the user's mood, discovery level and genre preference.
 *
 * @param {Array<string>} seedIds         - IDs of seed tracks to exclude.
 * @param {Object}        preferences     - { mood, discovery, genre }
 * @param {number}        playlist_length - How many tracks to return.
 * @returns {Array} Ranked, deduplicated track candidates.
 */
function generateFromSampleData(
  seedIds,
  preferences = {},
  playlist_length = 10,
) {
  let candidates = [];
  const seedIdsSet = new Set(seedIds);

  for (const [id, track] of Object.entries(sampleTracks)) {
    // Skip any track already used as a seed.
    if (seedIdsSet.has(id)) continue;
    // Also skip if the cleaned Spotify ID matches a seed.
    const cleanId = extractSpotifyId(id);
    if (seedIdsSet.has(cleanId)) continue;
    // Skip duplicates already added to the candidate list.
    if (candidates.find((c) => c.id === id)) continue;

    candidates.push({ ...track, id });
  }

  // Score each candidate using simple heuristics on audio features.
  const scored = candidates.map((candidate) => {
    let score = 0.5; // neutral baseline

    // Mood-based bonuses (only one will typically apply).
    if (preferences.mood === "energetic" && candidate.energy > 0.7)
      score += 0.3;
    if (preferences.mood === "calm" && candidate.energy < 0.4) score += 0.3;
    if (preferences.mood === "happy" && candidate.valence > 0.6) score += 0.3;
    if (preferences.mood === "sad" && candidate.valence < 0.4) score += 0.3;

    // Discovery bonus: favour less popular tracks when requested.
    if (preferences.discovery && preferences.discovery > 0.5) {
      score += (1 - (candidate.popularity || 0.5)) * 0.2;
    }

    // Genre bias: favour tracks matching the user's genre preference.
    if (preferences.genre && preferences.genre !== "any") {
      if (
        candidate.genre &&
        candidate.genre.toLowerCase() === preferences.genre.toLowerCase()
      ) {
        score += 0.2;
      }
    }

    return { ...candidate, score };
  });

  // Sort descending by score.
  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by title+artist and take the top N.
  const uniqueTracks = [];
  const seen = new Set();
  for (const track of scored) {
    const key = `${track.title}|${track.artist}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueTracks.push(track);
    }
    if (uniqueTracks.length >= playlist_length) break;
  }

  return uniqueTracks;
}

/**
 * formatTrackIdForPlayer
 * ------------------------------------------------------------
 * Produces a properly formatted `spotify:track:XXXX` URI for the
 * frontend or returns null if no valid Spotify ID can be derived.
 *
 * Returning null (rather than a garbage value) is important: the
 * frontend uses this field directly in the Spotify embed. Passing
 * an invalid ID causes the embed to either fail silently or worse,
 * keep playing whatever was previously loaded — which looks like
 * the player is out of sync with the playlist.
 */
function formatTrackIdForPlayer(track) {
  // Prefer an explicit spotifyId; fall back to the track's own id.
  let spotifyId = track.spotifyId || track.id;

  if (!spotifyId) return null;

  // Already a valid Spotify URI → return as-is.
  if (spotifyId.startsWith("spotify:track:")) {
    return spotifyId;
  }

  // Spotify share URL → extract the ID and reformat.
  if (spotifyId.includes("open.spotify.com/track/")) {
    const match = spotifyId.match(/track\/([a-zA-Z0-9_-]+)/);
    if (match) {
      return `spotify:track:${match[1]}`;
    }
  }

  // Bare 22-character ID → prefix it with the URI scheme.
  if (/^[a-zA-Z0-9_-]{22}$/.test(spotifyId)) {
    return `spotify:track:${spotifyId}`;
  }

  // Fallback: if a separate spotifyId property exists and differs
  // from the current value, recurse on that.
  if (track.spotifyId && track.spotifyId !== spotifyId) {
    return formatTrackIdForPlayer({ id: track.spotifyId });
  }

  // No valid Spotify ID could be derived (e.g., bare ReccoBeats UUID
  // with no matching Spotify href). Return null so callers know to
  // fall back to YouTube instead of guessing.
  console.warn(`⚠️ Could not resolve a playable Spotify ID for: ${spotifyId}`);
  return null;
}

/**
 * POST /api/playlist
 * ------------------------------------------------------------
 * Main playlist-generation endpoint. Accepts seed tracks and user
 * preferences, resolves each seed to a ReccoBeats ID (or a sample
 * data equivalent), fetches recommendations and returns a fully
 * formatted playlist for the frontend.
 *
 * The flow is organised into four steps:
 *   1. Resolve each seed to a usable ID (multiple fallback attempts).
 *   2. Fetch recommendations from ReccoBeats.
 *   3. If ReccoBeats returned nothing, fall back to sample data.
 *   4. Enrich each result (Spotify ID for player, YouTube fallback,
 *      explanation reason) and build the response.
 */
router.post("/", async (req, res) => {
  try {
    const { seed_tracks, preferences = {}, playlist_length = 10 } = req.body;

    // Validate: at least one seed track required.
    if (!seed_tracks || !Array.isArray(seed_tracks) || seed_tracks.length < 1) {
      return res.status(400).json({
        error:
          'Please provide at least 1 seed track in the "seed_tracks" array',
      });
    }

    console.log(`📥 Incoming seed_tracks:`, seed_tracks);

    // Working variables for the request lifecycle.
    let playlistData = [];
    let source = "Unknown";
    let reccobeatsIds = [];

    // -----------------------------------------------------------------
    // STEP 1: Resolve each seed to a usable ReccoBeats ID.
    //
    // Seeds can arrive in three shapes:
    //   - A plain string (legacy) — treated as a Spotify ID or free text.
    //   - An object { id, title, artist } — the preferred modern shape,
    //     which enables a title/artist fallback search when the ID alone
    //     can't be resolved (e.g., a bare MusicBrainz UUID from Last.fm).
    //   - A "lastfm:Title|Artist" string — parsed into title/artist.
    // -----------------------------------------------------------------
    const resolvedSeeds = [];

    for (const rawSeed of seed_tracks) {
      // Normalise the seed into (id, title, artist) fields.
      let seedId = rawSeed;
      let seedTitle = null;
      let seedArtist = null;
      if (rawSeed && typeof rawSeed === "object") {
        seedId = rawSeed.id;
        seedTitle = rawSeed.title || null;
        seedArtist = rawSeed.artist || null;
      }

      let resolved = false;

      // ---- ATTEMPT 1: Treat as a valid Spotify ID ----
      if (isValidSpotifyId(seedId)) {
        const cleanId = extractSpotifyId(seedId);
        console.log(`🔍 Converting Spotify ID ${cleanId} to ReccoBeats ID...`);

        const rbTrack = await searchTrack(cleanId);
        if (rbTrack && rbTrack.reccobeatsId) {
          // Success: ReccoBeats knows this track.
          reccobeatsIds.push(rbTrack.reccobeatsId);
          resolvedSeeds.push({
            original: seedId,
            cleanId: cleanId,
            reccobeatsId: rbTrack.reccobeatsId,
            title: rbTrack.title,
            artist: rbTrack.artist,
            spotifyId: rbTrack.spotifyId || cleanId,
          });
          console.log(`✅ Converted to ReccoBeats ID: ${rbTrack.reccobeatsId}`);
          resolved = true;
        } else {
          // ReccoBeats doesn't know it — try sample data.
          const sampleMatch = sampleTracks[cleanId] || sampleTracks[seedId];
          if (sampleMatch) {
            resolvedSeeds.push({
              original: seedId,
              cleanId: cleanId,
              title: sampleMatch.title,
              artist: sampleMatch.artist,
              spotifyId: sampleMatch.spotifyId || cleanId,
              sampleData: sampleMatch,
            });
            console.log(
              `✅ Found in sample data: ${sampleMatch.title} - ${sampleMatch.artist}`,
            );
            resolved = true;
          }
        }
      } else if (typeof seedId === "string" && seedId.startsWith("lastfm:")) {
        // ---- Last.fm seed without an MBID ----
        // Format: "lastfm:Title|Artist". Parse out the embedded
        // title/artist rather than passing the raw prefixed string
        // to a free-text search.
        const payload = seedId.slice("lastfm:".length);
        const pipeIndex = payload.indexOf("|");
        if (pipeIndex !== -1) {
          seedTitle = seedTitle || payload.slice(0, pipeIndex);
          seedArtist = seedArtist || payload.slice(pipeIndex + 1);
        }
        // Falls through to ATTEMPT 2 with the parsed title/artist.
      }

      // ---- ATTEMPT 2: Title/artist search ----
      // Covers: plain free-text seeds, parsed lastfm: seeds or a
      // bare id that failed above but came with title/artist attached.
      if (!resolved && (seedTitle || seedArtist)) {
        // Strip a redundant artist prefix from the title if present.
        const cleanTitle =
          stripRedundantArtistPrefix(seedTitle, seedArtist) || seedTitle;

        console.log(
          `🔍 Searching by title/artist: title="${cleanTitle}" artist="${seedArtist}" (seed id was "${seedId}")`,
        );

        try {
          // Search by title and validate the artist matches — rather
          // than concatenating title+artist into one fuzzy query and
          // blindly trusting the first result. That concatenation let
          // a wrong artist ("Michael Pan" for a Nirvana search) through
          // even when the combined query DID return something.
          let bestMatch = await searchTrackByTitleAndArtist(
            cleanTitle,
            seedArtist,
            5,
          );

          // Retry with featuring text stripped if no match came back.
          if (!bestMatch) {
            const strippedTitle = stripFeaturingText(cleanTitle);
            if (strippedTitle && strippedTitle !== cleanTitle) {
              console.log(
                `🔍 No match for "${cleanTitle}" - retrying with featuring text stripped: "${strippedTitle}"`,
              );
              bestMatch = await searchTrackByTitleAndArtist(
                strippedTitle,
                seedArtist,
                5,
              );
            }
          }

          if (bestMatch && bestMatch.id) {
            reccobeatsIds.push(bestMatch.id);
            resolvedSeeds.push({
              original: seedId,
              cleanId: bestMatch.id,
              reccobeatsId: bestMatch.id,
              title: bestMatch.title,
              artist: bestMatch.artist,
              spotifyId: bestMatch.spotifyId || null,
            });
            console.log(
              `✅ Found via text search: ${bestMatch.title} - ${bestMatch.artist}`,
            );
            resolved = true;
          }

          // ---- Last-resort fallback: sample data ----
          // Matches against cleaned title/artist only, never raw ids.
          if (!resolved) {
            console.log(
              `⚠️ No ReccoBeats results for "${cleanTitle}" / "${seedArtist}", checking sample data...`,
            );
            const searchLower = [cleanTitle, seedArtist]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();
            for (const [id, track] of Object.entries(sampleTracks)) {
              if (
                track.title.toLowerCase().includes(searchLower) ||
                track.artist.toLowerCase().includes(searchLower) ||
                searchLower.includes(track.title.toLowerCase()) ||
                searchLower.includes(track.artist.toLowerCase())
              ) {
                resolvedSeeds.push({
                  original: seedId,
                  cleanId: id,
                  title: track.title,
                  artist: track.artist,
                  spotifyId: track.spotifyId || id,
                  sampleData: track,
                });
                console.log(
                  `✅ Found in sample data: ${track.title} - ${track.artist}`,
                );
                resolved = true;
                break;
              }
            }
          }
        } catch (error) {
          console.error(
            `❌ Text search failed for "${cleanTitle}" / "${seedArtist}":`,
            error.message,
          );
        }
      }

      // Warn if none of the resolution attempts succeeded.
      if (!resolved) {
        console.log(`⚠️ Could not resolve seed: ${JSON.stringify(rawSeed)}`);
      }
    }

    console.log(`📊 Resolved seeds: ${resolvedSeeds.length} tracks`);

    // -----------------------------------------------------------------
    // STEP 2: Ask ReccoBeats for recommendations.
    // Only runs if at least one seed was resolved to a ReccoBeats ID.
    // -----------------------------------------------------------------
    if (reccobeatsIds.length > 0) {
      try {
        const recommendations = await getRecommendations(
          reccobeatsIds,
          playlist_length,
          {
            // Optional audio feature filters from user preferences.
            energy: preferences.energy,
            valence: preferences.valence,
            popularity: preferences.popularity,
          },
        );

        if (recommendations && recommendations.length > 0) {
          console.log(
            `✅ ReccoBeats returned ${recommendations.length} recommendations`,
          );
          playlistData = recommendations.map((track) => ({
            ...track,
            _source: "ReccoBeats",
            _score: 0.85, // ReccoBeats doesn't return scores, assign a nominal one
          }));
          source = "ReccoBeats (free)";
        }
      } catch (error) {
        // Non-fatal: falls through to the sample-data fallback below.
        console.error(
          "❌ ReccoBeats playlist generation failed:",
          error.message,
        );
      }
    }

    // -----------------------------------------------------------------
    // STEP 3: Fallback to sample data if ReccoBeats didn't return
    // anything (either because no seeds resolved or because the API
    // failed / returned an empty list).
    // -----------------------------------------------------------------
    if (!playlistData || playlistData.length === 0) {
      console.log("🔄 Falling back to sample data for playlist generation");

      // seed_tracks may now contain objects, so normalise to plain id
      // strings — otherwise an object would never match a sample-data
      // key and the seed track could leak into its own recommendations.
      const seedIdsForFallback = resolvedSeeds
        .map((s) => s.cleanId || s.original)
        .filter(Boolean);
      const rawFallbackIds = seed_tracks
        .map((s) => (s && typeof s === "object" ? s.id : s))
        .filter(Boolean);
      const fallbackSeeds =
        seedIdsForFallback.length > 0 ? seedIdsForFallback : rawFallbackIds;

      const sampleTracksResult = generateFromSampleData(
        fallbackSeeds,
        preferences,
        playlist_length,
      );

      if (sampleTracksResult && sampleTracksResult.length > 0) {
        playlistData = sampleTracksResult.map((track) => ({
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album || "Unknown Album",
          genre: track.genre || "pop",
          year: track.year || "",
          popularity: track.popularity || 0,
          spotifyId: track.spotifyId || track.id,
          _score: track.score || 0.5,
          _source: "Sample Data",
        }));
        source = "Sample Data (fallback)";
        console.log(
          `✅ Generated ${playlistData.length} tracks from sample data`,
        );
      }
    }

    // If no recommendations found, report a 404 with a helpful message.
    if (!playlistData || playlistData.length === 0) {
      return res.status(404).json({
        error: "No recommendations found. Try different seed tracks.",
        suggestion:
          "Make sure your seed tracks are valid Spotify IDs or try adding more tracks.",
      });
    }

    // -----------------------------------------------------------------
    // STEP 4: Enrich each recommendation and build the response.
    //
    // For each track:
    //   - Derive a valid spotify:track: URI (or null)
    //   - Get a YouTube fallback link
    //   - Backfill album/year/genre from sample data where missing
    //   - Attach a human-readable reason string
    // -----------------------------------------------------------------
    const playlist = [];
    for (const track of playlistData) {
      // Ensure the frontend gets a properly formatted ID (or null).
      const formattedTrackId = formatTrackIdForPlayer(track);

      // Look up a YouTube video / search URL as fallback.
      let youtube = null;
      const searchQuery = `${track.title} ${track.artist} official audio`;

      try {
        const results = await searchYouTube(searchQuery, 1);
        if (results && results.length > 0) {
          youtube = results[0];
        }
      } catch (youtubeError) {
        // YouTube is best-effort — never fail the whole request for it.
        console.warn(`⚠️ YouTube search failed for "${searchQuery}"`);
      }

      // Backfill missing metadata from the sample dataset if possible.
      let album = track.album || "Unknown Album";
      let year = track.year || "";
      let genre = track.genre || "pop";

      const sampleMatch = findTrackInSampleData(track.title, track.artist);
      if (sampleMatch) {
        album = sampleMatch.album || album;
        year = sampleMatch.year || year;
        genre = sampleMatch.genre || genre;
      }

      playlist.push({
        track: {
          // Internal id (ReccoBeats id / sample-data key) — for reference
          // and lookup only. NEVER pass this to the Spotify player.
          id: track.id,

          // The only field that should ever be used to load the Spotify embed.
          // null when it couldn't confirm a real Spotify ID for this track —
          // the frontend must fall back to `youtube` in that case instead of
          // guessing with `id`. Using `id` here previously caused the player
          // to load (or silently fail on, leaving a stale track playing) a
          // track unrelated to the one shown in the playlist.
          spotifyUri: formattedTrackId || null,

          title: track.title,
          artist: track.artist,
          album: album,
          genre: genre,
          year: year,
          popularity: track.popularity || 0,

          // Convenience boolean so the frontend can decide whether to
          // render the Spotify embed or the YouTube fallback.
          hasSpotifyId: !!formattedTrackId,
        },
        score: track._score || 0.8,
        // Human-readable explanation of why this track was recommended.
        reason:
          track._source === "Sample Data"
            ? `Based on your preferences${preferences.mood ? ` (${preferences.mood})` : ""}`
            : `Recommended by ReccoBeats based on your seed tracks`,
        youtube: youtube,
        source: track._source || source,
      });
    }

    // Final response. Includes a message when any track lacks Spotify
    // playback so the user knows why some tracks behave differently.
    res.json({
      playlist: playlist,
      total: playlist.length,
      seed_tracks: seed_tracks,
      resolved_seeds: resolvedSeeds.map((s) => `${s.title} - ${s.artist}`),
      preferences: preferences,
      source: source,
      message: playlist.some((t) => !t.track.hasSpotifyId)
        ? "Some tracks may not have Spotify playback available - YouTube links provided"
        : null,
    });
  } catch (error) {
    // Catch-all error handler — any uncaught exception in the route
    // produces a clean 500 response with the error message.
    console.error("❌ Playlist generation error:", error);
    res.status(500).json({
      error: "Failed to generate playlist",
      details: error.message,
    });
  }
});

// Export the router so it can be mounted in server.js.
module.exports = router;
