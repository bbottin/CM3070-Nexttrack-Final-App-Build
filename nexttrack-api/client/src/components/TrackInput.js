// client/src/components/TrackInput.js

import React, { useState, useEffect } from "react";
import axios from "axios";

const API_URL = "http://localhost:3000/api";

// Sample data for matching - this should match your backend sampleTracks.json
// We keep a subset here for frontend matching
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

function TrackInput({ seedTracks, setSeedTracks, apiStatus }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  /**
   * Find a track in sample data by title and artist
   * @param {string} title - Track title
   * @param {string} artist - Artist name
   * @returns {Object|null} Track object with id, title, artist or null
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

  // Search for tracks
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
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Add a track from search results
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

    setSeedTracks([
      ...seedTracks,
      {
        id: track.id,
        title: track.title,
        artist: track.artist,
        source: track.source || "Search",
      },
    ]);

    setSearchResults([]);
    setSearchQuery("");
    setShowResults(false);
  };

  // Remove a track
  const removeTrack = (id) => {
    setSeedTracks(seedTracks.filter((t) => t.id !== id));
  };

  // Handle search on Enter key
  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      searchTracks();
    }
  };

  // Handle manual track ID input
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
      <div className="search-section">
        <div className="search-bar">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Search for a song (e.g., Bohemian Rhapsody Queen)..."
            disabled={apiStatus === "offline"}
            className="track-input"
          />
          <button
            className="btn btn-primary btn-small"
            onClick={addManualTrack}
            disabled={!searchQuery.trim() || apiStatus === "offline"}
          >
            🔍 Search / Add
          </button>
        </div>
        <div className="input-hint">
          Search by song name + artist, or paste a Spotify Track ID
        </div>
      </div>

      {/* Search Results */}
      {showResults && (
        <div className="search-results">
          {isSearching && <div className="search-loading">🔍 Searching...</div>}

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
                    <span className="result-source">via {track.source}</span>
                    {track.matched && (
                      <span className="result-badge matched">✅ Matched</span>
                    )}
                    {track.needsSpotifyId && (
                      <span className="result-badge warning">
                        ⚠️ May not work
                      </span>
                    )}
                  </div>
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

      {/* Seed Tracks List */}
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
