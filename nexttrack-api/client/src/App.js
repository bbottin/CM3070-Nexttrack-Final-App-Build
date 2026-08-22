// client/src/App.js

import React, { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

// Components
import TrackInput from "./components/TrackInput";
import Playlist from "./components/Playlist";
import MusicPlayer from "./components/MusicPlayer";

const API_URL = "http://localhost:3000/api";

function App() {
  const [seedTracks, setSeedTracks] = useState([]);
  const [preferences, setPreferences] = useState({
    mood: "neutral",
    discovery: 0.5,
    genre: "any",
  });
  const [playlist, setPlaylist] = useState([]);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiStatus, setApiStatus] = useState("checking");

  // Check API health on load
  useEffect(() => {
    const checkApi = async () => {
      try {
        const response = await axios.get(
          `${API_URL.replace("/api", "")}/health`,
        );
        if (response.status === 200) {
          setApiStatus("online");
        }
      } catch (err) {
        setApiStatus("offline");
        setError("API server is not running. Please start the server.");
      }
    };
    checkApi();
  }, []);

  // Get current track from playlist
  const currentTrack =
    playlist.length > 0 && currentTrackIndex < playlist.length
      ? playlist[currentTrackIndex]
      : null;

  // Debug: Log when currentTrack changes
  useEffect(() => {
    console.log("🔄 Current track changed:", currentTrack);
  }, [currentTrack]);

  // Generate playlist
  const generatePlaylist = async () => {
    if (seedTracks.length < 1) {
      setError("Please add at least 1 seed track");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const cleanIds = seedTracks.map((t) => {
        if (t.id && t.id.startsWith("spotify:track:")) {
          return t.id.split(":")[2];
        }
        if (t.id && t.id.startsWith("lastfm:")) {
          return t.id;
        }
        return t.id;
      });

      console.log("📤 Sending seed tracks:", cleanIds);
      console.log("📤 Preferences:", preferences);

      const response = await axios.post(`${API_URL}/playlist`, {
        seed_tracks: cleanIds,
        preferences: preferences,
        playlist_length: 10,
      });

      console.log("📥 Playlist response:", response.data);

      const newPlaylist = response.data.playlist || [];

      // Validate playlist data
      const validPlaylist = newPlaylist.filter(
        (item) => item && item.track && item.track.title && item.track.artist,
      );

      console.log("✅ Valid playlist:", validPlaylist);

      setPlaylist(validPlaylist);

      // Reset to first track - IMPORTANT: use a callback to ensure state is updated
      if (validPlaylist.length > 0) {
        console.log("🎵 Setting currentTrackIndex to 0");
        console.log("🎵 First track:", validPlaylist[0]);
        setCurrentTrackIndex(0);
        setIsPlaying(false);
      } else {
        setError("No valid tracks returned. Try different seed tracks.");
      }
    } catch (err) {
      console.error("❌ Playlist generation error:", err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // Play a specific track
  const playTrack = (index) => {
    console.log(`🎵 PlayTrack called with index: ${index}`);
    console.log(`🎵 Playlist length: ${playlist.length}`);
    console.log(`🎵 Track at index ${index}:`, playlist[index]);

    if (index >= 0 && index < playlist.length) {
      setCurrentTrackIndex(index);
      setIsPlaying(true);
      console.log(`✅ Set currentTrackIndex to ${index}`);
    } else {
      console.error(`❌ Invalid index: ${index}`);
    }
  };

  // Play all (start from first)
  const playAll = () => {
    if (playlist.length > 0) {
      console.log("▶️ Playing all - setting index to 0");
      setCurrentTrackIndex(0);
      setIsPlaying(true);
    }
  };

  // Get next track
  const nextTrack = () => {
    if (currentTrackIndex < playlist.length - 1) {
      console.log(`⏭ Next track: ${currentTrackIndex + 1}`);
      setCurrentTrackIndex(currentTrackIndex + 1);
      setIsPlaying(true);
    } else {
      console.log("🔄 Loop back to start");
      setCurrentTrackIndex(0);
      setIsPlaying(true);
    }
  };

  // Get previous track
  const prevTrack = () => {
    if (currentTrackIndex > 0) {
      console.log(`⏮ Prev track: ${currentTrackIndex - 1}`);
      setCurrentTrackIndex(currentTrackIndex - 1);
      setIsPlaying(true);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>🎵 NextTrack</h1>
        <p className="subtitle">
          Stateless, Privacy-First Music Recommendations
        </p>
        <div className={`api-status status-${apiStatus}`}>
          {apiStatus === "online" ? "✅ API Online" : "⛔ API Offline"}
        </div>
      </header>

      <main className="App-main">
        <div className="container">
          <section className="input-section">
            <h2>1. Choose Your Seed Tracks</h2>
            <TrackInput
              seedTracks={seedTracks}
              setSeedTracks={setSeedTracks}
              apiStatus={apiStatus}
            />

            <h2>2. Set Your Preferences</h2>
            <div className="preferences-section">
              <div className="preference-group">
                <label>Mood</label>
                <select
                  value={preferences.mood}
                  onChange={(e) =>
                    setPreferences({ ...preferences, mood: e.target.value })
                  }
                >
                  <option value="neutral">Neutral</option>
                  <option value="calm">Calm</option>
                  <option value="happy">Happy</option>
                  <option value="sad">Sad</option>
                  <option value="energetic">Energetic</option>
                </select>
              </div>

              <div className="preference-group">
                <label>Discovery: {preferences.discovery}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={preferences.discovery}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      discovery: parseFloat(e.target.value),
                    })
                  }
                />
                <span className="hint">0 = Familiar | 1 = Discover</span>
              </div>

              <div className="preference-group">
                <label>Genre Preference</label>
                <select
                  value={preferences.genre}
                  onChange={(e) =>
                    setPreferences({ ...preferences, genre: e.target.value })
                  }
                >
                  <option value="any">Any</option>
                  <option value="rock">Rock</option>
                  <option value="pop">Pop</option>
                  <option value="electronic">Electronic</option>
                  <option value="jazz">Jazz</option>
                  <option value="classical">Classical</option>
                </select>
              </div>
            </div>

            <button
              className="btn btn-primary generate-btn"
              onClick={generatePlaylist}
              disabled={loading || seedTracks.length === 0}
            >
              {loading ? "🎶 Generating..." : "🎵 Generate Playlist"}
            </button>

            {error && <div className="error">{error}</div>}
          </section>

          {playlist.length > 0 && (
            <>
              <section className="player-section">
                <h2>3. Now Playing</h2>
                <MusicPlayer
                  currentTrack={currentTrack}
                  playlist={playlist}
                  currentTrackIndex={currentTrackIndex}
                  onNext={nextTrack}
                  onPrev={prevTrack}
                  isPlaying={isPlaying}
                  setIsPlaying={setIsPlaying}
                  playAll={playAll}
                />
              </section>

              <section className="playlist-section">
                <h2>4. Your Playlist ({playlist.length} tracks)</h2>
                <Playlist
                  playlist={playlist}
                  currentTrackIndex={currentTrackIndex}
                  onPlayTrack={playTrack}
                  onPlayAll={playAll}
                />
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
