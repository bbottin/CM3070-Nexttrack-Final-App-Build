// client/src/components/TrackInput.js
//
// Seed-track search box + results list + "your seed tracks" tag list.
// Talks directly to the backend's /api/search (bypassing App.js) since
// search results never need to flow through App.js's playlist state.

import React, { useState, useEffect } from "react";
import axios from "axios";

const API_URL = "http://localhost:3000/api";

// ---------------------------------------------------------------------------
// SAMPLE_TRACKS
// A small local mirror of backend/src/data/sampleTracks.json, keyed by
// Spotify URI. Used only for two frontend-only lookups:
//   1. Backfilling title/artist when a raw Spotify ID/URI is pasted
//      directly into the search box (see addManualTrack below).
//   2. As part of the "mbid:" handling in searchTracks - see the NOTE
//      there for why that branch rarely (if ever) fires in practice.
// Keep this in sync manually if the backend's sample dataset changes.
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
 * Lets the user build a list of "seed tracks" that will be sent
 * to the backend for playlist generation. Supports three input
 * modes:
 *   1. Free-text search by song name and/or artist.
 *   2. Pasting a raw Spotify track ID or URI directly.
 *   3. Removing any seed track already in the list.
 *
 * This is a controlled component: the actual seed track list is
 * owned by the parent (App.js) and passed in via props. This
 * component only renders the UI and calls setSeedTracks to
 * propose updates.
 *
 * Props:
 *  - seedTracks:    Array of seed track objects, each shaped as
 *                   { id, title, artist, source? }.
 *  - setSeedTracks: Setter provided by the parent, used to update
 *                   the seed track list.
 *  - apiStatus:     "online" or "offline" - used to disable search
 *                   while the backend is unreachable.
 */
function TrackInput({ seedTracks, setSeedTracks, apiStatus }) {
  // ---- Local component state ----

  // The current text in the search box.
  const [searchQuery, setSearchQuery] = useState("");
  // The list of tracks returned by the last search, after any
  // frontend-side normalisation (see searchTracks below).
  const [searchResults, setSearchResults] = useState([]);
  // True while a search request is in flight - drives the
  // "Searching..." spinner.
  const [isSearching, setIsSearching] = useState(false);
  // True once a search has been initiated, so the results panel
  // becomes visible. Used together with searchResults.length.
  const [showResults, setShowResults] = useState(false);

  /**
   * findSampleTrack
   * ------------------------------------------------------------
   * Case-insensitive substring lookup into the local SAMPLE_TRACKS
   * mirror. Matching is deliberately lenient (partial matches count)
   * so that minor formatting differences still resolve.
   *
   * @param {string} title  - Track title (may be empty)
   * @param {string} artist - Artist name (may be empty)
   * @returns {Object|null} { id, title, artist } on match, else null
   */
  const findSampleTrack = (title, artist) => {
    if (!title && !artist) return null;

    const titleLower = title?.toLowerCase() || "";
    const artistLower = artist?.toLowerCase() || "";

    for (const [id, track] of Object.entries(SAMPLE_TRACKS)) {
      const trackTitleLower = track.title?.toLowerCase() || "";
      const trackArtistLower = track.artist?.toLowerCase() || "";

      // Check if title contains the search term OR artist contains the search term
      const titleMatch = titleLower && trackTitleLower.includes(titleLower);
      const artistMatch = artistLower && trackArtistLower.includes(artistLower);

      // If both title and artist are provided, require both to match
      if (titleLower && artistLower) {
        if (titleMatch && artistMatch) {
          return { id, title: track.title, artist: track.artist };
        }
      }
      // If only title is provided, match on title
      else if (titleLower && !artistLower) {
        if (titleMatch) {
          return { id, title: track.title, artist: track.artist };
        }
      }
      // If only artist is provided, match on artist
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
   * Query the backend's /api/search endpoint and process the
   * results for display. Ignores queries shorter than 2 characters
   * (they tend to return too many results and usually indicate a
   * typo in progress).
   *
   * NOTE: the "mbid:" prefix branch below does not currently match
   * real data. The backend's Last.fm/MusicBrainz-sourced ids are
   * either a bare MBID UUID (e.g.
   * "00c01052-9c70-3840-9106-8380124742ca", no prefix at all) or
   * the "lastfm:Title|Artist" format - never literally prefixed
   * with "mbid:". So this branch rarely (if ever) fires in
   * practice; a bare-MBID result typically flows through unchanged
   * as a normal, unflagged result.
   */
  const searchTracks = async () => {
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
        // Convert results to have usable IDs
        const results = response.data.results.map((track) => {
          // If it's a MusicBrainz ID, try to find a matching Spotify ID
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
            // Keep as is - the backend will try to handle it
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
      // On network/server error, clear results so the UI shows the
      // "no results" state instead of a broken list.
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  /**
   * addTrackFromSearch
   * ------------------------------------------------------------
   * Add a track from the search results panel to the seed track
   * list. Guards against duplicates (by id and by title+artist),
   * and warns the user if the track is unlikely to work
   * (i.e. no confirmed Spotify ID).
   *
   * @param {Object} track - A result item from searchResults
   */
  const addTrackFromSearch = (track) => {
    // Check if track already added
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

    // If the track has a warning about needing a Spotify ID, show a message
    if (track.needsSpotifyId) {
      alert(
        "⚠️ This track is from MusicBrainz and may not work for generating recommendations.\n\n" +
          "Try searching with the artist name for better results, or use a Spotify track ID.",
      );
    }

    // Append to the seed track list, preserving the source tag so
    // the UI can show where each track came from.
    setSeedTracks([
      ...seedTracks,
      {
        id: track.id,
        title: track.title,
        artist: track.artist,
        source: track.source || "Search",
      },
    ]);

    // Reset the search state so the panel closes.
    setSearchResults([]);
    setSearchQuery("");
    setShowResults(false);
  };

  // Remove a seed track by its id (called from the ✕ on each tag).
  const removeTrack = (id) => {
    setSeedTracks(seedTracks.filter((t) => t.id !== id));
  };

  // Pressing Enter in the search box triggers a search, matching
  // typical search-bar behaviour.
  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      searchTracks();
    }
  };

  /**
   * addManualTrack
   * ------------------------------------------------------------
   * Handles the "Search / Add" button click.
   *
   * Two paths:
   *   1. If the input looks like a raw Spotify ID/URI, add it
   *      directly as a seed track (attempting to backfill its
   *      title/artist from the local SAMPLE_TRACKS mirror first).
   *   2. Otherwise, treat the input as a free-text search query.
   */
  const addManualTrack = () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    // Check if it looks like a Spotify ID
    if (trimmed.includes("spotify:track:") || trimmed.length === 22) {
      // It's a track ID
      if (seedTracks.some((t) => t.id === trimmed)) {
        alert("Track already added");
        return;
      }

      // Try to find the track in sample data to get title/artist
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
      // Search instead
      searchTracks();
    }
  };

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
            placeholder="Search for a song (e.g., Bohemian Rhapsody - Queen)..."
            // Disable while the backend is unreachable.
            disabled={apiStatus === "offline"}
            className="track-input"
          />
          <button
            className="btn btn-primary btn-small"
            onClick={addManualTrack}
            // Disable for empty input or offline backend.
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
      {/* Only shown once a search has been triggered. Three possible
          states: loading, empty, or populated. */}
      {showResults && (
        <div className="search-results">
          {/* State 1: search in progress */}
          {isSearching && <div className="search-loading">🔍 Searching...</div>}

          {/* State 2: search completed with zero results */}
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

          {/* State 3: search returned one or more results */}
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

              {/* Map each result to a clickable row. */}
              {searchResults.map((track, index) => {
                // track.verified comes from the backend (see search.js /
                // reccobeats.js searchTracksByTextSmart) and reflects a real
                // confidence signal: true only for cross-validated ReccoBeats
                // matches or our own curated sample data. track.matched is
                // the older, narrower signal (only ever set for a
                // MusicBrainz-id-matched-to-sample-data case that in
                // practice never fires - see note in searchTracks above) -
                // kept here too in case that path is ever revived.
                const isConfident =
                  track.verified === true || track.matched === true;

                return (
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
                      {/* Show where the result came from (ReccoBeats / Last.fm / Sample Data) */}
                      <span className="result-source">via {track.source}</span>

                      {/* Green badge: high-confidence match */}
                      {isConfident && (
                        <span className="result-badge matched">✅ Matched</span>
                      )}

                      {/* Amber badge: track may not resolve to a playable Spotify ID */}
                      {track.needsSpotifyId && !isConfident && (
                        <span className="result-badge warning">
                          ⚠️ May not work
                        </span>
                      )}
                    </div>

                    {/* Add button. Disabled when it knows the track
                        cannot be resolved to a Spotify ID - this
                        prevents the user from adding a seed that will
                        later fail. */}
                    <button
                      className="btn btn-success btn-small"
                      onClick={() => addTrackFromSearch(track)}
                      disabled={track.needsSpotifyId && !isConfident}
                    >
                      {isConfident ? "+ Add" : "⚠️ Add Anyway"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---- Seed track tags ---- */}
      {/* Each seed track is rendered as a small pill with an index,
          the title (plus artist when known), its source label, and
          a ✕ button to remove it. */}
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

        {/* Empty state: shown before the user has added anything. */}
        {seedTracks.length === 0 && (
          <span style={{ color: "#666688", fontSize: "0.9rem" }}>
            No seed tracks added yet. Search for a song above!
          </span>
        )}
      </div>
    </div>
  );
}

export default TrackInput;
