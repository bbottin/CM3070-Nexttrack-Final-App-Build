// client/src/components/TrackInput.js

import React, { useState } from "react";

function TrackInput({ seedTracks, setSeedTracks, apiStatus }) {
  const [inputValue, setInputValue] = useState("");

  const addTrack = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // Check if track already exists
    if (seedTracks.some((t) => t.id === trimmed)) {
      alert("Track already added");
      return;
    }

    // Extract title from Spotify URI or use ID
    let title = trimmed;
    let artist = "";
    let id = trimmed;

    // If it's a Spotify URI, extract components
    if (trimmed.includes("spotify:track:")) {
      id = trimmed;
      title = trimmed.split(":").pop();
    }

    setSeedTracks([...seedTracks, { id, title, artist }]);
    setInputValue("");
  };

  const removeTrack = (id) => {
    setSeedTracks(seedTracks.filter((t) => t.id !== id));
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      addTrack();
    }
  };

  return (
    <div className="track-input-container">
      <div>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Paste Spotify Track ID or URI..."
          disabled={apiStatus === "offline"}
          className="track-input"
        />
        <div className="input-hint">
          Example: spotify:track:6rqhFgbbKwnb9MLmUQDhG6
        </div>
      </div>
      <button
        className="btn btn-primary btn-small"
        onClick={addTrack}
        disabled={!inputValue.trim() || apiStatus === "offline"}
      >
        + Add Track
      </button>

      <div className="seed-tracks-list">
        {seedTracks.map((track, index) => (
          <div key={track.id + index} className="seed-track-tag">
            <span>#{index + 1}</span>
            <span className="track-id">{track.id}</span>
            <span className="remove" onClick={() => removeTrack(track.id)}>
              ✕
            </span>
          </div>
        ))}
        {seedTracks.length === 0 && (
          <span style={{ color: "#666688", fontSize: "0.9rem" }}>
            No seed tracks added yet. Add at least 1 track.
          </span>
        )}
      </div>
    </div>
  );
}

export default TrackInput;
