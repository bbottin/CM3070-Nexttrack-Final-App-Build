// src/routes/playlist.js

const express = require("express");
const router = express.Router();
const {
  getRecommendations,
  searchTrack,
  searchTrackByTitleAndArtist,
  extractSpotifyId,
} = require("../services/reccobeats");
const { searchYouTube, getYouTubeEmbedUrl } = require("../services/youtube");
const sampleTracks = require("../data/sampleTracks.json");

/**
 * Helper function to find a track in sample data by title and artist
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

    if (titleLower && artistLower) {
      if (titleMatch && artistMatch) {
        return { ...track, id };
      }
    } else if (titleLower && !artistLower) {
      if (titleMatch) {
        return { ...track, id };
      }
    } else if (!titleLower && artistLower) {
      if (artistMatch) {
        return { ...track, id };
      }
    }
  }
  return null;
}

/**
 * Strip a redundant leading artist name from a title, e.g. title
 * "Nirvana - Smells Like Teen Spirit" with artist "Nirvana" -> "Smells Like
 * Teen Spirit". Last.fm's track name field sometimes already bakes the
 * artist into the title this way, which then poisons any search that
 * concatenates title+artist together (the artist name effectively appears
 * twice, drowning out the actual song title in a fuzzy text match).
 */
function stripRedundantArtistPrefix(title, artist) {
  if (!title || !artist) return title;
  const prefixPattern = new RegExp(
    `^${artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-:–—]\\s*`,
    "i",
  );
  return title.replace(prefixPattern, "").trim() || title;
}

/**
 * Strip parenthetical annotations and "feat./ft./featuring" credits from a
 * track title, e.g. "On My Own (Feat. Darla Jade)" -> "On My Own". Search
 * backends often match much better on the bare title than on a string with
 * a featured-artist annotation baked in.
 */
function stripFeaturingText(title) {
  if (!title) return title;
  return title
    .replace(/\([^)]*\)/g, "") // drop anything in parentheses
    .replace(/\[[^\]]*\]/g, "") // drop anything in brackets
    .replace(/\b(feat\.?|ft\.?|featuring)\b.*$/i, "") // drop trailing "feat. X" with no parens
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a string is a valid Spotify ID format
 */
function isValidSpotifyId(input) {
  if (!input) return false;
  if (input.startsWith("spotify:track:")) return true;
  if (input.includes("open.spotify.com/track/")) return true;
  if (/^[a-zA-Z0-9_-]{22}$/.test(input)) return true;
  return false;
}

/**
 * Generate a playlist using sample data with proper Spotify IDs
 */
function generateFromSampleData(
  seedIds,
  preferences = {},
  playlist_length = 10,
) {
  let candidates = [];
  const seedIdsSet = new Set(seedIds);

  for (const [id, track] of Object.entries(sampleTracks)) {
    // Skip if this track is in the seed list
    if (seedIdsSet.has(id)) continue;
    // Also check if the clean Spotify ID matches
    const cleanId = extractSpotifyId(id);
    if (seedIdsSet.has(cleanId)) continue;
    if (candidates.find((c) => c.id === id)) continue;

    candidates.push({ ...track, id });
  }

  const scored = candidates.map((candidate) => {
    let score = 0.5;

    // Mood-based scoring
    if (preferences.mood === "energetic" && candidate.energy > 0.7)
      score += 0.3;
    if (preferences.mood === "calm" && candidate.energy < 0.4) score += 0.3;
    if (preferences.mood === "happy" && candidate.valence > 0.6) score += 0.3;
    if (preferences.mood === "sad" && candidate.valence < 0.4) score += 0.3;

    // Discovery factor
    if (preferences.discovery && preferences.discovery > 0.5) {
      score += (1 - (candidate.popularity || 0.5)) * 0.2;
    }

    // Genre bias
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

  scored.sort((a, b) => b.score - a.score);

  // Return top N unique tracks
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
 * Format a track ID for the Spotify player
 * Ensures the ID is in the format expected by the Spotify Embed
 */
function formatTrackIdForPlayer(track) {
  // Use spotifyId if available, otherwise use id
  let spotifyId = track.spotifyId || track.id;

  if (!spotifyId) return null;

  // If it's already a valid Spotify URI, return as-is
  if (spotifyId.startsWith("spotify:track:")) {
    return spotifyId;
  }

  // If it's a Spotify URL, extract the ID
  if (spotifyId.includes("open.spotify.com/track/")) {
    const match = spotifyId.match(/track\/([a-zA-Z0-9_-]+)/);
    if (match) {
      return `spotify:track:${match[1]}`;
    }
  }

  // If it's a clean 22-character ID, format it
  if (/^[a-zA-Z0-9_-]{22}$/.test(spotifyId)) {
    return `spotify:track:${spotifyId}`;
  }

  // If it's a sample data key that's not a valid Spotify ID, try to find the spotifyId property
  if (track.spotifyId && track.spotifyId !== spotifyId) {
    return formatTrackIdForPlayer({ id: track.spotifyId });
  }

  // No valid Spotify ID could be derived (e.g. this is a bare ReccoBeats UUID
  // with no matching Spotify href). Returning it anyway used to make the
  // frontend try to play a garbage ID - which either fails silently or
  // leaves whatever track was previously loaded still playing, making the
  // player look "out of sync" with the playlist. Return null so callers know
  // to fall back to YouTube instead of guessing.
  console.warn(`⚠️ Could not resolve a playable Spotify ID for: ${spotifyId}`);
  return null;
}

/**
 * POST /api/playlist
 * Generate a full playlist using ReccoBeats (FREE) with sample data fallback
 */
router.post("/", async (req, res) => {
  try {
    const { seed_tracks, preferences = {}, playlist_length = 10 } = req.body;

    // Validate input
    if (!seed_tracks || !Array.isArray(seed_tracks) || seed_tracks.length < 1) {
      return res.status(400).json({
        error:
          'Please provide at least 1 seed track in the "seed_tracks" array',
      });
    }

    console.log(`📥 Incoming seed_tracks:`, seed_tracks);

    let playlistData = [];
    let source = "Unknown";
    let reccobeatsIds = [];

    // STEP 1: Process each seed - handle both IDs and text searches
    const resolvedSeeds = [];

    for (const rawSeed of seed_tracks) {
      // Seeds can be a plain string (legacy format, or still valid for a raw
      // Spotify ID) or an { id, title, artist } object. The object form lets
      // us fall back to a direct title/artist search whenever the id alone
      // can't be resolved - which matters a lot for a bare MusicBrainz UUID
      // from Last.fm (e.g. "00c01052-9c70-3840-9106-8380124742ca"), which
      // carries no title/artist of its own and previously had absolutely
      // nothing for the backend to search with once ID lookup failed.
      let seedId = rawSeed;
      let seedTitle = null;
      let seedArtist = null;
      if (rawSeed && typeof rawSeed === "object") {
        seedId = rawSeed.id;
        seedTitle = rawSeed.title || null;
        seedArtist = rawSeed.artist || null;
      }

      let resolved = false;

      // ATTEMPT 1: valid Spotify ID -> convert to ReccoBeats ID
      if (isValidSpotifyId(seedId)) {
        const cleanId = extractSpotifyId(seedId);
        console.log(`🔍 Converting Spotify ID ${cleanId} to ReccoBeats ID...`);

        const rbTrack = await searchTrack(cleanId);
        if (rbTrack && rbTrack.reccobeatsId) {
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
        // Last.fm seed in the "lastfm:Title|Artist" format (used whenever
        // the Last.fm result had no MBID). Parse the embedded title/artist
        // out rather than passing the raw prefixed/piped string as free text.
        const payload = seedId.slice("lastfm:".length);
        const pipeIndex = payload.indexOf("|");
        if (pipeIndex !== -1) {
          seedTitle = seedTitle || payload.slice(0, pipeIndex);
          seedArtist = seedArtist || payload.slice(pipeIndex + 1);
        }
        // Falls through to ATTEMPT 2 below using the parsed title/artist.
      }

      // ATTEMPT 2: title/artist search - covers plain free-text seeds, a
      // parsed "lastfm:Title|Artist" seed, or a bare id (Spotify or MBID)
      // that failed to resolve above but arrived with title/artist attached.
      if (!resolved && (seedTitle || seedArtist)) {
        // Last.fm's title field sometimes already contains the artist name
        // as a prefix (e.g. "Nirvana - Smells Like Teen Spirit"), which
        // poisons a combined search - strip that out before searching.
        const cleanTitle =
          stripRedundantArtistPrefix(seedTitle, seedArtist) || seedTitle;

        console.log(
          `🔍 Searching by title/artist: title="${cleanTitle}" artist="${seedArtist}" (seed id was "${seedId}")`,
        );

        try {
          // Search by title alone and validate the artist matches, rather
          // than concatenating title+artist into one fuzzy query and
          // blindly trusting the first result - that let a wrong artist
          // ("Michael Pan" for a Nirvana search) through even when the
          // combined query DID return something.
          let bestMatch = await searchTrackByTitleAndArtist(
            cleanTitle,
            seedArtist,
            5,
          );

          // If nothing came back at all, retry once with any "(feat. X)"
          // annotation stripped out too - e.g.
          // "On My Own (Feat. Darla Jade)" -> "On My Own".
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

          if (!resolved) {
            // No ReccoBeats results - try sample data, matching against the
            // cleaned title/artist, never a raw id string.
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

      if (!resolved) {
        console.log(`⚠️ Could not resolve seed: ${JSON.stringify(rawSeed)}`);
      }
    }

    console.log(`📊 Resolved seeds: ${resolvedSeeds.length} tracks`);

    // STEP 2: Get recommendations using ReccoBeats IDs
    if (reccobeatsIds.length > 0) {
      try {
        const recommendations = await getRecommendations(
          reccobeatsIds,
          playlist_length,
          {
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
            _score: 0.85,
          }));
          source = "ReccoBeats (free)";
        }
      } catch (error) {
        console.error(
          "❌ ReccoBeats playlist generation failed:",
          error.message,
        );
      }
    }

    // STEP 3: Fallback to sample data if ReccoBeats didn't work
    if (!playlistData || playlistData.length === 0) {
      console.log("🔄 Falling back to sample data for playlist generation");

      // Use resolved seeds or original seed_tracks for the fallback.
      // seed_tracks may now contain {id, title, artist} objects rather than
      // plain strings, so normalize to plain id strings here - otherwise an
      // object would never match sample data keys and the seed track could
      // leak into its own recommendations.
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

    if (!playlistData || playlistData.length === 0) {
      return res.status(404).json({
        error: "No recommendations found. Try different seed tracks.",
        suggestion:
          "Make sure your seed tracks are valid Spotify IDs or try adding more tracks.",
      });
    }

    // STEP 4: Build final playlist with properly formatted Spotify IDs
    const playlist = [];
    for (const track of playlistData) {
      // Format the ID properly for the Spotify player
      const formattedTrackId = formatTrackIdForPlayer(track);

      let youtube = null;
      const searchQuery = `${track.title} ${track.artist} official audio`;

      try {
        const results = await searchYouTube(searchQuery, 1);
        if (results && results.length > 0) {
          youtube = results[0];
        }
      } catch (youtubeError) {
        console.warn(`⚠️ YouTube search failed for "${searchQuery}"`);
      }

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
          // Internal id (ReccoBeats id / sample-data key) - for reference/lookup only,
          // NEVER pass this to the Spotify player.
          id: track.id,
          // The only field that should ever be used to load the Spotify embed.
          // null when we couldn't confirm a real Spotify ID for this track -
          // the frontend must fall back to `youtube` in that case instead of
          // guessing with `id`, which is what previously caused the player to
          // load (or silently fail on, leaving a stale track playing) a track
          // unrelated to the one shown in the playlist.
          spotifyUri: formattedTrackId || null,
          title: track.title,
          artist: track.artist,
          album: album,
          genre: genre,
          year: year,
          popularity: track.popularity || 0,
          hasSpotifyId: !!formattedTrackId,
        },
        score: track._score || 0.8,
        reason:
          track._source === "Sample Data"
            ? `Based on your preferences${preferences.mood ? ` (${preferences.mood})` : ""}`
            : `Recommended by ReccoBeats based on your seed tracks`,
        youtube: youtube,
        source: track._source || source,
      });
    }

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
    console.error("❌ Playlist generation error:", error);
    res.status(500).json({
      error: "Failed to generate playlist",
      details: error.message,
    });
  }
});

module.exports = router;
