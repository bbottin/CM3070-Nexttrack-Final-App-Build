// client/src/components/TrackCard.js

// Import React so JSX syntax works inside this file.
import React from "react";

/**
 * TrackCard component
 * ------------------------------------------------------------
 * Renders a single recommendation as a self-contained card.
 * This is a reusable presentational component: it holds no
 * internal state and simply displays the props it receives.
 *
 * It is used as the individual "card" that appears inside the
 * playlist grid (see Playlist.js). Each card shows the track's
 * title, artist, genre, year, optional match score, optional
 * explanation and one or two action buttons.
 *
 * Props:
 *  - track:          The full track item object, shaped like
 *                    { track: {...}, score, reason, youtube }.
 *                    Note: this is the *wrapper* object, not the
 *                    inner track metadata. The inner metadata is
 *                    accessed via `track.track` (aliased below).
 *  - isActive:       Boolean. True when this card represents the
 *                    track currently being played. Drives the
 *                    "active" highlight class.
 *  - onPlay:         Callback invoked with the full track item
 *                    when the user clicks the Play button.
 *  - onAddToQueue:   Optional callback for a "Add to Queue"
 *                    button. When not provided, the button is
 *                    not rendered at all.
 *  - showScore:      Optional boolean (default false). When true,
 *                    the match-score badge is displayed.
 */
function TrackCard({
  track,
  isActive,
  onPlay,
  onAddToQueue,
  showScore = false,
}) {
  // Destructure the wrapper object so we can refer to the inner
  // track metadata, score, reason and youtube fallback directly.
  //
  // The nested renaming `track: trackData` is intentional: the
  // outer prop is also called `track`, so I alias the inner
  // `track` property to `trackData` to avoid a naming collision.
  const { track: trackData, score, reason, youtube } = track;

  return (
    // The card root element. The `active` class is applied only
    // when this card corresponds to the currently playing track,
    // which is how the parent indicates the highlighted card.
    <div className={`track-card ${isActive ? "active" : ""}`}>
      {/* ---- Primary track metadata ---- */}
      <div className="track-title">{trackData.title}</div>
      <div className="track-artist">{trackData.artist}</div>

      {/* ---- Secondary metadata row ----
          Shows genre and year, with fallbacks for missing values.
          The match-score badge is rendered conditionally: it only
          appears when `showScore` is true AND the track has a score. */}
      <div className="track-meta">
        <span>{trackData.genre || "Unknown"}</span>
        <span>{trackData.year || "N/A"}</span>
        {showScore && score && (
          <span className="score-badge">
            Match: {(score * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {/* ---- Explanation box ----
          Rendered only if the track has a `reason` string. This
          is the human-readable justification produced by the
          backend's similarity engine and it is one of NextTrack's
          key differentiators vs. commercial recommenders. */}
      {reason && (
        <div className="explanation-box">
          <div className="label">Why this track?</div>
          <div className="reason">{reason}</div>
        </div>
      )}

      {/* ---- Action buttons ----
          Always renders a Play button. The Add to Queue button
          is rendered only when a handler was supplied by the parent,
          making this component reusable in contexts where queueing
          is not relevant. */}
      <div className="track-actions">
        <button
          className="btn btn-primary btn-small"
          onClick={() => onPlay(track)}
        >
          ▶ Play
        </button>

        {/* Conditional "Add to Queue" button.
            `onAddToQueue` is optional — when undefined, this entire
            block is skipped and the user sees a single-button card. */}
        {onAddToQueue && (
          <button
            className="btn btn-secondary btn-small"
            onClick={() => onAddToQueue(track)}
          >
            + Add to Queue
          </button>
        )}
      </div>
    </div>
  );
}

// Export the component so it can be reused elsewhere
// (e.g., inside Playlist.js or any future grid layout).
export default TrackCard;
