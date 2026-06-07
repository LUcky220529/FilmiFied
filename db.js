window.saveWatchHistory = async function(movieData) {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  if (!db || !user) return;

  try {
    const historyRef = db.collection('users').doc(user.uid).collection('history').doc(movieData.id.toString());
    await historyRef.set({
      ...movieData,
      watchedAt: Date.now()
    }, { merge: true });
    
    window.loadWatchHistory();
  } catch (error) {
    console.error("Error saving watch history:", error);
  }
};

window.loadWatchHistory = async function() {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  if (!db || !user) {
    if (window.renderContinueWatching) window.renderContinueWatching([]);
    return;
  }

  try {
    const historyCol = db.collection('users').doc(user.uid).collection('history');
    const snapshot = await historyCol.orderBy('watchedAt', 'desc').limit(10).get();
    
    const history = [];
    snapshot.forEach((doc) => {
      history.push(doc.data());
    });
    
    if (window.renderContinueWatching) {
      window.renderContinueWatching(history);
    }
  } catch (error) {
    console.error("Error loading watch history:", error);
  }
};

/* ===== CLOUD REVIEWS & USERNAME ===== */

window.getUserProfile = async function() {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  if (!db || !user) return null;
  
  try {
    const docSnap = await db.collection('users').doc(user.uid).get();
    return docSnap.exists ? docSnap.data() : null;
  } catch (e) {
    console.error("Error fetching user profile:", e);
    return null;
  }
};

window.checkUsernameExists = async function(username) {
  if (!db) return true; // Fail safe
  const usernameLower = username.trim().toLowerCase();
  try {
    const docSnap = await db.collection('usernames').doc(usernameLower).get();
    return docSnap.exists;
  } catch (e) {
    console.error("Error checking username:", e);
    return true; // Assume taken on error
  }
};

window.saveUsername = async function(username) {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  if (!db || !user) return false;
  
  const usernameLower = username.trim().toLowerCase();
  const displayUsername = username.trim();
  
  try {
    // 1. Claim username
    await db.collection('usernames').doc(usernameLower).set({ uid: user.uid, createdAt: Date.now() });
    
    // 2. Save to user profile
    await db.collection('users').doc(user.uid).set({
      username: displayUsername,
      email: user.email,
      updatedAt: Date.now()
    }, { merge: true });
    
    return true;
  } catch (e) {
    console.error("Error saving username:", e);
    return false;
  }
};

window.submitCloudReview = async function(movieId, reviewData) {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  if (!db || !user) return false;
  
  const profile = await window.getUserProfile();
  if (!profile || !profile.username) return false;

  try {
    const reviewId = `${movieId}_${user.uid}`;
    
    // Check if review exists to keep likes/comments
    const existingSnap = await db.collection('reviews').doc(reviewId).get();
    let likes = [];
    let comments = [];
    if (existingSnap.exists) {
        likes = existingSnap.data().likes || [];
        comments = existingSnap.data().comments || [];
    }

    await db.collection('reviews').doc(reviewId).set({
      id: reviewId,
      movieId: movieId.toString(),
      uid: user.uid,
      username: profile.username,
      photoURL: profile.photoURL || user.photoURL || '',
      movieTitle: reviewData.movieTitle || 'Unknown Movie',
      moviePoster: reviewData.moviePoster || '',
      mediaType: reviewData.mediaType || 'movie',
      val: reviewData.val,
      label: reviewData.label,
      emoji: reviewData.emoji,
      text: reviewData.text,
      date: reviewData.date,
      timestamp: Date.now(),
      likes: likes,
      comments: comments
    });
    return true;
  } catch (e) {
    console.error("Error submitting review:", e);
    return false;
  }
};

window.loadCloudReviews = async function(movieId) {
  if (!db) return [];
  try {
    const snapshot = await db.collection('reviews')
        .where('movieId', '==', movieId.toString())
        .get();
        
    const reviews = [];
    snapshot.forEach(doc => reviews.push(doc.data()));
    // Since where query with orderBy requires index, we sort manually
    return reviews.sort((a, b) => b.timestamp - a.timestamp);
  } catch (e) {
    console.error("Error loading reviews:", e);
    return [];
  }
};

window.getUserReviews = async function(uid) {
  if (!db) return [];
  try {
    const snapshot = await db.collection('reviews')
        .where('uid', '==', uid)
        .get();
        
    const reviews = [];
    snapshot.forEach(doc => reviews.push(doc.data()));
    return reviews.sort((a, b) => b.timestamp - a.timestamp);
  } catch (e) {
    console.error("Error loading user reviews:", e);
    return [];
  }
};

window.toggleLikeReview = async function(reviewId) {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  if (!db || !user) return false;

  try {
    const ref = db.collection('reviews').doc(reviewId);
    const doc = await ref.get();
    if (!doc.exists) return false;

    const likes = doc.data().likes || [];
    if (likes.includes(user.uid)) {
      await ref.update({ likes: firebase.firestore.FieldValue.arrayRemove(user.uid) });
    } else {
      await ref.update({ likes: firebase.firestore.FieldValue.arrayUnion(user.uid) });
    }
    return true;
  } catch (e) {
    console.error("Error toggling like:", e);
    return false;
  }
};

window.addCommentToReview = async function(reviewId, text) {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  if (!db || !user) return false;
  
  const profile = await window.getUserProfile();
  if (!profile || !profile.username) return false;

  try {
    const newComment = {
      uid: user.uid,
      username: profile.username,
      photoURL: profile.photoURL || user.photoURL || '',
      text: text,
      timestamp: Date.now()
    };
    await db.collection('reviews').doc(reviewId).update({
      comments: firebase.firestore.FieldValue.arrayUnion(newComment)
    });
    return true;
  } catch (e) {
    console.error("Error adding comment:", e);
    return false;
  }
};

window.updateProfilePhoto = async function(photoUrl) {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  if (!db || !user) return false;
  
  try {
    await db.collection('users').doc(user.uid).update({ photoURL: photoUrl });
    user.customPhoto = photoUrl;
    if (window.updateAuthUI) window.updateAuthUI(user);
    return true;
  } catch (e) {
    console.error("Error updating photo:", e);
    return false;
  }
};

window.updateBio = async function(bioText) {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  if (!db || !user) return false;
  
  try {
    await db.collection('users').doc(user.uid).update({ bio: bioText });
    return true;
  } catch (e) {
    console.error("Error updating bio:", e);
    return false;
  }
};

window.getPublicProfile = async function(uid) {
  if (!db) return null;
  try {
    const doc = await db.collection('users').doc(uid).get();
    return doc.exists ? doc.data() : null;
  } catch (e) {
    console.error("Error fetching public profile:", e);
    return null;
  }
};

window.toggleWatchedMovie = async function(movieData) {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  if (!db || !user) return false;

  const watchedId = `${movieData.id}_${user.uid}`;
  const ref = db.collection('watched').doc(watchedId);

  try {
    const doc = await ref.get();
    if (doc.exists) {
      await ref.delete();
      return 'removed';
    } else {
      await ref.set({
        id: movieData.id.toString(),
        uid: user.uid,
        title: movieData.title || movieData.name || 'Unknown',
        poster: movieData.poster_path ? `https://image.tmdb.org/t/p/w342${movieData.poster_path}` : (movieData.poster || ''),
        mediaType: movieData.media_type || (movieData.title ? 'movie' : 'tv'),
        timestamp: Date.now()
      });
      return 'added';
    }
  } catch (e) {
    console.error("Error toggling watched status:", e);
    return false;
  }
};

window.checkIsWatched = async function(movieId) {
  const user = window.getCurrentUser ? window.getCurrentUser() : null;
  if (!db || !user || !movieId) return false;

  try {
    const watchedId = `${movieId}_${user.uid}`;
    const doc = await db.collection('watched').doc(watchedId).get();
    return doc.exists;
  } catch (e) {
    return false;
  }
};

window.getUserWatchedMovies = async function(uid) {
  if (!db || !uid) return [];
  try {
    const snapshot = await db.collection('watched')
      .where('uid', '==', uid)
      .get();
    
    const watched = [];
    snapshot.forEach(doc => watched.push(doc.data()));
    return watched.sort((a, b) => b.timestamp - a.timestamp);
  } catch (e) {
    console.error("Error fetching user watched movies:", e);
    return [];
  }
};

