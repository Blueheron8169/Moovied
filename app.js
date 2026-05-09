// app.js - Full Platform Logic (Clubs & Secure Chat)

// --- CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDgmwWYIqNWrXuhDyrzJmJUOhm4ZFJxj5Y",
    authDomain: "movie-rater-6f591.firebaseapp.com",
    projectId: "movie-rater-6f591",
    storageBucket: "movie-rater-6f591.firebasestorage.app",
    messagingSenderId: "627802743041",
    appId: "1:627802743041:web:45ca75bf32cd126c6efb00"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const OMDB_API_KEY = "trilogy"; 

// --- STATE ---
let currentUser = "Anonymous";
let globalChatUnsub = null;
let movieChatUnsub = null;
let clubChatUnsub = null;
let currentMovieContext = null;
let activeClubId = null;

let myLists;
try {
    myLists = JSON.parse(localStorage.getItem('cineclub_lists')) || { favorites: [], watched: [], watchlist: [], clubs: [] };
    if(!myLists.clubs) myLists.clubs = [];
} catch (e) {
    myLists = { favorites: [], watched: [], watchlist: [], clubs: [] };
}

// --- PROFANITY FILTER ---
const badWords = ["fuck", "shit", "bitch", "ass", "cunt", "dick", "pussy", "nigger", "nigga", "fag", "faggot", "slut", "whore", "bastard", "damn"];
function censorText(text) {
    let censored = text;
    badWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\w*\\b`, 'gi');
        censored = censored.replace(regex, '***');
    });
    return censored;
}
function isProfane(text) {
    return badWords.some(word => new RegExp(`\\b${word}\\w*\\b`, 'gi').test(text));
}

// --- DOM ELEMENTS ---
const navItems = document.querySelectorAll('.nav-item');
const tabViews = document.querySelectorAll('.tab-view');
const loginModal = document.getElementById('login-modal');
const googleLoginBtn = document.getElementById('google-login-btn');

// Movies & Search
const searchInput = document.getElementById('movie-search');
const searchBtn = document.getElementById('search-btn');
const searchResultsContainer = document.getElementById('search-results-container');
const searchGrid = document.getElementById('search-grid');
const recentReviewsRow = document.getElementById('recent-reviews-row');

// Lists View
const favoritesGrid = document.getElementById('favorites-grid');
const watchedGrid = document.getElementById('watched-grid');
const watchlistGrid = document.getElementById('watchlist-grid');

// Clubs View
const clubNameInput = document.getElementById('club-name-input');
const createClubBtn = document.getElementById('create-club-btn');
const clubInviteInput = document.getElementById('club-invite-input');
const joinClubBtn = document.getElementById('join-club-btn');
const clubsRow = document.getElementById('clubs-row');
const clubChatSection = document.getElementById('club-chat-section');
const activeClubName = document.getElementById('active-club-name');
const clubChatMessages = document.getElementById('club-chat-messages');
const clubChatInput = document.getElementById('club-chat-input');
const sendClubChatBtn = document.getElementById('send-club-chat-btn');

// Global Chat View
const globalChatContainer = document.getElementById('global-chat-messages');
const globalChatInput = document.getElementById('global-chat-input');
const sendGlobalChatBtn = document.getElementById('send-global-chat-btn');

// Movie Modal
const movieModal = document.getElementById('movie-modal');
const closeMovieModalBtn = document.getElementById('close-movie-modal');
const modalPoster = document.getElementById('modal-poster');
const modalTitle = document.getElementById('modal-title');
const modalMeta = document.getElementById('modal-meta');
const modalPlot = document.getElementById('modal-plot');

const btnFav = document.getElementById('btn-fav');
const btnWatched = document.getElementById('btn-watched');
const btnWatchlist = document.getElementById('btn-watchlist');

const movieChatMessages = document.getElementById('movie-chat-messages');
const movieChatInput = document.getElementById('movie-chat-input');
const sendMovieChatBtn = document.getElementById('send-movie-chat-btn');


// --- AUTH & INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
});

auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user.displayName || "Anonymous Cinephile";
        loginModal.classList.remove('active');
        
        // Initialize App Data once logged in
        renderMyLists();
        renderMyClubs();
        loadRecentReviews();
        initGlobalChat();
    } else {
        loginModal.classList.add('active');
    }
});

googleLoginBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        console.error("Auth Error:", error);
        alert("Failed to sign in. Have you enabled Google Auth in the Firebase Console?");
    });
});

// --- NAVIGATION ---
function initTabs() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            tabViews.forEach(t => t.classList.remove('active'));
            
            item.classList.add('active');
            const tabId = item.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');

            if (tabId === 'global-chat-view') globalChatContainer.scrollTop = globalChatContainer.scrollHeight;
            if (tabId === 'lists-view') renderMyLists();
            if (tabId === 'clubs-view') {
                renderMyClubs();
                if(activeClubId) clubChatMessages.scrollTop = clubChatMessages.scrollHeight;
            }
        });
    });
}

// --- OMDB FETCHING & SEARCH ---
async function fetchMovies(query) {
    try {
        const res = await fetch(`https://www.omdbapi.com/?s=${encodeURIComponent(query)}&type=movie&apikey=${OMDB_API_KEY}`);
        const data = await res.json();
        return data.Response === "True" ? data.Search : [];
    } catch (e) { console.error(e); return []; }
}

async function fetchMovieDetails(id) {
    try {
        const res = await fetch(`https://www.omdbapi.com/?i=${id}&plot=full&apikey=${OMDB_API_KEY}`);
        return await res.json();
    } catch (e) { console.error(e); return null; }
}

searchBtn.addEventListener('click', handleSearch);
searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleSearch(); });

async function handleSearch() {
    let q = searchInput.value.trim();
    if (!q) return;
    
    if (q.toLowerCase().includes("spiderman")) {
        q = q.replace(/spiderman/ig, "spider-man");
        searchInput.value = q;
    }
    
    searchResultsContainer.style.display = 'block';
    searchGrid.innerHTML = `<p style="color:var(--text-muted)">Searching...</p>`;
    
    const results = await fetchMovies(q);
    if(results.length > 0) renderMovieCards(results, searchGrid);
    else searchGrid.innerHTML = `<p style="color:var(--primary-red)">No results found.</p>`;
}

function renderMovieCards(movies, container) {
    container.innerHTML = movies.slice(0, 10).map(m => {
        const poster = (m.Poster && m.Poster !== "N/A") ? m.Poster : "https://via.placeholder.com/300x450?text=No+Poster";
        return `
            <div class="movie-card" onclick="openMovieDetails('${m.imdbID}')">
                <div class="poster" style="background-image: url('${poster}')"></div>
                <div class="movie-info">
                    <h3 title="${m.Title}">${m.Title}</h3>
                    <p>${m.Year || ''}</p>
                </div>
            </div>
        `;
    }).join('');
}

// --- MOVIE MODAL & LIVE CHAT ---
async function openMovieDetails(imdbID) {
    movieModal.classList.add('active');
    modalPlot.textContent = "Loading full details...";
    modalTitle.textContent = "Loading...";
    modalPoster.style.backgroundImage = 'none';
    
    const movie = await fetchMovieDetails(imdbID);
    if (!movie) return modalPlot.textContent = "Failed to load details.";

    currentMovieContext = movie;
    modalTitle.textContent = movie.Title;
    modalMeta.textContent = `${movie.Year} • ${movie.Genre} • ${movie.Runtime} • IMDB: ${movie.imdbRating}`;
    modalPlot.textContent = movie.Plot;
    const poster = movie.Poster !== "N/A" ? movie.Poster : "https://via.placeholder.com/300x450?text=No+Poster";
    modalPoster.style.backgroundImage = `url('${poster}')`;

    updateListButtonsState();
    initMovieChat(imdbID);
}

closeMovieModalBtn.addEventListener('click', () => {
    movieModal.classList.remove('active');
    if(movieChatUnsub) movieChatUnsub();
});

function initMovieChat(imdbID) {
    movieChatMessages.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Loading live chat...</p>';
    if (movieChatUnsub) movieChatUnsub();

    movieChatUnsub = db.collection("movie_chats")
        .where("imdbID", "==", imdbID)
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                movieChatMessages.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No messages yet. Start the discussion!</p>';
                return;
            }
            
            const msgs = [];
            snapshot.forEach(doc => msgs.push(doc.data()));
            msgs.sort((a,b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

            movieChatMessages.innerHTML = '';
            msgs.forEach(msg => {
                const isSelf = msg.author === currentUser;
                movieChatMessages.innerHTML += `
                    <div class="chat-message ${isSelf ? 'self' : ''}">
                        <div class="msg-author">${msg.author}</div>
                        <div class="msg-text">${msg.text}</div>
                    </div>
                `;
            });
            movieChatMessages.scrollTop = movieChatMessages.scrollHeight;
        }, err => {
            console.error("Firebase Read Error:", err);
            movieChatMessages.innerHTML = '<p style="color:var(--primary-red)">Access Denied by Firebase Rules.</p>';
        });
}

function sendMovieChat() {
    const rawText = movieChatInput.value.trim();
    if (!rawText || !currentMovieContext) return;
    const cleanText = censorText(rawText);
    
    db.collection("movie_chats").add({
        imdbID: currentMovieContext.imdbID,
        Title: currentMovieContext.Title, // For recently reviewed display
        Poster: currentMovieContext.Poster,
        author: currentUser,
        text: cleanText,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => movieChatInput.value = '')
      .catch(e => alert("Action Denied! Firebase Rules blocking writes."));
}

sendMovieChatBtn.addEventListener('click', sendMovieChat);
movieChatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendMovieChat(); });


// --- RECENTLY REVIEWED (Now pulls from movie_chats) ---
function loadRecentReviews() {
    if(!recentReviewsRow) return;
    db.collection("movie_chats")
        .orderBy("timestamp", "desc")
        .limit(20)
        .onSnapshot(snapshot => {
            if (snapshot.empty) return recentReviewsRow.innerHTML = '<p style="color:var(--text-muted)">No recent chat activity.</p>';
            
            const seen = new Set();
            const recentMovies = [];
            
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.Title && data.Poster && !seen.has(data.imdbID)) {
                    seen.add(data.imdbID);
                    recentMovies.push({ imdbID: data.imdbID, Title: data.Title, Poster: data.Poster, Year: 'Active Chat' });
                }
            });
            
            if (recentMovies.length > 0) renderMovieCards(recentMovies, recentReviewsRow);
        });
}

// --- PERSONAL LISTS LOGIC ---
function saveLists() {
    localStorage.setItem('cineclub_lists', JSON.stringify(myLists));
    renderMyLists();
}

function toggleList(listName, btnElement) {
    if (!currentMovieContext) return;
    
    const movieObj = {
        imdbID: currentMovieContext.imdbID,
        Title: currentMovieContext.Title,
        Year: currentMovieContext.Year,
        Poster: currentMovieContext.Poster
    };

    const existsIndex = myLists[listName].findIndex(m => m.imdbID === movieObj.imdbID);
    
    if (existsIndex >= 0) {
        myLists[listName].splice(existsIndex, 1);
        btnElement.classList.remove('active');
    } else {
        myLists[listName].push(movieObj);
        btnElement.classList.add('active');
    }
    saveLists();
}

btnFav.addEventListener('click', () => toggleList('favorites', btnFav));
btnWatched.addEventListener('click', () => toggleList('watched', btnWatched));
btnWatchlist.addEventListener('click', () => toggleList('watchlist', btnWatchlist));

function updateListButtonsState() {
    if(!currentMovieContext) return;
    const id = currentMovieContext.imdbID;
    btnFav.classList.toggle('active', myLists.favorites.some(m => m.imdbID === id));
    btnWatched.classList.toggle('active', myLists.watched.some(m => m.imdbID === id));
    btnWatchlist.classList.toggle('active', myLists.watchlist.some(m => m.imdbID === id));
}

function renderMyLists() {
    renderMovieCards(myLists.favorites, favoritesGrid);
    renderMovieCards(myLists.watched, watchedGrid);
    renderMovieCards(myLists.watchlist, watchlistGrid);
    
    if(myLists.favorites.length === 0) favoritesGrid.innerHTML = "<p style='color:var(--text-muted)'>No favorites yet.</p>";
    if(myLists.watched.length === 0) watchedGrid.innerHTML = "<p style='color:var(--text-muted)'>No watched movies logged.</p>";
    if(myLists.watchlist.length === 0) watchlistGrid.innerHTML = "<p style='color:var(--text-muted)'>Watchlist is empty.</p>";
}

// --- MOVIE CLUBS LOGIC ---
function generateClubCode() {
    return Math.random().toString(36).substring(2, 7).toUpperCase();
}

createClubBtn.addEventListener('click', () => {
    const name = clubNameInput.value.trim();
    if (!name) return alert("Enter a club name");
    
    const code = generateClubCode();
    myLists.clubs.push({ code, name });
    saveLists();
    
    clubNameInput.value = '';
    alert(`Club created! Invite your friends using code: ${code}`);
    renderMyClubs();
});

joinClubBtn.addEventListener('click', () => {
    const code = clubInviteInput.value.trim().toUpperCase();
    if (!code || code.length !== 5) return alert("Enter a valid 5-character code");
    
    if (myLists.clubs.some(c => c.code === code)) return alert("You are already in this club!");
    
    myLists.clubs.push({ code, name: `Club ${code}` }); // Simplified: naming based on code if joining blindly
    saveLists();
    clubInviteInput.value = '';
    renderMyClubs();
});

function renderMyClubs() {
    clubsRow.innerHTML = '';
    if (myLists.clubs.length === 0) {
        clubsRow.innerHTML = '<p style="color:var(--text-muted)">You haven\'t joined any clubs yet.</p>';
        return;
    }
    
    myLists.clubs.forEach(club => {
        const div = document.createElement('div');
        div.className = 'glass-panel';
        div.style.padding = '1rem';
        div.style.minWidth = '200px';
        div.style.cursor = 'pointer';
        div.style.textAlign = 'center';
        div.innerHTML = `
            <h3 style="margin-bottom:0.5rem; color:var(--text-main);">${club.name}</h3>
            <p style="color:var(--text-muted); font-size:0.8rem;">Code: <strong style="color:white;">${club.code}</strong></p>
        `;
        div.onclick = () => openClubChat(club.code, club.name);
        clubsRow.appendChild(div);
    });
}

function openClubChat(code, name) {
    activeClubId = code;
    clubChatSection.style.display = 'block';
    activeClubName.textContent = `${name} - Private Chat`;
    
    clubChatMessages.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Connecting to Club Chat...</p>';
    if (clubChatUnsub) clubChatUnsub();
    
    clubChatUnsub = db.collection("club_chats")
        .where("clubId", "==", code)
        .onSnapshot((snapshot) => {
            if (snapshot.empty) {
                clubChatMessages.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No messages yet. Say hello to your club!</p>';
                return;
            }
            
            const msgs = [];
            snapshot.forEach(doc => msgs.push(doc.data()));
            msgs.sort((a,b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

            clubChatMessages.innerHTML = '';
            msgs.forEach(msg => {
                const isSelf = msg.author === currentUser;
                clubChatMessages.innerHTML += `
                    <div class="chat-message ${isSelf ? 'self' : ''}">
                        <div class="msg-author">${msg.author}</div>
                        <div class="msg-text">${msg.text}</div>
                    </div>
                `;
            });
            clubChatMessages.scrollTop = clubChatMessages.scrollHeight;
        }, err => console.error(err));
}

function sendClubChatMessage() {
    const rawText = clubChatInput.value.trim();
    if (!rawText || !activeClubId) return;
    const cleanText = censorText(rawText);
    
    db.collection("club_chats").add({
        clubId: activeClubId,
        author: currentUser,
        text: cleanText,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => clubChatInput.value = '')
      .catch(e => alert("Action Denied! Firebase Rules blocking writes."));
}

sendClubChatBtn.addEventListener('click', sendClubChatMessage);
clubChatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendClubChatMessage(); });


// --- GLOBAL CHAT ---
function initGlobalChat() {
    globalChatContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">Loading global history...</p>';
    if (globalChatUnsub) globalChatUnsub();
    
    // Fallback sort if indexing fails
    globalChatUnsub = db.collection("global_chat")
        .onSnapshot((snapshot) => {
            if (snapshot.empty) {
                globalChatContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">No messages yet. Say hello!</p>';
                return;
            }
            
            const msgs = [];
            snapshot.forEach(doc => msgs.push(doc.data()));
            msgs.sort((a,b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));

            globalChatContainer.innerHTML = '';
            // Only show last 50 for performance without limit() index
            msgs.slice(-50).forEach(msg => {
                const isSelf = msg.author === currentUser;
                globalChatContainer.innerHTML += `
                    <div class="chat-message ${isSelf ? 'self' : ''}">
                        <div class="msg-author">${msg.author}</div>
                        <div class="msg-text">${msg.text}</div>
                    </div>
                `;
            });
            globalChatContainer.scrollTop = globalChatContainer.scrollHeight;
        }, err => console.error(err));
}

function sendGlobalMessage() {
    const rawText = globalChatInput.value.trim();
    if (!rawText) return;
    const cleanText = censorText(rawText);
    
    db.collection("global_chat").add({
        author: currentUser,
        text: cleanText,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => globalChatInput.value = '')
      .catch(e => alert("Action Denied! Firebase Rules blocking writes."));
}

sendGlobalChatBtn.addEventListener('click', sendGlobalMessage);
globalChatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendGlobalMessage(); });
