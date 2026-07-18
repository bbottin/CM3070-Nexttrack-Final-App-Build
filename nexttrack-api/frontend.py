# frontend.py

import streamlit as st
import requests
import json

# Page configuration
st.set_page_config(
    page_title="NextTrack - Music Recommender",
    page_icon="🎵",
    layout="wide"
)

# Title and description
st.title("🎵 NextTrack: Music Recommendation API")
st.markdown("""
*A stateless, privacy-first music recommender. No tracking, no accounts - just intelligent suggestions.*
""")

# Sidebar for API status
with st.sidebar:
    st.header("🔧 API Status")
    
    # Check API health
    try:
        health_response = requests.get("http://localhost:3000/health", timeout=2)
        if health_response.status_code == 200:
            st.success("✅ API is running")
            st.json(health_response.json())
        else:
            st.error("❌ API error")
    except:
        st.error("❌ Cannot connect to API. Make sure the server is running.")
    
    st.divider()
    st.caption("Built with FastAPI + Streamlit")
    st.caption("Source: GitHub")

# Main layout: two columns
col1, col2 = st.columns([2, 1])

with col1:
    st.subheader("1️⃣ Enter Your Listening Session")
    
    # Track input
    track_ids = st.text_area(
        "Track IDs (one per line)",
        placeholder="spotify:track:6rqhFgbbKwnb9MLmUQDhG6\nspotify:track:7Mts0OfPorF4iwOomvfqn1",
        height=100,
        help="Enter Spotify track IDs. You can find these in the Spotify app (Share → Copy Spotify URI)"
    )
    
    # Preferences
    st.subheader("2️⃣ Set Your Preferences")
    
    col1a, col1b = st.columns(2)
    
    with col1a:
        mood = st.selectbox(
            "Mood",
            ["neutral", "calm", "happy", "sad", "energetic"],
            help="Select the mood you're in"
        )
        
        discovery = st.slider(
            "Discovery Level",
            min_value=0.0,
            max_value=1.0,
            value=0.5,
            step=0.1,
            help="0.0 = familiar tracks, 1.0 = discover new music"
        )
    
    with col1b:
        genre_bias = st.selectbox(
            "Genre Preference",
            ["any", "rock", "pop", "electronic", "jazz", "classical"],
            help="Prefer a specific genre"
        )
    
    # Recommend button
    if st.button("🎯 Get Recommendation", type="primary", use_container_width=True):
        if not track_ids.strip():
            st.error("Please enter at least 2 track IDs")
        else:
            # Parse track IDs
            ids = [id.strip() for id in track_ids.strip().split("\n") if id.strip()]
            
            if len(ids) < 2:
                st.error("Please enter at least 2 track IDs")
            else:
                # Build request
                payload = {
                    "track_ids": ids,
                    "preferences": {
                        "mood": mood,
                        "discovery": discovery
                    }
                }
                
                # Add genre bias if not "any"
                if genre_bias != "any":
                    payload["preferences"]["genre_bias"] = genre_bias
                
                # Show request
                with st.expander("📤 Request Payload"):
                    st.json(payload)
                
                # Make API call
                with st.spinner("🧠 Finding the perfect next track..."):
                    try:
                        response = requests.post(
                            "http://localhost:3000/api/recommend",
                            json=payload,
                            timeout=10
                        )
                        
                        if response.status_code == 200:
                            result = response.json()
                            
                            # Store in session state
                            st.session_state['result'] = result
                            st.session_state['track_ids'] = ids
                            
                            # Show success
                            st.success("✅ Recommendation generated!")
                        else:
                            st.error(f"❌ API error: {response.status_code}")
                            st.json(response.json())
                            
                    except requests.exceptions.ConnectionError:
                        st.error("❌ Cannot connect to API. Make sure the server is running.")
                    except Exception as e:
                        st.error(f"❌ Error: {str(e)}")

with col2:
    st.subheader("🎧 Recommended Track")
    
    # Display result if available
    if 'result' in st.session_state:
        result = st.session_state['result']
        track = result['track']
        
        # Track card
        st.markdown(f"""
        ### 🎵 {track['title']}
        **Artist:** {track['artist']}  
        **Album:** {track['album']}  
        **Genre:** {track['genre']}  
        **Year:** {track['year']}
        
        ---
        **💡 Why this track?**
        > {result['reason']}
        
        **Score:** {result['score']:.3f}
        """)
        
        # YouTube embed (if we have a video ID)
        # Extract YouTube video ID from track ID (simplified)
        # For a real implementation, you'd need a mapping
        st.caption("YouTube preview coming soon...")
        
        # Show input tracks
        with st.expander("🎶 Input Tracks"):
            for track in result.get('input_tracks', []):
                st.write(f"- {track['title']} - {track['artist']}")
        
        # Show API response
        with st.expander("📥 Full API Response"):
            st.json(result)
        
        # Debug info
        with st.expander("🐛 Debug Info"):
            st.write(f"Candidates considered: {result.get('candidates_considered', 0)}")
            st.write(f"Track ID: {track['id']}")
    
    else:
        st.info("👆 Enter track IDs and click 'Get Recommendation' to see results")

# Footer
st.divider()
st.caption("""
🔒 **Privacy First** - No user tracking, no accounts, no data storage.  
🎯 **Explainable** - Every recommendation comes with a clear reason.  
🎛️ **User Controlled** - Adjust mood and discovery to your taste.
""")