// client/src/components/TrackInput.js

// Import React and the useState hook (for local component state).
// useEffect is imported but not currently used; it may be needed for
// future side effects such as auto-focusing the input on mount.
import React, { useState, useEffect } from "react";
// Import axios for making HTTP requests to the NextTrack backend.
import axios from "axios";

// Base URL for all backend API calls. In development this points to
// the local Express server running on port 3000.
const API_URL = "http://localhost:3000/api";

// ---------------------------------------------------------------------------
// SAMPLE_TRACKS
// A hard-coded, frontend-only subset of the backend's sampleTracks.json.
//
// WHY THIS EXISTS:
// The backend can return tracks whose IDs are not real Spotify IDs (e.g.,
// MusicBrainz "mbid:" IDs or ReccoBeats UUIDs). When that happens, the
// playlist generated from those seed tracks may fail because ReccoBeats
// requires genuine Spotify IDs to look up audio features.
//
// This map lets the frontend recognise well-known sample tracks and swap
// in their canonical Spotify IDs before sending them to the backend. Only
// title and artist are kept here — the audio features live on the backend.
// ---------------------------------------------------------------------------
const SAMPLE_TRACKS = {
  "spotify:track:6rqhFgbbKwnb9MLmUQDhG6": {
    title: "Bohemian Rhapsody",
    artist: "Queen",
  },
  "spotify:track:7Mts0OfPorF4iwOomvfqn1": {
    title: "Imagine",
    artist: "John Lennon",
  },
  "spotify:track:3rUGC1wUpYfSS9zVQ4COI9": {
    title: "Digital Love",
    artist: "Daft Punk",
  },
  "spotify:track:2TpxZ7JUBn3uw46aR7qd6V": {
    title: "Stairway to Heaven",
    artist: "Led Zeppelin",
  },
  "spotify:track:4iV5W9uYEdYUVa79Axb7Rh": {
    title: "One More Time",
    artist: "Daft Punk",
  },
  "spotify:track:5yQn6jYuXh4l2GQToeL29p": {
    title: "Smells Like Teen Spirit",
    artist: "Nirvana",
  },
  "spotify:track:6bPxtEf5jAKoKcCgTdV2jO": {
    title: "Billie Jean",
    artist: "Michael Jackson",
  },
  "spotify:track:6H4N7nG4m7nTU0DkR8lB6J": {
    title: "Nights in White Satin",
    artist: "The Moody Blues",
  },
  "spotify:track:6aFtZ6JkWtM5ps3T9ZJZCO": {
    title: "Every Breath You Take",
    artist: "The Police",
  },
  "spotify:track:7F2Z5FTcKb2J3cwe5Tf59y": {
    title: "Around the World",
    artist: "Daft Punk",
  },
};

/**
 * TrackInput component
 * ------------------------------------------------------------
 * This component handles the "search and select seed tracks"
 * stage of the NextTrack user flow. It lets the user:
 *   1. Search for tracks by song name / artist.
 *   2. Add search results to the seed track list.
 *   3. Paste a Spotify track ID directly.
 *   4. Remove individual seed tracks.
 *
 * It is a "controlled" component: the actual list of seed tracks
 * lives in the parent (App.js) and is passed in via props. This
 * component only renders the UI and calls `setSeedTracks` to
 * propose changes.
 *
 * Props:
 *  - seedTracks:    Array of seed track objects
 *                   (shape: { id, title, artist, source? })
 *  - setSeedTracks: Setter provided by the parent for updating
 *                   the seed tracks array.
 *  - apiStatus:     String, either "online" or "offline". Used to
 *                   disable search while the backend is unreachable.
 */
function TrackInput({ seedTracks, setSeedTracks, apiStatus }) {
  // ---- Local component state ----

  // The current text in the search box.
  const [searchQuery, setSearchQuery] = useState("");
  // The list of tracks returned by the last search, after any
  // frontend-side normalization (see searchTracks below).
  const [searchResults, setSearchResults] = useState([]);
  // True while a search request is in flight — drives the
  // "Searching..." spinner.
  const [isSearching, setIsSearching] = useState(false);
  // True once a search has been initiated, so the results panel
  // is visible. Used together with searchResults.length.
  const [showResults, setShowResults] = useState(false);

  /**
   * findSampleTrack
   * ------------------------------------------------------------
   * Attempts to find a matching entry in SAMPLE_TRACKS using the
   * given title and/or artist. Matching is case-insensitive and
   * substring-based (e.g., "bohemian" matches "Bohemian Rhapsody").
   *
   * @param {string} title  - Track title (may be empty).
   * @param {string} artist - Artist name (may be empty).
   * @returns {Object|null} { id, title, artist } on match, else null.
   */
  const findSampleTrack = (title, artist) => {
    if (!title && !artist) return null;

    const titleLower = title?.toLowerCase() || "";
    const artistLower = artist?.toLowerCase() || "";

    for (const [id, track] of Object.entries(SAMPLE_TRACKS)) {
      const trackTitleLower = track.title?.toLowerCase() || "";
      const trackArtistLower = track.artist?.toLowerCase() || "";

      // Substring matches (not exact) — this is deliberately lenient
      // so that minor formatting differences still match.
      const titleMatch = titleLower && trackTitleLower.includes(titleLower);
      const artistMatch = artistLower && trackArtistLower.includes(artistLower);

      // If both title and artist were given, require both to match.
      if (titleLower && artistLower) {
        if (titleMatch && artistMatch) {
          return { id, title: track.title, artist: track.artist };
        }
      }
      // If only title was given, match on title.
      else if (titleLower && !artistLower) {
        if (titleMatch) {
          return { id, title: track.title, artist: track.artist };
        }
      }
      // If only artist was given, match on artist.
      else if (!titleLower && artistLower) {
        if (artistMatch) {
          return { id, title: track.title, artist: track.artist };
        }
      }
    }
    return null;
  };

  /**
   * searchTracks
   * ------------------------------------------------------------
   * Queries the backend's /api/search endpoint and processes the
   * results for display. As part of processing:
   *   - If a result has a MusicBrainz "mbid:" ID, the app tries to find
   *     its canonical Spotify ID in SAMPLE_TRACKS. If found, the
   *     Spotify ID gets swappd in and mark the result as "matched".
   *   - If no match is found, it gets flagged with `needsSpotifyId`
   *     so the UI can warn the user that it may not work.
   */
  const searchTracks = async () => {
    // Ignore trivial queries — anything under 2 characters is likely
    // to return too many results and is probably a typo in progress.
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      return;
    }

    setIsSearching(true);
    setShowResults(true);

    try {
      const response = await axios.get(`${API_URL}/search`, {
        params: {
          q: searchQuery,
          limit: 10,
        },
      });

      if (response.data && response.data.results) {
        // Normalize each result so the UI can rely on consistent
        // fields (id, source, matched, needsSpotifyId).
        const results = response.data.results.map((track) => {
          // Case: the backend returned a MusicBrainz-style ID.
          // Try to find its Spotify equivalent in our sample map.
          if (track.id && track.id.startsWith("mbid:")) {
            const sampleMatch = findSampleTrack(track.title, track.artist);
            if (sampleMatch) {
              return {
                ...track,
                id: sampleMatch.id,
                source: "Sample (matched)",
                matched: true,
              };
            }
            // No sample match — mark it as potentially unusable.
            // The backend may still try to resolve it, but warns
            // the user in the UI.
            return {
              ...track,
              source: `${track.source} (may not work)`,
              needsSpotifyId: true,
            };
          }
          return track;
        });

        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      // On network / server errors, clear the results so the UI
      // shows the "no results" state rather than a broken list.
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  /**
   * addTrackFromSearch
   * ------------------------------------------------------------
   * Adds a track from the search results panel to the seed track
   * list. Guards against duplicates, and warns the user if the
   * track is unlikely to work (no confirmed Spotify ID).
   */
  const addTrackFromSearch = (track) => {
    // Duplicate check by ID or by title+artist pair.
    if (
      seedTracks.some(
        (t) =>
          t.id === track.id ||
          (t.title === track.title && t.artist === track.artist),
      )
    ) {
      alert("This track is already in your list!");
      return;
    }

    // Warn the user if the track has no reliable Spotify ID.
    if (track.needsSpotifyId) {
      alert(
        "⚠️ This track is from MusicBrainz and may not work for generating recommendations.\n\n" +
          "Try searching with the artist name for better results, or use a Spotify track ID.",
      );
    }

    // Append to the seed track list. Preserving the `source` so
    // the UI can display where the track came from.
    setSeedTracks([
      ...seedTracks,
      {
        id: track.id,
        title: track.title,
        artist: track.artist,
        source: track.source || "Search",
      },
    ]);

    // Clear the search state so the panel closes and the user can
    // start a new search.
    setSearchResults([]);
    setSearchQuery("");
    setShowResults(false);
  };

  // Removes a seed track by its ID. Called from the ✕ on each tag.
  const removeTrack = (id) => {
    setSeedTracks(seedTracks.filter((t) => t.id !== id));
  };

  // Allows pressing Enter in the search box to trigger a search,
  // matching typical search-bar behaviour.
  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      searchTracks();
    }
  };

  /**
   * addManualTrack
   * ------------------------------------------------------------
   * Handles the "Search / Add" button. If the input looks like a
   * Spotify track ID (either a full URI or a 22-character base62
   * string), it is added directly as a seed track. Otherwise, the
   * input is treated as a search query.
   */
  const addManualTrack = () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    // Heuristic: does this look like a Spotify ID?
    if (trimmed.includes("spotify:track:") || trimmed.length === 22) {
      // Duplicate guard for manual IDs.
      if (seedTracks.some((t) => t.id === trimmed)) {
        alert("Track already added");
        return;
      }

      // Try to enrich the ID with title/artist by looking it up
      // in SAMPLE_TRACKS. If not found, it falls back to using the
      // ID itself as the title and "Unknown" as the artist.
      let title = trimmed;
      let artist = "Unknown";

      for (const [id, track] of Object.entries(SAMPLE_TRACKS)) {
        if (id === trimmed || id.includes(trimmed) || trimmed.includes(id)) {
          title = track.title;
          artist = track.artist;
          break;
        }
      }

      setSeedTracks([
        ...seedTracks,
        {
          id: trimmed,
          title: title,
          artist: artist,
        },
      ]);
      setSearchQuery("");
    } else {
      // It's not an ID — treat the input as a search query.
      searchTracks();
    }
  };

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="track-input-container">
      {/* ---- Search bar ---- */}
      <div className="search-section">
        <div className="search-bar">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Search for a song (e.g., Bohemian Rhapsody Queen)..."
            // Search is disabled when the backend is unreachable.
            disabled={apiStatus === "offline"}
            className="track-input"
          />
          <button
            className="btn btn-primary btn-small"
            onClick={addManualTrack}
            // Button is disabled for empty input or offline backend.
            disabled={!searchQuery.trim() || apiStatus === "offline"}
          >
            🔍 Search / Add
          </button>
        </div>
        <div className="input-hint">
          Search by song name + artist, or paste a Spotify Track ID
        </div>
      </div>

      {/* ---- Search results panel ---- */}
      {/* Only shown once a search has been triggered. It has three
          possible states: loading, empty or populated. */}
      {showResults && (
        <div className="search-results">
          {/* State 1: search in progress. */}
          {isSearching && <div className="search-loading">🔍 Searching...</div>}

          {/* State 2: search completed but returned nothing. */}
          {!isSearching && searchResults.length === 0 && searchQuery && (
            <div className="search-no-results">
              No results found. Try a different search term or paste a Spotify
              ID.
              <br />
              <small style={{ color: "#666688" }}>
                Tip: Include the artist name for better results (e.g., "Steve
                Aoki")
              </small>
            </div>
          )}

          {/* State 3: search returned results. */}
          {!isSearching && searchResults.length > 0 && (
            <div className="results-list">
              <div className="results-header">
                Found {searchResults.length} tracks
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => setShowResults(false)}
                >
                  ✕ Close
                </button>
              </div>

              {/* Map each result into a clickable row. */}
              {searchResults.map((track, index) => (
                <div key={track.id + index} className="result-item">
                  <div className="result-info">
                    <span className="result-title">{track.title}</span>
                    <span className="result-artist">{track.artist}</span>
                    {track.album && (
                      <span className="result-album">• {track.album}</span>
                    )}
                    {track.year && (
                      <span className="result-year">({track.year})</span>
                    )}
                    {/* Show the track's provenance (Spotify, Last.fm, etc.) */}
                    <span className="result-source">via {track.source}</span>

                    {/* Positive badge when successfully mapped
                        the result to a real Spotify ID. */}
                    {track.matched && (
                      <span className="result-badge matched">✅ Matched</span>
                    )}

                    {/* Warning badge when the track may not work. */}
                    {track.needsSpotifyId && (
                      <span className="result-badge warning">
                        ⚠️ May not work
                      </span>
                    )}
                  </div>

                  {/* Add button. Disabled when the track
                      cannot be resolved to a Spotify ID — this
                      prevents the user from adding a track that
                      will later fail to generate recommendations. */}
                  <button
                    className="btn btn-success btn-small"
                    onClick={() => addTrackFromSearch(track)}
                    disabled={track.needsSpotifyId && !track.matched}
                  >
                    {track.matched ? "+ Add" : "⚠️ Add Anyway"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ---- Seed track tags ---- */}
      {/* Each seed track is rendered as a small pill/tag with an
          index number, the title (and artist when known), a source
          label and a ✕ button to remove it. */}
      <div className="seed-tracks-list">
        {seedTracks.map((track, index) => (
          <div key={track.id + index} className="seed-track-tag">
            <span>#{index + 1}</span>
            <span className="track-name">
              {track.title || track.id}
              {track.artist && track.artist !== "Unknown" && (
                <span className="track-artist-small"> - {track.artist}</span>
              )}
              {track.source && (
                <span className="track-source-tag">{track.source}</span>
              )}
            </span>
            <span className="remove" onClick={() => removeTrack(track.id)}>
              ✕
            </span>
          </div>
        ))}

        {/* Empty state — shown when no seed tracks exist yet. */}
        {seedTracks.length === 0 && (
          <span style={{ color: "#666688", fontSize: "0.9rem" }}>
            No seed tracks added yet. Search for a song above!
          </span>
        )}
      </div>
    </div>
  );
}

// Export the component so App.js can render it.
export default TrackInput;
