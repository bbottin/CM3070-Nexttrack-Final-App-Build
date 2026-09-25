// client/src/components/MusicPlayer.js

// Import React hooks:
// - useState: used to track local component state (e.g., Spotify embed error)
// - useEffect: imported but not currently used, may be needed for future side effects
import React, { useState, useEffect } from "react";

/**
 * MusicPlayer component
 * ------------------------------------------------------------
 * This component is responsible for displaying the currently
 * selected track, embedding the Spotify player (when a valid
 * Spotify ID exists) and providing playback navigation controls
 * (Prev / Next). It is a controlled component: the parent (App.js)
 * owns the current track index and playlist and passes them down
 * as props.
 *
 * Props:
 *  - currentTrack:      the object for the currently playing track
 *  - playlist:          the full array of tracks in the current playlist
 *  - currentTrackIndex: index of the current track within playlist
 *  - onNext:            callback to advance to the next track
 *  - onPrev:            callback to go back to the previous track
 *  - isPlaying:         boolean indicating play state (owned by parent)
 *  - setIsPlaying:      setter to toggle play state (owned by parent)
 *  - playAll:           callback to start playback from the beginning
 */
function MusicPlayer({
  currentTrack,
  playlist,
  currentTrackIndex,
  onNext,
  onPrev,
  isPlaying,
  setIsPlaying,
  playAll,
}) {
  // Local state to detect when the Spotify embed fails to load.
  // If this is true, it falls back to showing YouTube / Spotify links
  // instead of the broken embed.
  const [spotifyError, setSpotifyError] = useState(false);

  // Debug logging to help trace re-renders and prop values during development.
  console.log("🎵 MusicPlayer rendered");
  console.log("🎵 currentTrack:", currentTrack);
  console.log("🎵 currentTrackIndex:", currentTrackIndex);
  console.log("🎵 playlist length:", playlist.length);

  // ------------------------------------------------------------
  // Guard clause: if no track is selected yet, it shows a placeholder
  // message and (if a playlist exists) a "Play All" button.
  // ------------------------------------------------------------
  if (!currentTrack) {
    return (
      <div
        className="player-container"
        style={{ textAlign: "center", padding: "40px" }}
      >
        <p>No track selected. Generate a playlist or click Play on a track.</p>
        {playlist.length > 0 && (
          <button className="btn btn-play-all" onClick={playAll}>
            ▶ Play All
          </button>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------
  // Defensive check: currentTrack should always have a nested
  // `track` property. If it doesn't, the data is malformed and
  // it will bail out rather than crash.
  // ------------------------------------------------------------
  if (!currentTrack.track) {
    console.error("❌ currentTrack has no track property:", currentTrack);
    return <div>Error: Invalid track data</div>;
  }

  // Destructure the current track's data for readability:
  // - track: the actual track metadata (title, artist, spotifyUri, ...)
  // - youtube: optional YouTube fallback info (searchUrl, videoId)
  const { track, youtube } = currentTrack;

  // ------------------------------------------------------------
  // Extract a clean Spotify track ID from `track.spotifyUri`.
  //
  // IMPORTANT DESIGN NOTE:
  // `track.id` is an INTERNAL identifier (a ReccoBeats UUID or a
  // sample-data key) and is NOT a playable Spotify ID. The backend
  // exposes `track.spotifyUri` as the ONLY reliable source for a
  // real Spotify ID and sets it to null when no valid Spotify ID
  // is known.
  // ------------------------------------------------------------
  const getSpotifyTrackId = (spotifyUri) => {
    // No Spotify URI, nothing is extracted.
    if (!spotifyUri) return null;

    // Case 1: The URI in Spotify's canonical "spotify:track:XXXX" format.
    if (spotifyUri.startsWith("spotify:track:")) {
      return spotifyUri.split(":")[2];
    }

    // Case 2: The URI is already a bare 22-character Spotify ID.
    if (/^[a-zA-Z0-9_-]{22}$/.test(spotifyUri)) {
      return spotifyUri;
    }

    // Case 3: Unrecognized format — treat as invalid.
    return null;
  };

  // Only attempt to extract a Spotify ID if the backend has flagged
  // that this track has a valid Spotify ID (`hasSpotifyId === true`).
  // This prevents accidental use of bogus IDs.
  const spotifyTrackId = track.hasSpotifyId
    ? getSpotifyTrackId(track.spotifyUri)
    : null;

  // Additional debug logging for verifying the Spotify extraction.
  console.log(`🎵 Track: ${track.title} by ${track.artist}`);
  console.log(`🎵 Track ID: ${track.id}`);
  console.log(`🎵 Spotify Track ID: ${spotifyTrackId}`);

  // Build the Spotify embed URL only when there is a valid Spotify ID.
  // Otherwise itis left as null and the fallback UI will be rendered.
  const spotifyEmbedUrl = spotifyTrackId
    ? `https://open.spotify.com/embed/track/${spotifyTrackId}?utm_source=generator&theme=0`
    : null;

  // Build a YouTube search URL as a fallback. Prefer the URL supplied
  // by the backend (youtube.searchUrl); otherwise construct one from
  // the track title and artist.
  const youtubeSearchUrl =
    youtube?.searchUrl ||
    `https://www.youtube.com/results?search_query=${encodeURIComponent(track.title + " " + track.artist)}`;

  // Handler for when the Spotify iframe fails to load.
  // Sets a local flag so we can swap to the fallback UI.
  const handleSpotifyError = () => {
    console.warn("⚠️ Spotify embed failed for track:", track.title);
    setSpotifyError(true);
  };

  return (
    <div className="player-container">
      {/* ---- Now Playing information block ---- */}
      <div className="now-playing-info" style={{ marginBottom: "15px" }}>
        <h3 style={{ color: "#c8c8ff" }}>🎵 Now Playing: {track.title}</h3>
        <p style={{ color: "#8888aa" }}>
          {track.artist} • {track.album || "Unknown Album"}
        </p>
        <p style={{ color: "#666688", fontSize: "0.9rem" }}>
          Track {currentTrackIndex + 1} of {playlist.length}
        </p>

        {/* Explanation box: shows WHY this track was recommended.
            Core differentiator of NextTrack vs commercial systems. */}
        {currentTrack.reason && (
          <div className="explanation-box" style={{ marginTop: "10px" }}>
            <div className="label">Why this track?</div>
            <div className="reason">{currentTrack.reason}</div>
          </div>
        )}
      </div>

      {/* ---- Spotify Embed Player ---- */}
      {/* Rendered only when we have a valid Spotify ID AND the embed
          hasn't already errored out. The `key` prop forces React to
          fully re-mount the iframe whenever the track changes, which
          is required because Spotify's embed doesn't always reload
          its content on prop updates alone. */}
      {spotifyEmbedUrl && !spotifyError ? (
        <div className="spotify-wrapper">
          <iframe
            key={spotifyTrackId} // Force re-render when track changes
            style={{ borderRadius: "12px", width: "100%", height: "152px" }}
            src={spotifyEmbedUrl}
            width="100%"
            height="152"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title={`Spotify player - ${track.title}`}
            onError={handleSpotifyError}
          />
        </div>
      ) : (
        // ---- Fallback UI ----
        // Shown when either no valid Spotify ID is available or the
        // embed has errored. Provides external links so the user can
        // still listen to the track elsewhere.
        <div
          style={{
            textAlign: "center",
            padding: "30px",
            background: "#1a1a3a",
            borderRadius: "12px",
          }}
        >
          <p style={{ color: "#ffa726", fontSize: "1rem" }}>
            🎵 Listen on Spotify or search on YouTube
          </p>
          <div
            style={{
              display: "flex",
              gap: "15px",
              justifyContent: "center",
              marginTop: "15px",
              flexWrap: "wrap",
            }}
          >
            {/* "Open in Spotify" link — only shown when there is an ID. */}
            {spotifyTrackId && (
              <a
                href={`https://open.spotify.com/track/${spotifyTrackId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                🎵 Open in Spotify
              </a>
            )}

            {/* "Search on YouTube" link — always available as fallback. */}
            <a
              href={youtubeSearchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
            >
              🔍 Search on YouTube
            </a>
          </div>
        </div>
      )}

      {/* ---- Playback navigation controls ---- */}
      <div className="player-controls">
        {/* Previous track button — handled by parent via onPrev. */}
        <button className="btn btn-secondary" onClick={onPrev}>
          ⏮ Prev
        </button>

        {/* Position indicator, e.g. "3 / 10". */}
        <span style={{ color: "#666688", fontSize: "0.9rem" }}>
          {currentTrackIndex + 1} / {playlist.length}
        </span>

        {/* Next track button — handled by parent via onNext. */}
        <button className="btn btn-secondary" onClick={onNext}>
          Next ⏭
        </button>

        {/* Secondary "Open in Spotify" shortcut in the controls bar. */}
        {spotifyTrackId && (
          <a
            href={`https://open.spotify.com/track/${spotifyTrackId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-small"
          >
            🎵 Open in Spotify
          </a>
        )}
      </div>
    </div>
  );
}

// Export the component so it can be imported into App.js
export default MusicPlayer;
