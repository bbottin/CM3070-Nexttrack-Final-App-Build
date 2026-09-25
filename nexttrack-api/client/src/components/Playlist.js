// client/src/components/Playlist.js

// Import React so JSX syntax works inside this file.
import React from "react";

/**
 * Playlist component
 * ------------------------------------------------------------
 * Renders the full list of recommended tracks as a grid of
 * clickable "track cards". Each card shows the track's title,
 * artist, genre, year, recommendation score, explanation and
 * a Play button.
 *
 * This is a "controlled" component: it holds no internal state
 * of its own. The parent (App.js) owns the playlist data and the
 * currently selected track index and this component simply
 * renders those props and calls the callbacks when the user
 * interacts with the UI.
 *
 * Props:
 *  - playlist:          Array of track objects (each shaped like
 *                       { track: {...}, score, reason, youtube })
 *  - currentTrackIndex: Index of the track currently being played.
 *                       Used to visually highlight the active card.
 *  - onPlayTrack:       Callback invoked with the track's index
 *                       when the user clicks a card or its Play button.
 *  - onPlayAll:         Callback invoked when the "Play All" button
 *                       is clicked. Delegated to the parent.
 */
function Playlist({ playlist, currentTrackIndex, onPlayTrack, onPlayAll }) {
  // Debug logging: shows how many tracks the playlist contains,
  // which index is currently active and what the active track is.
  // This is useful for diagnosing mismatches between the player and the list.
  console.log("🎵 Playlist rendered with", playlist.length, "tracks");
  console.log("🎵 Current track index:", currentTrackIndex);
  console.log("🎵 Current track:", playlist[currentTrackIndex]);

  return (
    <div className="playlist-container">
      {/* ---- Playlist header ----
          Displays the total number of tracks and a "Play All" button
          that restarts playback from the first track. */}
      <div className="playlist-header">
        <span>{playlist.length} tracks</span>
        <button className="btn btn-play-all btn-small" onClick={onPlayAll}>
          ▶ Play All
        </button>
      </div>

      {/* ---- Track grid ----
          Maps over the playlist array and renders one card per
          track. The `index` is used both as a React key (with the
          track id when available) and as the identifier passed to
          the onPlayTrack callback. */}
      <div className="playlist-grid">
        {playlist.map((item, index) => {
          // `isActive` is true when this card corresponds to the
          // track currently being played. It drives both the visual
          // highlight and the "Playing" vs "Play" button label.
          const isActive = currentTrackIndex === index;

          // Per-track debug log to make it easy to see, in the
          // console, which card is currently flagged as ACTIVE.
          console.log(
            `🎵 Track ${index}: ${item.track.title} - ${isActive ? "ACTIVE" : ""}`,
          );

          return (
            // ---- Individual track card ----
            // The `key` combines the track id (when present) with the
            // index. Using the index as a fallback ensures a unique
            // key even for tracks that share an id (e.g., duplicate
            // entries in sample data). The `active` class applies the
            // highlight styling for the currently playing track.
            <div
              key={`${item.track.id || index}-${index}`}
              className={`track-card ${isActive ? "active" : ""}`}
              onClick={() => {
                // Clicking anywhere on the card triggers playback of
                // this track via the parent's onPlayTrack callback.
                console.log(`👆 Clicked track ${index}: ${item.track.title}`);
                onPlayTrack(index);
              }}
            >
              {/* ---- Track metadata ---- */}
              <div className="track-title">{item.track.title}</div>
              <div className="track-artist">{item.track.artist}</div>

              {/* ---- Secondary metadata row ----
                  Shows genre, year and — when the backend supplies
                  one — the recommendation "match" score displayed as
                  a percentage. The score comes from the similarity
                  algorithm in the backend. */}
              <div className="track-meta">
                <span>{item.track.genre || "Unknown"}</span>
                <span>{item.track.year || "N/A"}</span>
                {item.score && (
                  <span className="score-badge">
                    Match: {(item.score * 100).toFixed(0)}%
                  </span>
                )}
              </div>

              {/* ---- Explanation box ----
                  Displays the human-readable reason the backend
                  generated for this recommendation. This is a key
                  differentiator of NextTrack vs. commercial systems,
                  which typically don't explain their recommendations. */}
              {item.reason && (
                <div className="explanation-box">
                  <div className="label">Why this track?</div>
                  <div className="reason">{item.reason}</div>
                </div>
              )}

              {/* ---- Action button ----
                  Provides an explicit Play button in addition to the
                  card-wide click handler. The visual style switches
                  between success (green) and primary (purple) based
                  on whether this card is the currently active one. */}
              <div className="track-actions">
                <button
                  className={`btn ${isActive ? "btn-success" : "btn-primary"} btn-small`}
                  onClick={(e) => {
                    // Stop the click from bubbling up to the parent
                    // card's onClick handler. Without this, the button
                    // click would fire onPlayTrack twice: once for the
                    // button and once for the surrounding card.
                    e.stopPropagation();
                    console.log(`▶️ Play button clicked for track ${index}`);
                    onPlayTrack(index);
                  }}
                >
                  {/* Button label reflects current playback state:
                      "Playing" for the active track, "Play" otherwise. */}
                  {isActive ? "▶ Playing" : "▶ Play"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Export the component so it can be imported into App.js.
export default Playlist;
