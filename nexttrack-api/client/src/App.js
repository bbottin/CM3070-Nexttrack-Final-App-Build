// client/src/App.js

// Import React and two hooks:
// - useState: tracks local component state (playlist, preferences, etc.)
// - useEffect: runs side effects after render (here: API health check on load)
import React, { useState, useEffect } from "react";
// Import axios for HTTP requests to the backend API.
import axios from "axios";
// Import global styles for the app.
import "./App.css";

// ---- Child components used by App ----
// TrackInput: search box + seed track list (part 1 of the flow)
// Playlist:   grid of generated recommendations (part 4 of the flow)
// MusicPlayer: Spotify embed + playback navigation (part 3 of the flow)
import TrackInput from "./components/TrackInput";
import Playlist from "./components/Playlist";
import MusicPlayer from "./components/MusicPlayer";

// Logo file lives in client/public/ and is served at the app root.
// Using a plain string path (not an ES import) is required because
// the file is in `public/`, not in `src/`.
const logo = "/BearCodingMusic.png";

// Base URL for all backend API calls. In development, the Express
// server runs locally on port 3000.
const API_URL = "http://localhost:3000/api";

/**
 * App component
 * ------------------------------------------------------------
 * This is the ROOT component of the frontend. It acts as the
 * single source of truth for the entire application's state:
 *
 *   - Which seed tracks the user has selected
 *   - What preferences (mood / discovery / genre) they've chosen
 *   - The current playlist returned by the backend
 *   - Which track within that playlist is currently playing
 *   - Whether playback is active
 *   - API status (online / offline)
 *
 * All other components are "controlled" — they receive props from
 * App and call callbacks (like setSeedTracks or playTrack) to
 * propose state changes. This is the standard React "lifting state
 * up" pattern and it keeps the flow of data predictable.
 */
function App() {
  // ---- Application-wide state ----

  // The list of seed tracks the user has chosen (search input stage).
  const [seedTracks, setSeedTracks] = useState([]);

  // User preference parameters sent with every playlist request.
  // These map directly to the backend's weighted scoring algorithm:
  // mood → influences genre/feature selection
  // discovery → 0 = familiar, 1 = novel
  // genre → biases candidate selection
  const [preferences, setPreferences] = useState({
    mood: "neutral",
    discovery: 0.5,
    genre: "any",
  });

  // The playlist returned by the backend for the current session.
  // Each item is shaped like { track, score, reason, youtube, source }.
  const [playlist, setPlaylist] = useState([]);

  // Index of the currently playing track within `playlist`.
  // Used to highlight the active card and to navigate next/prev.
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);

  // Whether the player is currently in a "playing" state.
  // (Note: this doesn't control actual audio playback — the Spotify
  // embed has its own controls — but it's used to trigger UI state.)
  const [isPlaying, setIsPlaying] = useState(false);

  // True while a playlist generation request is in flight.
  // Disables the Generate button to prevent double-submits.
  const [loading, setLoading] = useState(false);

  // Any error message that should be displayed to the user.
  // Set by the health check or playlist generation failure.
  const [error, setError] = useState(null);

  // Backend reachability status: "checking" | "online" | "offline".
  // Drives the badge in the header and disables UI when offline.
  const [apiStatus, setApiStatus] = useState("checking");

  /**
   * Health check — runs once on mount.
   * ------------------------------------------------------------
   * Calls the backend's /health endpoint to verify the API is
   * reachable. The empty dependency array ([]) means this effect
   * runs only on the initial render.
   */
  useEffect(() => {
    const checkApi = async () => {
      try {
        // Strip the trailing "/api" to get the root /health route.
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

  /**
   * currentTrack
   * ------------------------------------------------------------
   * Derived value: the actual track object for the currently
   * playing index. Returns null when there's no playlist yet or
   * when the index is out of bounds (defensive guard).
   *
   * This is intentionally recomputed on every render — no state
   * duplication and the current track is always in sync with the
   * playlist and index.
   */
  const currentTrack =
    playlist.length > 0 && currentTrackIndex < playlist.length
      ? playlist[currentTrackIndex]
      : null;

  /**
   * generatePlaylist
   * ------------------------------------------------------------
   * Sends the user's seed tracks and preferences to the backend's
   * /api/playlist endpoint, then stores the returned playlist in
   * state so it can be rendered and played.
   */
  const generatePlaylist = async () => {
    // Require at least one seed track before making a request.
    if (seedTracks.length < 1) {
      setError("Please add at least 1 seed track");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Send full seed objects (id + title + artist), not just bare id strings.
      const cleanSeeds = seedTracks.map((t) => {
        // Normalise Spotify URIs ("spotify:track:XXX") to bare IDs.
        let cleanId = t.id;
        if (cleanId && cleanId.startsWith("spotify:track:")) {
          cleanId = cleanId.split(":")[2];
        }
        return {
          id: cleanId,
          title: t.title,
          artist: t.artist,
        };
      });

      console.log("📤 Sending seed tracks:", cleanSeeds);
      console.log("📤 Preferences:", preferences);

      const response = await axios.post(`${API_URL}/playlist`, {
        seed_tracks: cleanSeeds,
        preferences: preferences,
        playlist_length: 10,
      });

      console.log("📥 Playlist response:", response.data);

      // Defensive: if the backend returned no playlist array, treat
      // it as an empty list rather than crashing downstream.
      const newPlaylist = response.data.playlist || [];

      // Filter out any malformed items that would break the UI.
      const validPlaylist = newPlaylist.filter(
        (item) => item && item.track && item.track.title && item.track.artist,
      );

      console.log("✅ Valid playlist:", validPlaylist);

      setPlaylist(validPlaylist);

      // Reset playback to the first track after a fresh generation.
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
      // Always stop the loading spinner, success or failure.
      setLoading(false);
    }
  };

  /**
   * resetApp
   * ------------------------------------------------------------
   * Clears all application state and reloads the page, returning
   * the user to a completely fresh start.
   *
   * Reloading the page (rather than just clearing state) is
   * deliberate: it also guarantees any internal state held inside
   * child components (e.g. Spotify iframe state) is fully reset.
   */
  const resetApp = () => {
    // Clear all state in App.
    setSeedTracks([]);
    setPreferences({
      mood: "neutral",
      discovery: 0.5,
      genre: "any",
    });
    setPlaylist([]);
    setCurrentTrackIndex(0);
    setIsPlaying(false);
    setError(null);
    setLoading(false);

    // Reload the page completely (most thorough reset).
    window.location.reload();

    // Alternative approach (commented out):
    // Just scroll to the top without a full reload — smoother but
    // may leave some child component state intact.
    // window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /**
   * playTrack
   * ------------------------------------------------------------
   * Sets the currently playing track by its index in the playlist.
   * Called when the user clicks a card or a Play button.
   *
   * Includes bounds checking to prevent an invalid index from
   * silently corrupting the state.
   */
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

  /**
   * playAll
   * ------------------------------------------------------------
   * Starts playback from the very first track in the playlist.
   * Wired to the "Play All" buttons in the header and the Playlist
   * component.
   */
  const playAll = () => {
    if (playlist.length > 0) {
      console.log("▶️ Playing all - setting index to 0");
      setCurrentTrackIndex(0);
      setIsPlaying(true);
    }
  };

  /**
   * nextTrack
   * ------------------------------------------------------------
   * Advances to the next track in the playlist. If already
   * on the last track, it loops back to the beginning — this
   * makes the playlist feel continuous rather than stopping.
   */
  const nextTrack = () => {
    if (currentTrackIndex < playlist.length - 1) {
      console.log(`⏭ Next track: ${currentTrackIndex + 1}`);
      setCurrentTrackIndex(currentTrackIndex + 1);
      setIsPlaying(true);
    } else {
      // Wrap around to the first track.
      console.log("🔄 Loop back to start");
      setCurrentTrackIndex(0);
      setIsPlaying(true);
    }
  };

  /**
   * prevTrack
   * ------------------------------------------------------------
   * Goes back one track. Unlike nextTrack, this does NOT wrap
   * around — a deliberate choice so that "Prev" on the first track
   * simply does nothing instead of jumping unexpectedly to the end.
   */
  const prevTrack = () => {
    if (currentTrackIndex > 0) {
      console.log(`⏮ Prev track: ${currentTrackIndex - 1}`);
      setCurrentTrackIndex(currentTrackIndex - 1);
      setIsPlaying(true);
    }
  };

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="App">
      {/* ---- Header ---- */}
      {/* Contains the logo, title, subtitle, API status badge and
          a top-level "Start Over" reset button. */}
      <header className="App-header">
        {/* Logo on the left */}
        <div className="header-logo-container">
          <img src={logo} alt="Bear Coding Music" className="header-logo" />
        </div>

        {/* Text content on the right */}
        <div className="header-text-container">
          <h1>🎵 NextTrack (BOB Edition)</h1>
          <p className="subtitle">
            Stateless, Privacy-First Music Recommendations
          </p>
          {/* Status badge driven by the apiStatus state. */}
          <div className={`api-status status-${apiStatus}`}>
            {apiStatus === "online" ? "✅ API Online" : "⛔ API Offline"}
          </div>
        </div>

        {/* Reset button — clears everything and returns to a fresh state. */}
        <div className="header-actions">
          <button
            className="btn btn-reset btn-small"
            onClick={resetApp}
            title="Clear everything and start over"
          >
            🔄 Start Over
          </button>
        </div>
      </header>

      {/* ---- Main content ---- */}
      <main className="App-main">
        <div className="container">
          {/* ============ STEP 1 & 2: INPUT SECTION ============ */}
          <section className="input-section">
            {/* ---- Step 1: seed track selection ---- */}
            <div className="section-header">
              <h2>1. Choose Your Seed Tracks</h2>
              {/* Small "clear tracks" button — only visible when the
                  user has at least one seed track to clear. */}
              {seedTracks.length > 0 && (
                <button
                  className="btn btn-reset-section btn-small"
                  onClick={() => {
                    setSeedTracks([]);
                    setError(null);
                  }}
                  title="Clear all seed tracks"
                >
                  ✕ Clear Tracks
                </button>
              )}
            </div>

            {/* TrackInput handles the search bar, results list and
                seed track tags. The parent passes the seed track
                state and its setter so TrackInput can propose updates. */}
            <TrackInput
              seedTracks={seedTracks}
              setSeedTracks={setSeedTracks}
              apiStatus={apiStatus}
            />

            {/* ---- Step 2: preference controls ---- */}
            <h2>2. Set Your Preferences</h2>
            <div className="preferences-section">
              {/* Mood selector — maps to the backend's energy/valence scoring. */}
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

              {/* Discovery slider — 0 = familiar, 1 = novel.
                  parseFloat ensures the value stays numeric. */}
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

              {/* Genre preference — biases the candidate pool. */}
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

            {/* ---- Step 3: generate button ---- */}
            <div className="button-group">
              <button
                className="btn btn-primary generate-btn"
                onClick={generatePlaylist}
                // Disabled during a request, or when no seed tracks exist.
                disabled={loading || seedTracks.length === 0}
              >
                {loading ? "🎶 Generating..." : "🎵 Generate Playlist"}
              </button>
            </div>

            {/* Error banner — only visible when there's a message. */}
            {error && <div className="error">{error}</div>}
          </section>

          {/* ============ STEP 3 & 4: PLAYER + PLAYLIST ============ */}
          {/* Both sections are rendered only after a playlist has
              been successfully generated. */}
          {playlist.length > 0 && (
            <>
              {/* ---- Step 3: Now Playing ---- */}
              <section className="player-section">
                <div className="section-header">
                  <h2>3. Now Playing</h2>
                </div>
                {/* MusicPlayer handles the Spotify embed and Prev/Next
                    navigation. It receives the current track and the
                    navigation callbacks from the parent. */}
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

              {/* ---- Step 4: Playlist grid ---- */}
              <section className="playlist-section">
                <div className="section-header">
                  <h2>4. Your Playlist ({playlist.length} tracks)</h2>
                </div>
                {/* Playlist renders the grid of track cards. Clicking a
                    card calls playTrack with its index, which updates
                    currentTrackIndex and switches the Now Playing view. */}
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

// Export App so it can be rendered by index.js (the React entry point).
export default App;
