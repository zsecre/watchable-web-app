/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { Search, Home, Film, Tv, Library, User, Play, X, ArrowLeft, Check, ChevronRight, Bookmark, BookmarkCheck, History, Sun, Moon, Edit2, LogOut, Send, Pencil, Trash2, ThumbsUp, ThumbsDown, MessageSquare, Star, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Pagination } from 'swiper/modules';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import 'swiper/css';
import 'swiper/css/pagination';

// Firebase
import { 
  collection, 
  collectionGroup,
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  increment,
  getDocs,
  writeBatch,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  type Timestamp
} from 'firebase/firestore';
import { auth, db, OperationType, handleFirestoreError } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatCommentTimestamp(timestamp: any) {
  if (!timestamp || !timestamp.toDate) return 'just now';
  const date = timestamp.toDate();
  const now = new Date();
  
  const timeStr = new Intl.DateTimeFormat('en-US', { 
    hour: 'numeric', 
    minute: 'numeric', 
    hour12: true 
  }).format(date);
  
  const monthDay = new Intl.DateTimeFormat('en-US', { 
    month: 'short', 
    day: 'numeric' 
  }).format(date);
  
  if (date.getFullYear() === now.getFullYear()) {
    return `${timeStr} • ${monthDay}`;
  } else {
    return `${timeStr} • ${monthDay}, ${date.getFullYear()}`;
  }
}

// Interfaces
interface MediaItem {
  id: number | string;
  title: string;
  poster_path: string;
  vote_average: number;
  type: 'Movie' | 'TV Show' | 'Anime';
  backdrop_path?: string;
  source?: 'tmdb' | 'jikan' | 'kitsu';
}

const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIzNmY0N2U0NzAyZjBmZmJiMGM5Nzg4ZDA2OTk1ZWNkZSIsIm5iZiI6MTc3NjE0NDc3My4yNjgsInN1YiI6IjY5ZGRkMTg1ZTUzMmY2OTFkZWQ5NDEwOSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.dy8WanI7kFpTfCorNjBgEiHfx3nJVvBrpz9EZ6veHqo";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const JIKAN_BASE_URL = "https://api.jikan.moe/v4";

// Robust fetch helper
const apiFetch = async (url: string, options?: RequestInit) => {
  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      if (res.status === 429) {
        console.warn(`Rate limit hit for ${url}. Handled gracefully.`);
        return null;
      }
      const text = await res.text();
      throw new Error(`API Error ${res.status}: ${text.slice(0, 100)}`);
    }
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await res.json();
    }
    return null;
  } catch (error) {
    if (error instanceof Error && error.message.includes("Failed to fetch")) {
      console.error(`Network error or CORS issue when fetching ${url}`);
    } else {
      console.error(`Fetch error for ${url}:`, error);
    }
    return null;
  }
};

const WelcomeOverlay = ({ 
  userName, 
  setUserName, 
  setShowOnboarding 
}: { 
  userName: string | null, 
  setUserName: (name: string) => void, 
  setShowOnboarding: (show: boolean) => void 
}) => {
  const [inputName, setInputName] = useState("");
  const [step, setStep] = useState<'input' | 'success'>('input');
  
  const handleSave = () => {
    if (inputName.trim()) {
      const cleanName = inputName.trim().slice(0, 10);
      
      // Ensure userId exists
      if (!localStorage.getItem('streaming_userId')) {
        localStorage.setItem('streaming_userId', Math.random().toString(36).substring(7));
      }
      
      localStorage.setItem('streaming_userName', cleanName);
      setUserName(cleanName);
      setStep('success');
    }
  };

  const handleFinish = () => {
    setShowOnboarding(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center p-6"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-brand-cyan/20 via-transparent to-black pointer-events-none" />
      <div className="relative z-10 w-full max-w-md text-center space-y-8">
        <AnimatePresence mode="wait">
          {step === 'input' ? (
            <motion.div
              key="input-step"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="w-20 h-20 bg-brand-cyan rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-brand-cyan/40 mb-6"
                >
                  <Play className="text-black fill-current ml-1" size={40} />
                </motion.div>
                <motion.h1 
                  className="text-4xl font-black text-text-main tracking-tight"
                >
                  Welcome to <span className="text-brand-cyan">Watchable</span>
                </motion.h1>
                <motion.p className="text-text-muted text-sm leading-relaxed">
                  Your ultimate destination for endless entertainment. Let's get to know you better.
                </motion.p>
              </div>

              <div className="space-y-4">
                <div className="relative group">
                  <input 
                    type="text" 
                    value={inputName}
                    maxLength={10}
                    onChange={(e) => setInputName(e.target.value)}
                    placeholder="Enter your name"
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    className="w-full bg-bg-surface border-2 border-border-subtle rounded-2xl px-6 py-4 text-text-main placeholder-text-muted focus:outline-none focus:border-brand-cyan/50 transition-all text-lg font-medium text-center"
                  />
                  <div className="absolute inset-0 rounded-2xl bg-brand-cyan/5 -z-10 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
                  <p className="text-[10px] text-text-muted mt-2 uppercase tracking-widest">{inputName.length}/10 chars</p>
                </div>
                <button 
                  onClick={handleSave}
                  disabled={!inputName.trim()}
                  className={cn(
                    "w-full py-4 rounded-2xl text-lg font-black transition-all flex items-center justify-center gap-2",
                    inputName.trim() 
                      ? "bg-brand-cyan text-black shadow-lg shadow-brand-cyan/25 active:scale-95" 
                      : "bg-bg-surface text-text-muted cursor-not-allowed border border-border-subtle"
                  )}
                >
                  Next <ChevronRight size={20} />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="success-step"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <div className="w-20 h-20 bg-brand-cyan/10 rounded-full mx-auto flex items-center justify-center mb-6">
                  <Check className="text-brand-cyan" size={40} />
                </div>
                <h2 className="text-3xl font-black text-text-main px-4">
                  Thanks, <span className="text-brand-cyan">{userName}</span>!
                </h2>
                <p className="text-text-muted text-sm leading-relaxed px-8">
                  You're all set. You can now watch your favorite movies, TV shows, or anime for free.
                </p>
              </div>

              <button 
                onClick={handleFinish}
                className="w-full py-4 rounded-2xl bg-brand-cyan text-black text-lg font-black shadow-lg shadow-brand-cyan/25 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                Start Watching <Play size={20} className="fill-current" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold"
        >
          Watch Movies • TV Shows • Anime • Free Forever
        </motion.p>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'All' | 'Movies' | 'Tv' | 'Library' | 'Me'>('All');
  const [playingInfo, setPlayingInfo] = useState<{ url: string; item: MediaItem; season?: number; episode?: number } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [viewAllSection, setViewAllSection] = useState<{ title: string; items: MediaItem[] } | null>(null);
  const [genreView, setGenreView] = useState<{ genre: string; type: 'All' | 'Movie' | 'TV Show' | 'Anime'; items: MediaItem[]; page: number; totalLoaded: number } | null>(null);
  const [viewAllVisibleCount, setViewAllVisibleCount] = useState(20);
  const [slideshowItems, setSlideshowItems] = useState<MediaItem[]>([]);
  const [latestAnime, setLatestAnime] = useState<MediaItem[]>([]);
  const [latestAnimeSeries, setLatestAnimeSeries] = useState<MediaItem[]>([]);
  const [trendingMovies, setTrendingMovies] = useState<MediaItem[]>([]);
  const [trendingTv, setTrendingTv] = useState<MediaItem[]>([]);
  const [popular, setPopular] = useState<MediaItem[]>([]);
  const [popularAnime, setPopularAnime] = useState<MediaItem[]>([]);
  const [topRatedAnime, setTopRatedAnime] = useState<MediaItem[]>([]);
  const [watchlist, setWatchlist] = useState<MediaItem[]>([]);
  const [watchHistory, setWatchHistory] = useState<MediaItem[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        localStorage.setItem('streaming_userId', user.uid);
      }
    });
    return () => unsubscribe();
  }, []);
  
  const syncUserName = async (newName: string) => {
    const userId = localStorage.getItem('streaming_userId');
    if (!userId) return;

    try {
      const q = query(collectionGroup(db, 'entries'), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) return;

      const batch = writeBatch(db);
      snapshot.docs.forEach((d) => {
        const data = d.data();
        // Only update if the name is actually different
        if (data.userName !== newName) {
          batch.update(d.ref, { 
            userName: newName,
            userId: userId 
          });
        }
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'comments/sync');
    }
  };
  
  // Movie Tab Specific State
  const [movieSlideshow, setMovieSlideshow] = useState<MediaItem[]>([]);
  const [latestAnimeMovies, setLatestAnimeMovies] = useState<MediaItem[]>([]);
  const [popularMovies, setPopularMovies] = useState<MediaItem[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<MediaItem[]>([]);
  const [genreResults, setGenreResults] = useState<{ [key: string]: MediaItem[] }>({});

  // TV Tab Specific State
  const [tvSlideshow, setTvSlideshow] = useState<MediaItem[]>([]);
  const [popularTv, setPopularTv] = useState<MediaItem[]>([]);
  const [topRatedTv, setTopRatedTv] = useState<MediaItem[]>([]);
  const [tvGenreResults, setTvGenreResults] = useState<{ [key: string]: MediaItem[] }>({});

  const [loading, setLoading] = useState(true);

  const SearchPrompt = () => (
    <div className="py-16 flex flex-col items-center justify-center text-center px-10">
      <p className="text-text-muted text-[11px] mb-4 max-w-[250px] leading-relaxed">
        Can't find the movie, TV show, or anime you're looking for? Try searching it!
      </p>
      <button 
        onClick={() => setIsSearchOpen(true)}
        className="w-12 h-12 flex items-center justify-center rounded-full bg-brand-cyan/10 border border-brand-cyan/20 text-brand-cyan hover:bg-brand-cyan hover:text-black transition-all hover:scale-110 active:scale-95 shadow-lg shadow-brand-cyan/10"
      >
        <Search size={22} />
      </button>
    </div>
  );

interface CommentItemProps {
  comment: any; 
  mediaId: string; 
  currentUserId: string | null; 
  userName: string | null;
  onUpdate: (id: string) => any;
  onDelete: (id: string) => any;
  isEditing: boolean;
  setEditingId: (id: string | null) => void;
  editingText: string;
  setEditingText: (t: string) => void;
  isUpdating: boolean;
  deletingId: string | null;
  setDeletingId: (id: string | null) => void;
  onConfirmDelete: (id: string) => any;
}

const CommentItem: React.FC<CommentItemProps> = ({ 
  comment, 
  mediaId, 
  currentUserId, 
  userName, 
  onUpdate, 
  onDelete,
  isEditing,
  setEditingId,
  editingText,
  setEditingText,
  isUpdating,
  deletingId,
  setDeletingId,
  onConfirmDelete
}) => {
  const [replies, setReplies] = useState<any[]>([]);
  const [reactions, setReactions] = useState<any[]>([]);
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [showReplyInput, setShowReplyInput] = useState(false);

  useEffect(() => {
    const repliesRef = collection(db, 'comments', mediaId, 'entries', comment.id, 'replies');
    const qReplies = query(repliesRef, orderBy('timestamp', 'asc'));
    const unsubReplies = onSnapshot(qReplies, (s) => {
      setReplies(s.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Replies listener failed", err);
    });

    const reactionsRef = collection(db, 'comments', mediaId, 'entries', comment.id, 'reactions');
    const unsubReactions = onSnapshot(reactionsRef, (s) => {
      setReactions(s.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Reactions listener failed", err);
    });

    return () => { unsubReplies(); unsubReactions(); };
  }, [mediaId, comment.id]);

  const likes = reactions.filter(r => r.type === 'like').length;
  const dislikes = reactions.filter(r => r.type === 'dislike').length;
  const userReaction = reactions.find(r => r.userId === currentUserId)?.type;

  const handleReaction = async (type: 'like' | 'dislike') => {
    if (!currentUserId) return;
    try {
      const reactionRef = doc(db, 'comments', mediaId, 'entries', comment.id, 'reactions', currentUserId);
      if (userReaction === type) {
        await deleteDoc(reactionRef);
      } else {
        await setDoc(reactionRef, { 
          type, 
          userId: currentUserId, 
          timestamp: serverTimestamp() 
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `comments/${mediaId}/entries/${comment.id}/reactions/${currentUserId}`);
    }
  };

  const handlePostReply = async () => {
    if (!replyText.trim() || !userName || !currentUserId) return;
    setIsReplying(true);
    try {
      const targetMediaId = mediaId;

      await addDoc(collection(db, 'comments', targetMediaId, 'entries', comment.id, 'replies'), {
        userId: currentUserId,
        userName,
        text: replyText.trim(),
        timestamp: serverTimestamp()
      });
      
      // Update repliesCount on parent comment
      await updateDoc(doc(db, 'comments', targetMediaId, 'entries', comment.id), {
        repliesCount: increment(1)
      });

      setReplyText("");
      setShowReplyInput(false);
      setShowReplies(true);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `comments/${mediaId}/entries/${comment.id}/replies`);
    } finally {
      setIsReplying(false);
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    try {
      await deleteDoc(doc(db, 'comments', mediaId, 'entries', comment.id, 'replies', replyId));
      
      // Update repliesCount on parent comment
      await updateDoc(doc(db, 'comments', mediaId, 'entries', comment.id), {
        repliesCount: increment(-1)
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `comments/${mediaId}/entries/${comment.id}/replies/${replyId}`);
    }
  };

  return (
    <div className="group space-y-4 p-4 rounded-2xl bg-bg-surface/30 border border-border-subtle hover:bg-bg-surface/40 transition-all">
      <div className="flex gap-4">
        <div className="w-10 h-10 rounded-full bg-bg-surface border border-border-subtle flex items-center justify-center text-xs font-black text-text-muted shrink-0 uppercase shadow-sm">
          {comment.userName ? comment.userName[0] : '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-text-main text-xs font-black">{comment.userName}</span>
                <span className="text-text-muted text-[10px]">
                  {formatCommentTimestamp(comment.timestamp)}
                </span>
                {comment.userId === currentUserId && (
                  <span className="text-brand-cyan text-[8px] font-black uppercase tracking-tighter self-center bg-brand-cyan/10 px-1.5 py-0.5 rounded shadow-sm shadow-brand-cyan/20 border border-brand-cyan/20">You</span>
                )}
              </div>
              
              {isEditing ? (
                <div className="space-y-3 pt-2">
                  <div className="relative">
                    <textarea 
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value.slice(0, 350))}
                      className="w-full bg-bg-surface border border-brand-cyan/20 rounded-xl p-3 text-text-main text-sm focus:ring-1 focus:ring-brand-cyan/50 outline-none resize-none h-24 shadow-inner"
                      autoFocus
                    />
                    <div className={cn(
                      "absolute bottom-2 right-2 text-[9px] font-black tracking-widest uppercase py-0.5 px-1.5 rounded-sm bg-black/40 backdrop-blur-md",
                      editingText.length >= 350 ? "text-brand-red animate-pulse" : "text-text-muted"
                    )}>
                      {editingText.length}/350
                    </div>
                  </div>
                  <div className="flex justify-end gap-3">
                    <button 
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-text-muted hover:text-text-main transition-colors bg-white/5 rounded-full"
                      disabled={isUpdating}
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={() => onUpdate(comment.id)}
                      disabled={isUpdating || !editingText.trim() || editingText === comment.text}
                      className="bg-brand-cyan text-black px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-brand-cyan/20"
                    >
                      {isUpdating ? 'Saving...' : 'Update'}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-text-main/80 text-sm leading-relaxed whitespace-pre-wrap py-1">{comment.text}</p>
              )}
            </div>

            {!isEditing && comment.userId === currentUserId && (
              <div className="flex gap-2 shrink-0 pt-0.5">
                {deletingId === comment.id ? (
                  <div className="flex items-center gap-2 bg-white/5 p-1 rounded-full border border-brand-red/20 shadow-lg shadow-brand-red/5">
                    <span className="text-[8px] font-black uppercase text-brand-red px-2 animate-pulse">Sure?</span>
                    <button 
                      onClick={() => onConfirmDelete(comment.id)}
                      className="p-1.5 rounded-full bg-brand-red text-white hover:scale-110 active:scale-95 transition-all shadow-md shadow-brand-red/20"
                      title="Confirm Delete"
                    >
                      <Check size={12} />
                    </button>
                    <button 
                      onClick={() => setDeletingId(null)}
                      className="p-1.5 rounded-full bg-white/10 text-text-muted hover:bg-white/20 transition-all"
                      title="Cancel"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => {
                        setEditingId(comment.id);
                        setEditingText(comment.text);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/5 text-text-muted hover:bg-brand-cyan/20 hover:text-brand-cyan transition-all group/btn"
                      title="Edit comment"
                    >
                      <Pencil size={12} />
                      <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Edit</span>
                    </button>
                    <button 
                      onClick={() => onDelete(comment.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/5 text-text-muted hover:bg-brand-red/20 hover:text-brand-red transition-all group/btn"
                      title="Delete comment"
                    >
                      <Trash2 size={12} />
                      <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Delete</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1">
              <button 
                onClick={() => handleReaction('like')}
                className={cn(
                  "p-1.5 rounded-full transition-all flex items-center gap-1.5 group/btn",
                  userReaction === 'like' ? "text-brand-cyan bg-brand-cyan/10" : "text-text-muted hover:text-brand-cyan hover:bg-brand-cyan/5"
                )}
              >
                <ThumbsUp size={14} className={cn(userReaction === 'like' && "fill-current")} />
                <span className="text-[10px] font-black">{likes > 0 ? likes : ''}</span>
              </button>
              <button 
                onClick={() => handleReaction('dislike')}
                className={cn(
                  "p-1.5 rounded-full transition-all flex items-center gap-1.5 group/btn",
                  userReaction === 'dislike' ? "text-brand-red bg-brand-red/10" : "text-text-muted hover:text-brand-red hover:bg-brand-red/5"
                )}
              >
                <ThumbsDown size={14} className={cn(userReaction === 'dislike' && "fill-current")} />
                <span className="text-[10px] font-black">{dislikes > 0 ? dislikes : ''}</span>
              </button>
            </div>

            <button 
              onClick={() => setShowReplyInput(!showReplyInput)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-text-muted hover:text-text-main hover:bg-white/5 transition-all text-[10px] font-black uppercase tracking-widest"
            >
              <MessageSquare size={14} />
              Reply
            </button>

            {replies.length > 0 && (
              <button 
                onClick={() => setShowReplies(!showReplies)}
                className="text-[10px] font-black text-brand-cyan hover:underline uppercase tracking-widest ml-auto"
              >
                {showReplies ? "Hide Replies" : `View ${replies.length} ${replies.length === 1 ? 'Reply' : 'Replies'}`}
              </button>
            )}
          </div>

          {showReplyInput && (
            <div className="mt-4 flex gap-3 p-3 bg-white/5 rounded-2xl border border-white/5">
              <div className="w-8 h-8 rounded-full bg-brand-cyan/20 flex items-center justify-center text-[10px] font-black text-brand-cyan shrink-0">
                {userName ? userName[0] : 'U'}
              </div>
              <div className="flex-1 space-y-2">
                <textarea 
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value.slice(0, 350))}
                  placeholder="Type your reply..."
                  className="w-full bg-transparent border-none p-0 text-sm text-text-main placeholder-text-muted focus:ring-0 resize-none h-12"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button 
                    onClick={() => setShowReplyInput(false)}
                    className="px-3 py-1 text-[9px] font-black uppercase tracking-widest text-text-muted hover:text-text-main transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handlePostReply}
                    disabled={isReplying || !replyText.trim()}
                    className="bg-brand-cyan text-black px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {isReplying ? 'Replying...' : 'Reply'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showReplies && replies.length > 0 && (
            <div className="mt-4 pl-4 border-l-2 border-white/5 space-y-4">
              {replies.map(r => (
                <div key={r.id} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-bg-surface border border-border-subtle flex items-center justify-center text-[10px] font-black text-text-muted shrink-0 uppercase">
                    {r.userName ? r.userName[0] : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-text-main text-[11px] font-black">{r.userName}</span>
                      <span className="text-text-muted text-[9px]">{formatCommentTimestamp(r.timestamp)}</span>
                      {r.userId === currentUserId && (
                        <div className="flex items-center gap-2">
                          <span className="text-brand-cyan text-[7px] font-black uppercase tracking-tighter self-center bg-brand-cyan/10 px-1 py-0.5 rounded shadow-sm border border-brand-cyan/20">You</span>
                          <button 
                            onClick={() => handleDeleteReply(r.id)}
                            className="text-text-muted hover:text-brand-red p-1 transition-colors"
                            title="Delete Reply"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-text-main/70 text-xs mt-0.5">{r.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


const PlayerScreen = ({ info, onClose, userName }: { info: { url: string; item: MediaItem; season?: number; episode?: number }; onClose: () => void; userName: string | null }) => {
    const { url, item } = info;
    const [showControls, setShowControls] = useState(true);

    const [details, setDetails] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [seasons, setSeasons] = useState<any[]>([]);
    const [episodes, setEpisodes] = useState<any[]>([]);
    const [imdbId, setImdbId] = useState<string | null>(null);
    const [selectedSeason, setSelectedSeason] = useState(info.season || 1);
    
    // Default Full View (Standard Web/Desktop)
    const [showAllComments, setShowAllComments] = useState(false);
    const [episodeSearch, setEpisodeSearch] = useState("");
    const [selectedRange, setSelectedRange] = useState<[number, number] | null>(null);
    
    const [comments, setComments] = useState<any[]>([]);
    const [commentText, setCommentText] = useState("");
    const [isPosting, setIsPosting] = useState(false);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingCommentText, setEditingCommentText] = useState("");
    const [isUpdating, setIsUpdating] = useState(false);
    
    // Media Stats & User Interactions
    const [stats, setStats] = useState<any>(null);
    const [userInteraction, setUserInteraction] = useState<any>(null);
    const [viewCounted, setViewCounted] = useState(false);
    
    // Identity handling
    const [currentUser, setCurrentUser] = useState(auth.currentUser);

    useEffect(() => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setCurrentUser(user);
      });
      return () => unsubscribe();
    }, []);

    const currentUserId = currentUser?.uid || localStorage.getItem('streaming_userId');
    const isAuthReady = !!currentUser?.uid;

    useEffect(() => {
      const mediaId = imdbId || String(item.id);
      const isTV = item.type === 'TV Show' || item.type === 'Anime';
      
      // Use mediaId as parent document for organized comments
      const commentsRef = collection(db, 'comments', mediaId, 'entries');
      let q = query(
        commentsRef,
        orderBy('timestamp', 'desc')
      );

      if (isTV) {
        q = query(
          commentsRef,
          where('seasonNumber', '==', selectedSeason),
          where('episodeNumber', '==', (info.episode || 1)),
          orderBy('timestamp', 'desc')
        );
      }

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedComments = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setComments(fetchedComments);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `comments/${mediaId}/entries`);
      });

      return () => unsubscribe();
    }, [item.id, imdbId, selectedSeason, info.episode, item.type]);

    // Track View after 1 minute
    useEffect(() => {
      const mediaId = imdbId || String(item.id);
      if (!mediaId || viewCounted) return;

      const timer = setTimeout(async () => {
        try {
          const statsRef = doc(db, 'stats', mediaId);
          await setDoc(statsRef, { views: increment(1) }, { merge: true });
          setViewCounted(true);
          
          if (currentUserId) {
            const userRef = doc(db, 'users', currentUserId, 'interactions', mediaId);
            await setDoc(userRef, { lastViewed: serverTimestamp() }, { merge: true });
          }
        } catch (e) {
          console.warn("View tracking failed", e);
        }
      }, 60000); // 1 minute

      return () => clearTimeout(timer);
    }, [item.id, imdbId, viewCounted, currentUserId]);

    // Fetch Stats & User Interaction
    useEffect(() => {
      const mediaId = imdbId || String(item.id);
      if (!mediaId) return;

      const statsRef = doc(db, 'stats', mediaId);
      const unsubStats = onSnapshot(statsRef, (s) => {
        if (s.exists()) setStats(s.data());
      });

      let unsubUser = () => {};
      if (currentUserId) {
        const userRef = doc(db, 'users', currentUserId, 'interactions', mediaId);
        unsubUser = onSnapshot(userRef, (s) => {
          if (s.exists()) setUserInteraction(s.data());
        });
      }

      return () => { unsubStats(); unsubUser(); };
    }, [item.id, imdbId, currentUserId]);

    const handleMediaReaction = async (type: 'like' | 'dislike') => {
      if (!currentUserId) return;
      const mediaId = imdbId || String(item.id);
      try {
        const userRef = doc(db, 'users', currentUserId, 'interactions', mediaId);
        const statsRef = doc(db, 'stats', mediaId);
        const currentReaction = userInteraction?.reaction || 'none';
        
        let statsUpdate: any = {};
        
        if (currentReaction === type) {
          // Remove reaction
          statsUpdate[type === 'like' ? 'likes' : 'dislikes'] = increment(-1);
          await setDoc(userRef, { reaction: 'none' }, { merge: true });
        } else {
          // Change or add reaction
          if (currentReaction !== 'none') {
            statsUpdate[currentReaction === 'like' ? 'likes' : 'dislikes'] = increment(-1);
          }
          statsUpdate[type === 'like' ? 'likes' : 'dislikes'] = increment(1);
          await setDoc(userRef, { reaction: type }, { merge: true });
        }
        
        await setDoc(statsRef, statsUpdate, { merge: true });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `stats/${mediaId}/reaction`);
      }
    };

    const handleSetRating = async (rating: number) => {
      if (!currentUserId) return;
      const mediaId = imdbId || String(item.id);
      try {
        const userRef = doc(db, 'users', currentUserId, 'interactions', mediaId);
        const statsRef = doc(db, 'stats', mediaId);
        const oldRating = userInteraction?.rating || 0;
        
        let statsUpdate: any = {};
        if (oldRating === 0) {
          statsUpdate.ratingCount = increment(1);
          statsUpdate.ratingSum = increment(rating);
        } else {
          statsUpdate.ratingSum = increment(rating - oldRating);
        }
        
        await setDoc(userRef, { rating }, { merge: true });
        await setDoc(statsRef, statsUpdate, { merge: true });
        
        // Compute average after update (client-side approximation or wait for snapshot)
        const currentStats = stats || { ratingSum: 0, ratingCount: 0 };
        const newSum = (currentStats.ratingSum || 0) + (oldRating === 0 ? rating : rating - oldRating);
        const newCount = (currentStats.ratingCount || 0) + (oldRating === 0 ? 1 : 0);
        if (newCount > 0) {
          await setDoc(statsRef, { averageRating: newSum / newCount }, { merge: true });
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `stats/${mediaId}/rating`);
      }
    };

    const handlePostComment = async () => {
      if (!commentText.trim() || !userName || commentText.length > 350) return;
      
      setIsPosting(true);
      try {
        const mediaId = imdbId || String(item.id);
        const isTV = item.type === 'TV Show' || item.type === 'Anime';
        
        const commentData = {
          mediaId,
          mediaType: isTV ? 'tv' : 'movie',
          seasonNumber: isTV ? selectedSeason : null,
          episodeNumber: isTV ? (info.episode || 1) : null,
          userId: currentUserId || Math.random().toString(36).substring(7),
          userName: userName,
          text: commentText.trim(),
          timestamp: serverTimestamp()
        };

        // Save userId if it was generated and we don't have auth
        if (!currentUserId) {
          localStorage.setItem('streaming_userId', commentData.userId);
        }

        await addDoc(collection(db, 'comments', mediaId, 'entries'), commentData);
        setCommentText("");
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `comments/${imdbId || item.id}/entries`);
      } finally {
        setIsPosting(false);
      }
    };

    const handleUpdateComment = async (commentId: string) => {
      if (!editingCommentText.trim() || editingCommentText.length > 350) return;
      
      setIsUpdating(true);
      try {
        const mediaId = imdbId || String(item.id);
        const commentRef = doc(db, 'comments', mediaId, 'entries', commentId);
        
        // We include userId as a 'soft signature' to verify ownership in rules
        await updateDoc(commentRef, {
          text: editingCommentText.trim(),
          userId: currentUserId 
        });
        
        setEditingCommentId(null);
        setEditingCommentText("");
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `comments/${imdbId || item.id}/entries/${commentId}`);
      } finally {
        setIsUpdating(false);
      }
    };

    const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

    const handleDeleteComment = async (commentId: string) => {
      setDeletingCommentId(commentId);
    };

    const confirmDeleteComment = async (commentId: string) => {
      try {
        const mediaId = imdbId || String(item.id);
        const commentRef = doc(db, 'comments', mediaId, 'entries', commentId);
        await deleteDoc(commentRef);
        setDeletingCommentId(null);
      } catch (error: any) {
        let msg = "Failed to delete comment.";
        if (error.message?.includes("permissions")) {
          msg = "Permission denied. You can only delete your own comments.";
        }
        alert(msg);
        handleFirestoreError(error, OperationType.DELETE, `comments/${imdbId || item.id}/entries/${commentId}`);
      }
    };
    
    const stretch = { opacity: 1, scale: 1 };
    const shrink = { opacity: 0, scale: 1.1 };

    const stringifyDate = (date: any) => {
      if (!date) return "";
      if (typeof date === 'string') return date;
      if (typeof date === 'object' && date.year) {
        return `${date.year}-${String(date.month || 1).padStart(2, '0')}-${String(date.day || 1).padStart(2, '0')}`;
      }
      return String(date);
    };

    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
      if (info.season) {
        setSelectedSeason(info.season);
      }
    }, [info.season]);

    const resetTimer = () => {
      setShowControls(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    useEffect(() => {
      resetTimer();
      fetchImdbId();
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, [item]);

    useEffect(() => {
      if (item && (item.type === 'TV Show' || item.type === 'Anime') && selectedSeason && imdbId) {
        fetchSeasonEpisodes(selectedSeason, imdbId);
      }
    }, [selectedSeason, item, imdbId]);

    const fetchSeasonEpisodes = async (seasonNum: number, currentImdbId?: string) => {
      const targetId = currentImdbId || imdbId;
      try {
        if (targetId) {
          const data = await apiFetch(`https://api.imdbapi.dev/titles/${targetId}/episodes?season=${seasonNum}`);
          
          let epList = [];
          if (data && data.episodes && Array.isArray(data.episodes)) {
            epList = data.episodes;
          } else if (Array.isArray(data)) {
            epList = data;
          }

          if (epList.length > 0) {
            let mappedEpisodes = epList.map((ep: any) => ({
              id: ep.id || `${targetId}-${seasonNum}-${ep.episodeNumber || ep.episode}`,
              episode_number: ep.episodeNumber || ep.episode,
              name: typeof ep.title === 'string' ? ep.title : (ep.title?.text || `Episode ${ep.episodeNumber || ep.episode}`),
              still_path: ep.primaryImage?.url || ep.image || ep.thumbnail,
              air_date: stringifyDate(ep.releaseDate || ep.airDate),
              plot: typeof ep.plot === 'string' ? ep.plot : (ep.plot?.text || "")
            }));

            const totalCountVal = parseInt(data.totalCount);
            const totalCount = !isNaN(totalCountVal) ? totalCountVal : mappedEpisodes.length;
            
            if (totalCount > mappedEpisodes.length) {
              const existingEpNumbers = new Set(mappedEpisodes.map(e => Number(e.episode_number)));
              for (let i = 1; i <= totalCount; i++) {
                if (!existingEpNumbers.has(i)) {
                  mappedEpisodes.push({
                    id: `${targetId}-${seasonNum}-${i}-placeholder`,
                    episode_number: i,
                    name: `Episode ${i}`,
                    still_path: null,
                    air_date: "",
                    plot: "Episode details are pending update."
                  });
                }
              }
              mappedEpisodes.sort((a, b) => Number(a.episode_number) - Number(b.episode_number));
            }

            setEpisodes(mappedEpisodes);
            return;
          }
        }

        // Fallback to TMDB if IMDB episodes fail
        if (item.type !== 'Anime') {
          const headers = { 'Authorization': `Bearer ${TMDB_TOKEN}` };
          const data = await apiFetch(`${TMDB_BASE_URL}/tv/${item.id}/season/${seasonNum}`, { headers });
          if (data && data.episodes) {
            setEpisodes(data.episodes.map((ep: any) => ({
              ...ep,
              still_path: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null
            })));
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    const fetchImdbId = async () => {
      setLoading(true);
      try {
        let id = "";
        if (item.source === 'kitsu') {
          const data = await apiFetch(`https://arm.haglund.dev/api/v2/ids?source=kitsu&id=${item.id}`);
          id = data?.imdb || "";
        } else if (item.type === 'Anime') {
          const data = await apiFetch(`https://arm.haglund.dev/api/v2/ids?source=myanimelist&id=${item.id}`);
          id = data?.imdb || "";
        } else {
          const type = item.type === 'Movie' ? 'movie' : 'tv';
          const data = await apiFetch(`${TMDB_BASE_URL}/${type}/${item.id}/external_ids?api_key=36f47e4702f0ffbb0c9788d06995ecde`);
          id = data?.imdb_id || "";
        }

        if (id) {
          setImdbId(id);
          fetchImdbDetails(id);
        } else {
          fetchTmdbFallback();
        }
      } catch (e) {
        console.error(e);
        fetchTmdbFallback();
      }
    };

    const fetchImdbDetails = async (id: string) => {
      try {
        const data = await apiFetch(`https://api.imdbapi.dev/titles/${id}`);
        if (!data) throw new Error("No data received from IMDB API");
        
        const mappedDetails: any = {
          title: (typeof data.title === 'string' ? data.title : data.title?.text) || item?.title,
          overview: typeof data.plot === 'string' ? data.plot : (data.plot?.text || "No overview available."),
          poster_path: data.image || item?.poster_path,
          vote_average: data.rating?.aggregateRating || item?.vote_average || 0,
          release_date: stringifyDate(data.releaseDate || data.startYear || "N/A"),
          genres: Array.isArray(data.genres) ? data.genres.map((g: any) => typeof g === 'string' ? g : (g.text || g.displayName)).join(', ') : "N/A",
          status: typeof data.status === 'string' ? data.status : "N/A",
          runtime: data.runtimeSeconds ? Math.floor(data.runtimeSeconds / 60) : null,
          vote_count: data.rating?.ratingCount || 0,
          popularity: data.meterRanking?.currentRank || 0,
          type: item?.type
        };

        setDetails(mappedDetails);

        // Fetch similar shows from TMDB
        const type = item.type === 'Movie' ? 'movie' : 'tv';
        const headers = { 'Authorization': `Bearer ${TMDB_TOKEN}` };
        const simData = await apiFetch(`${TMDB_BASE_URL}/${type}/${item.id}/similar`, { headers });
        setDetails((prev: any) => ({
          ...prev,
          similar: simData?.results?.slice(0, 12).map((s: any) => ({
            id: s.id,
            title: s.title || s.name,
            poster_path: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster',
            type: item.type,
            vote_average: s.vote_average
          }))
        }));

        if (item?.type === 'TV Show' || item?.type === 'Anime') {
          fetchImdbSeasons(id);
        }
      } catch (e) {
        console.error(e);
        fetchTmdbFallback();
      } finally {
        setLoading(false);
      }
    };

    const fetchImdbSeasons = async (id: string) => {
      try {
        const data = await apiFetch(`https://api.imdbapi.dev/titles/${id}/seasons`);
        
        let seasonsList: any[] = [];
        if (data && data.seasons && Array.isArray(data.seasons)) {
          seasonsList = data.seasons.map((s: any) => ({ 
            season_number: parseInt(s.season),
            episode_count: s.episodeCount
          }));
        } else if (Array.isArray(data)) {
          seasonsList = data.map(s => ({ 
            season_number: typeof s === 'number' ? s : (parseInt(s.seasonNumber) || parseInt(s.season)) 
          }));
        }

        let finalSeasons: any[] = [];
        const validNumericSeasons = seasonsList.filter(s => !isNaN(s.season_number) && s.season_number > 0);

        if (validNumericSeasons.length > 0) {
          const maxSeasonNumber = Math.max(...validNumericSeasons.map(s => s.season_number));
          finalSeasons = Array.from({ length: maxSeasonNumber }, (_, i) => ({ 
            season_number: i + 1 
          }));
        } else if (data.totalSeasons) {
          finalSeasons = Array.from({ length: data.totalSeasons }, (_, i) => ({ season_number: i + 1 }));
        }

        if (finalSeasons.length > 0) {
          setSeasons(finalSeasons);
          
          if (finalSeasons.length > 0) {
            const firstSeason = info.season || finalSeasons[0].season_number;
            setSelectedSeason(firstSeason);
            fetchSeasonEpisodes(firstSeason, id);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    const fetchTmdbFallback = async () => {
      try {
        const type = item.type === 'Movie' ? 'movie' : 'tv';
        const headers = { 'Authorization': `Bearer ${TMDB_TOKEN}` };
        const [detailsData, simData] = await Promise.all([
          apiFetch(`${TMDB_BASE_URL}/${type}/${item.id}`, { headers }),
          apiFetch(`${TMDB_BASE_URL}/${type}/${item.id}/similar`, { headers })
        ]);
        
        setDetails({
          ...detailsData,
          similar: simData?.results?.slice(0, 12).map((s: any) => ({
            id: s.id,
            title: s.title || s.name,
            poster_path: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster',
            type: item.type,
            vote_average: s.vote_average
          }))
        });

        if (item.type === 'TV Show' || item.type === 'Anime') {
          setSeasons(detailsData.seasons || []);
          fetchTMDBEpisodes(selectedSeason);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    const fetchTMDBEpisodes = async (seasonNum: number) => {
      try {
        const headers = { 'Authorization': `Bearer ${TMDB_TOKEN}` };
        const data = await apiFetch(`${TMDB_BASE_URL}/tv/${item.id}/season/${seasonNum}`, { headers });
        if (data && data.episodes) {
          setEpisodes(data.episodes.map((ep: any) => ({
            ...ep,
            still_path: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null
          })));
        }
      } catch (e) {
        console.error(e);
      }
    };

    const playEpisode = (epNum: number) => {
      let newUrl = imdbId 
        ? `https://vidsrc.xyz/embed/tv?imdb=${imdbId}&season=${selectedSeason}&episode=${epNum}`
        : `https://vidsrc.xyz/embed/tv?tmdb=${item.id}&season=${selectedSeason}&episode=${epNum}`;
      
      setPlayingInfo({ url: newUrl, item: item, season: selectedSeason, episode: epNum });
    };

    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black z-[300] flex flex-col"
        onMouseMove={resetTimer}
        onTouchStart={resetTimer}
        onClick={resetTimer}
      >
        <AnimatePresence>
          {showControls && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-0 left-0 right-0 h-20 flex items-center px-6 z-20 bg-gradient-to-b from-black/90 to-transparent pointer-events-none"
            >
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }} 
                className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-all backdrop-blur-md border border-white/5 pointer-events-auto shadow-xl"
              >
                <ArrowLeft size={24} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full bg-black aspect-video relative group shrink-0">
          <iframe 
            src={url}
            className="w-full h-full"
            title="Video Player" 
            frameBorder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowFullScreen
            referrerPolicy="no-referrer"
          />
          {!showControls && (
            <div 
              className="absolute inset-0 z-10 cursor-pointer" 
              onClick={resetTimer}
            />
          )}
        </div>
        
        <div className="w-full flex-1 overflow-y-auto bg-bg-deep custom-scrollbar p-5">
          <div className="max-w-4xl mx-auto space-y-8">
            {showAllComments ? (
              /* All Comments View */
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8 pb-10"
              >
                <div className="flex items-center justify-between sticky top-0 bg-bg-deep py-4 z-20">
                  <h3 className="text-2xl font-black text-text-main">
                    Comments ({comments.reduce((acc, c) => acc + 1 + (c.repliesCount || 0), 0)})
                  </h3>
                  <button 
                    onClick={() => setShowAllComments(false)}
                    className="p-2 rounded-full bg-bg-surface text-text-main hover:bg-text-main hover:text-bg-deep transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Add Comment Input */}
                  <div className="flex gap-4 p-4 rounded-2xl bg-brand-cyan/5 border border-brand-cyan/10">
                    <div className="w-10 h-10 rounded-full bg-brand-cyan flex items-center justify-center text-xs font-black text-black shrink-0">
                      {userName ? userName[0] : 'U'}
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="relative">
                        <textarea 
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value.slice(0, 350))}
                          placeholder="Write your thoughts..." 
                          className="w-full bg-transparent border-none p-0 text-text-main placeholder-text-muted focus:ring-0 resize-none text-sm h-20"
                          disabled={isPosting}
                        />
                        <div className={cn(
                          "absolute bottom-0 right-0 text-[9px] font-black tracking-widest uppercase py-1 px-2 rounded-md",
                          commentText.length >= 350 ? "text-brand-red bg-brand-red/10 animate-pulse" : "text-text-muted bg-white/5"
                        )}>
                          {commentText.length}/350
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button 
                          onClick={handlePostComment}
                          disabled={isPosting || !commentText.trim()}
                          className="bg-brand-cyan text-black text-[10px] font-black px-6 py-2.5 rounded-full uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {isPosting ? 'Posting...' : 'Post Comment'}
                          {!isPosting && <Send size={12} />}
                        </button>
                      </div>
                    </div>
                  </div>
                  {comments.length > 0 ? comments.map((c) => (
                    <CommentItem 
                      key={c.id}
                      comment={c}
                      mediaId={imdbId || String(item.id)}
                      currentUserId={currentUserId}
                      userName={userName}
                      isEditing={editingCommentId === c.id}
                      setEditingId={setEditingCommentId}
                      editingText={editingCommentText}
                      setEditingText={setEditingCommentText}
                      isUpdating={isUpdating}
                      onUpdate={handleUpdateComment}
                      onDelete={handleDeleteComment}
                      deletingId={deletingCommentId}
                      setDeletingId={setDeletingCommentId}
                      onConfirmDelete={confirmDeleteComment}
                    />
                  )) : (
                    <div className="text-center py-10">
                      <p className="text-text-muted text-sm italic">No comments yet. Be the first to share your thoughts!</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8 pb-10"
              >
                {/* Title and Interactions */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2 flex-1 min-w-0">
                      <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-text-main break-words leading-tight">
                        {item.title}
                      </h1>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-black text-text-muted uppercase tracking-widest min-h-[32px]">
                        <div className="flex items-center gap-1.5 py-1 px-2.5 bg-white/5 rounded-full border border-white/10 bg-gradient-to-r from-brand-cyan/10 to-transparent">
                          <Play size={10} className="fill-current text-brand-cyan" />
                          <span className="text-text-main">
                            {stats ? ((stats.views || 0) + (details?.vote_count || 0)).toLocaleString() : '---'} Reach
                          </span>
                          <span className="opacity-30">•</span>
                          <span className="text-[9px] opacity-70">
                            {stats?.views ? stats.views.toLocaleString() : '0'} Views
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 py-1 px-2.5 bg-white/5 rounded-full border border-white/10 shadow-lg shadow-black/20">
                          <span className="text-brand-cyan">Score</span>
                          <span className="text-text-main text-xs font-black min-w-[2ch] inline-block text-center">
                            {(stats?.averageRating 
                              ? ((details?.vote_average || item.vote_average) * 0.7 + stats.averageRating * 0.3) 
                              : (details?.vote_average || item.vote_average)).toFixed(1)}
                          </span>
                          <span className="opacity-30 mx-1">|</span>
                          <div className="flex items-center gap-1 opacity-60">
                            <span className="text-[8px] text-yellow-500 font-black">IMDb</span>
                            <span>{(details?.vote_average || item.vote_average).toFixed(1)}</span>
                          </div>
                          <div className={cn("flex items-center gap-1 opacity-60 ml-1 transition-opacity", !stats?.averageRating && "opacity-0")}>
                            <span className="text-[8px] text-brand-cyan font-black">App</span>
                            <span>{stats?.averageRating ? stats.averageRating.toFixed(1) : '0.0'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 py-1 px-2.5 bg-white/5 rounded-full border border-white/10">
                          <ThumbsUp size={10} className={cn(userInteraction?.reaction === 'like' && "text-brand-cyan fill-current")} />
                          <span>{stats?.likes?.toLocaleString() || '0'}</span>
                          <span className="opacity-50 mx-1">/</span>
                          <ThumbsDown size={10} className={cn(userInteraction?.reaction === 'dislike' && "text-brand-red fill-current")} />
                          <span>{stats?.dislikes?.toLocaleString() || '0'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Rating Selector */}
                      <div className="flex items-center bg-bg-surface p-1 rounded-xl border border-border-subtle shadow-sm">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={`star-${star}`}
                            onClick={() => handleSetRating(star * 2)}
                            className={cn(
                              "p-1.5 transition-all hover:scale-125",
                              (userInteraction?.rating || 0) >= star * 2 ? "text-brand-cyan" : "text-text-muted hover:text-brand-cyan/60"
                            )}
                          >
                            <Star size={14} className={cn((userInteraction?.rating || 0) >= star * 2 && "fill-current")} />
                          </button>
                        ))}
                      </div>

                      {/* Like/Dislike Buttons */}
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleMediaReaction('like')}
                          className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95",
                            userInteraction?.reaction === 'like' 
                              ? "bg-brand-cyan text-black shadow-lg shadow-brand-cyan/20" 
                              : "bg-bg-surface text-text-muted hover:bg-white/5 border border-border-subtle"
                          )}
                        >
                          <ThumbsUp size={14} className={cn(userInteraction?.reaction === 'like' && "fill-current")} />
                          Like
                        </button>
                        <button 
                          onClick={() => handleMediaReaction('dislike')}
                          className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95",
                            userInteraction?.reaction === 'dislike' 
                              ? "bg-brand-red text-white shadow-lg shadow-brand-red/20" 
                              : "bg-bg-surface text-text-muted hover:bg-white/5 border border-border-subtle"
                          )}
                        >
                          <ThumbsDown size={14} className={cn(userInteraction?.reaction === 'dislike' && "fill-current")} />
                          {userInteraction?.reaction === 'dislike' ? 'Disliked' : 'Dislike'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {item.type === 'Movie' && (
                  <CommentPreviewSection comments={comments} onExpand={() => setShowAllComments(true)} userName={userName} />
                )}

                {/* TV Show Controls */}
                {(item.type === 'TV Show' || item.type === 'Anime') && seasons.length > 0 && (
                  <div className="space-y-6">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                      {seasons.filter((s: any) => s.season_number > 0).map((s: any) => (
                        <button 
                          key={`player-season-${s.season_number}`}
                          onClick={() => {
                            setSelectedSeason(s.season_number);
                            setSelectedRange(null);
                            setEpisodeSearch("");
                          }}
                          className={cn(
                            "px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                            selectedSeason === s.season_number ? "bg-brand-cyan text-black" : "bg-bg-surface text-text-muted hover:bg-brand-cyan hover:text-black border border-border-subtle"
                          )}
                        >
                          Season {s.season_number}
                        </button>
                      ))}
                    </div>

                    {/* Episode Filter & Search */}
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                      <div className="flex-1 w-full relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
                        <input 
                          type="text"
                          placeholder="Jump to episode..."
                          value={episodeSearch}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEpisodeSearch(val);
                            if (val) setSelectedRange(null);
                          }}
                          className="w-full bg-bg-surface border border-border-subtle rounded-xl py-2 pl-9 pr-4 text-xs text-text-main focus:outline-none focus:border-brand-cyan/50 transition-all"
                        />
                        {episodeSearch && (
                          <button 
                            onClick={() => setEpisodeSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-brand-cyan transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      
                      {episodes.length > 50 && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 w-full sm:w-auto">
                          {Array.from({ length: Math.ceil(episodes.length / 100) }).map((_, idx) => {
                            const start = idx * 100 + 1;
                            const end = Math.min((idx + 1) * 100, episodes.length);
                            const isActive = selectedRange?.[0] === start;
                            return (
                              <button 
                                key={`range-${start}-${end}`}
                                onClick={() => {
                                  setSelectedRange([start, end]);
                                  setEpisodeSearch("");
                                }}
                                className={cn(
                                  "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap border transition-all",
                                  isActive ? "bg-brand-cyan text-black border-brand-cyan" : "bg-bg-surface/50 text-text-muted border-border-subtle hover:border-brand-cyan/40"
                                )}
                              >
                                {start}-{end}
                              </button>
                            );
                          })}
                          {selectedRange && (
                            <button 
                              onClick={() => setSelectedRange(null)}
                              className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-brand-red/10 text-brand-red border border-brand-red/20"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
                      {episodes.length > 0 ? episodes.filter(ep => {
                        if (episodeSearch) {
                          return ep.episode_number.toString() === episodeSearch || ep.name.toLowerCase().includes(episodeSearch.toLowerCase());
                        }
                        if (selectedRange) {
                          return ep.episode_number >= selectedRange[0] && ep.episode_number <= selectedRange[1];
                        }
                        // Default: show first 50 episodes if too many, unless focused on current playing
                        if (episodes.length > 50 && !selectedRange && !episodeSearch) {
                           // If playing an episode outside the first 50, we might want to show that range
                           if (info.season === selectedSeason && info.episode && info.episode > 50) {
                              const currentGroup = Math.floor((info.episode - 1) / 50) * 50;
                              return ep.episode_number > currentGroup && ep.episode_number <= currentGroup + 50;
                           }
                           return ep.episode_number <= 50;
                        }
                        return true;
                      }).map((ep: any, i: number) => (
                        <div 
                          key={`ep-${selectedSeason}-${ep.episode_number}-${i}`}
                          onClick={() => playEpisode(ep.episode_number)}
                          className={cn(
                            "flex-none w-56 group cursor-pointer transition-all",
                            info.season === selectedSeason && info.episode === ep.episode_number ? "opacity-100" : "opacity-60 hover:opacity-100"
                          )}
                        >
                          <div className="aspect-video rounded-xl overflow-hidden relative bg-bg-surface border border-border-subtle mb-2">
                            <img 
                              src={ep.still_path || (item.backdrop_path || item.poster_path)} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className={cn(
                              "absolute inset-0 flex items-center justify-center bg-black/40",
                              info.season === selectedSeason && info.episode === ep.episode_number ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity"
                            )}>
                              <div className="w-10 h-10 bg-brand-cyan text-black rounded-full flex items-center justify-center shadow-lg">
                                <Play fill="currentColor" size={20} />
                              </div>
                            </div>
                            <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/80 backdrop-blur-md rounded text-[9px] font-black tracking-widest text-white border border-white/10 uppercase">
                              Episode {ep.episode_number}
                            </div>
                            {info.season === selectedSeason && info.episode === ep.episode_number && (
                              <div className="absolute top-2 left-2 px-2 py-1 bg-brand-cyan text-black rounded text-[8px] font-black uppercase tracking-tighter shadow-glow">
                                Now Playing
                              </div>
                            )}
                          </div>
                          <div className="px-1">
                            <h4 className="text-xs font-bold text-text-main truncate">{ep.name}</h4>
                            {ep.plot && <p className="text-[9px] text-text-muted line-clamp-2 mt-1 leading-tight">{ep.plot}</p>}
                            <span className="text-[9px] text-text-muted mt-1 block">{ep.air_date || "Coming Soon"}</span>
                          </div>
                        </div>
                      )) : (
                        Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="flex-none w-56 animate-pulse">
                            <div className="aspect-video rounded-xl bg-bg-surface mb-2 border border-border-subtle" />
                            <div className="h-3 w-32 bg-bg-surface rounded mb-1" />
                            <div className="h-2 w-16 bg-bg-surface rounded" />
                          </div>
                        ))
                      )}
                    </div>
                    
                    <CommentPreviewSection comments={comments} onExpand={() => setShowAllComments(true)} userName={userName} />
                  </div>
                )}

                {/* Similar Content */}
                {details?.similar && (
                  <div className="space-y-4">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-text-muted">You Might Also Like</h2>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {details.similar.map((sim: any, i: number) => (
                        <div 
                          key={`player-sim-${sim.id}-${i}`}
                          onClick={() => {
                            onClose();
                            setSelectedItem(sim);
                          }}
                          className="group cursor-pointer"
                        >
                          <div className="aspect-[2/3] rounded-lg overflow-hidden bg-bg-surface relative border border-border-subtle">
                            <img src={sim.poster_path} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                            <div className="absolute top-1 right-1 px-1 py-0.5 bg-black/60 backdrop-blur-md text-brand-cyan text-[8px] font-bold rounded">
                              ★ {sim.vote_average.toFixed(1)}
                            </div>
                          </div>
                          <h4 className="text-[9px] font-bold text-text-muted mt-1.5 truncate group-hover:text-text-main">{sim.title}</h4>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
            
            <div className="h-20" />
          </div>
        </div>
      </motion.div>
    );
  };

  const genres = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mystery", "Romance", "Sci-Fi", "Thriller"];

  const GENRE_MAPS = {
    TMDB_MOVIE: { "Action": 28, "Adventure": 12, "Comedy": 35, "Drama": 18, "Fantasy": 14, "Horror": 27, "Mystery": 9648, "Romance": 10749, "Sci-Fi": 878, "Thriller": 53 },
    TMDB_TV: { "Action": 10759, "Adventure": 10759, "Comedy": 35, "Drama": 18, "Fantasy": 10765, "Horror": 27, "Mystery": 9648, "Romance": 10749, "Sci-Fi": 10765, "Thriller": 53 },
    ANIME: { "Action": 1, "Adventure": 2, "Comedy": 4, "Drama": 8, "Fantasy": 10, "Horror": 14, "Mystery": 7, "Romance": 22, "Sci-Fi": 24, "Thriller": 41 }
  };

  useEffect(() => {
    const savedName = localStorage.getItem('streaming_userName');
    if (!savedName) {
      setShowOnboarding(true);
    } else {
      setUserName(savedName);
      // Ensure userId exists for legacy users
      if (!localStorage.getItem('streaming_userId')) {
        localStorage.setItem('streaming_userId', Math.random().toString(36).substring(7));
      }
    }

    const savedCollection = localStorage.getItem('watchable_collection');
    if (savedCollection) setWatchlist(JSON.parse(savedCollection));

    const savedHistory = localStorage.getItem('watchable_history');
    if (savedHistory) setWatchHistory(JSON.parse(savedHistory));

    const savedTheme = localStorage.getItem('watchable_theme');
    if (savedTheme) {
      const isDark = savedTheme === 'dark';
      setIsDarkMode(isDark);
      document.documentElement.classList.toggle('light', !isDark);
    } else {
      document.documentElement.classList.remove('light');
    }

    fetchAllContent();
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    localStorage.setItem('watchable_theme', nextDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('light', !nextDark);
  };

  const toggleCollection = (item: MediaItem) => {
    setWatchlist(prev => {
      const isCollected = prev.find(i => i.id === item.id);
      let next;
      if (isCollected) {
        next = prev.filter(i => i.id !== item.id);
      } else {
        next = [item, ...prev];
      }
      localStorage.setItem('watchable_collection', JSON.stringify(next));
      return next;
    });
  };

  const addToHistory = (item: MediaItem) => {
    setWatchHistory(prev => {
      const filtered = prev.filter(i => i.id !== item.id);
      const next = [item, ...filtered].slice(0, 40); // Limit to 40 items
      localStorage.setItem('watchable_history', JSON.stringify(next));
      return next;
    });
  };

  const fetchTopRatedAnime = async () => {
    try {
      const data = await apiFetch(`${JIKAN_BASE_URL}/top/anime?limit=20&sfw=true`);
      if (data?.data) {
        const formatted = data.data.map((item: any) => ({
          id: item.mal_id,
          title: item.title_english || item.title || "Untitled",
          poster_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/500x750?text=No+Poster',
          backdrop_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/1280x720?text=No+Backdrop',
          vote_average: item.score || 0,
          type: 'Anime' as const,
          source: 'jikan' as const
        }));
        setTopRatedAnime(formatted);
      }
    } catch (error) {
      console.error("Top Rated Anime fetch error", error);
    }
  };

  const fetchAllContent = async () => {
    try {
      setLoading(true);
      await fetchHomeContent();
      await fetchPopularAnimeContent();
      await fetchTopRatedAnime();
      await new Promise(resolve => setTimeout(resolve, 500)); // Stagger to avoid Jikan rate limit
      await fetchMovieContent();
      await new Promise(resolve => setTimeout(resolve, 500)); // Stagger to avoid Jikan rate limit
      await fetchTvContent();
    } catch (error) {
      console.error("Content fetch error", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPopularAnimeContent = async () => {
    try {
      const data = await apiFetch(`${JIKAN_BASE_URL}/anime?order_by=popularity&limit=20`);
      if (data?.data) {
        const formatted = data.data.map((item: any) => ({
          id: item.mal_id,
          title: item.title_english || item.title || "Untitled",
          poster_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/500x750?text=No+Poster',
          backdrop_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/1280x720?text=No+Backdrop',
          vote_average: item.score || 0,
          type: 'Anime' as const,
          source: 'jikan' as const
        }));
        setPopularAnime(formatted);
      }
    } catch (error) {
      console.error("Popular Anime fetch error", error);
    }
  };

  const fetchHomeContent = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${TMDB_TOKEN}` };

      const [moviesData, tvData, popularData, animeData] = await Promise.all([
        apiFetch(`${TMDB_BASE_URL}/trending/movie/day?page=1`, { headers }),
        apiFetch(`${TMDB_BASE_URL}/trending/tv/day?page=1`, { headers }),
        apiFetch(`${TMDB_BASE_URL}/movie/popular?page=1`, { headers }),
        apiFetch(`${JIKAN_BASE_URL}/seasons/now?limit=25&sfw=true`)
      ]);

      // Fetch second page for TMDB items to have more content for "View All"
      const [moviesData2, tvData2, popularData2] = await Promise.all([
        apiFetch(`${TMDB_BASE_URL}/trending/movie/day?page=2`, { headers }),
        apiFetch(`${TMDB_BASE_URL}/trending/tv/day?page=2`, { headers }),
        apiFetch(`${TMDB_BASE_URL}/movie/popular?page=2`, { headers }),
      ]);

      const formatTMDB = (item: any, type: 'Movie' | 'TV Show'): MediaItem => ({
        id: item.id,
        title: item.title || item.name || "Untitled",
        poster_path: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster',
        backdrop_path: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : (item.poster_path ? `https://image.tmdb.org/t/p/original${item.poster_path}` : 'https://via.placeholder.com/1280x720?text=No+Backdrop'),
        vote_average: item.vote_average || 0,
        type,
        source: 'tmdb'
      });

      const formatAnime = (item: any): MediaItem => ({
        id: item.mal_id,
        title: item.title_english || item.title || "Untitled",
        poster_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/500x750?text=No+Poster',
        backdrop_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/1280x720?text=No+Backdrop',
        vote_average: item.score || 0,
        type: 'Anime',
        source: 'jikan'
      });

      const formattedMovies = [
        ...(moviesData?.results || []), 
        ...(moviesData2?.results || [])
      ].map((i: any) => formatTMDB(i, 'Movie'));

      const formattedTv = [
        ...(tvData?.results || []), 
        ...(tvData2?.results || [])
      ].map((i: any) => formatTMDB(i, 'TV Show'));

      const formattedAnime = animeData?.data?.map(formatAnime) || [];
      
      const formattedPopular = [
        ...(popularData?.results || []), 
        ...(popularData2?.results || [])
      ].map((i: any) => formatTMDB(i, 'Movie'));

      setTrendingMovies(formattedMovies);
      setTrendingTv(formattedTv);
      setLatestAnime(formattedAnime);
      setPopular(formattedPopular);

      const mix = [...formattedMovies.slice(0, 5), ...formattedTv.slice(0, 5), ...formattedAnime.slice(0, 5)].sort(() => Math.random() - 0.5);
      setSlideshowItems(mix);
    } catch (error) {
      console.error("Home fetch error", error);
    }
  };

  const fetchMovieContent = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${TMDB_TOKEN}` };

      const [latestData, popData, topData] = await Promise.all([
        apiFetch(`${TMDB_BASE_URL}/movie/now_playing?page=1`, { headers }),
        apiFetch(`${TMDB_BASE_URL}/movie/popular?page=1`, { headers }),
        apiFetch(`${TMDB_BASE_URL}/movie/top_rated?page=1`, { headers }),
      ]);

      const [latestData2, popData2, topData2] = await Promise.all([
        apiFetch(`${TMDB_BASE_URL}/movie/now_playing?page=2`, { headers }),
        apiFetch(`${TMDB_BASE_URL}/movie/popular?page=2`, { headers }),
        apiFetch(`${TMDB_BASE_URL}/movie/top_rated?page=2`, { headers }),
      ]);

      // Anime Movies
      const animeMoviesData = await apiFetch(`${JIKAN_BASE_URL}/anime?type=movie&limit=25&order_by=start_date&sort=desc&sfw=true`);

      const formatMovie = (item: any): MediaItem => ({
        id: item.id,
        title: item.title || item.name || "Untitled",
        poster_path: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster',
        backdrop_path: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : (item.poster_path ? `https://image.tmdb.org/t/p/original${item.poster_path}` : 'https://via.placeholder.com/1280x720?text=No+Backdrop'),
        vote_average: item.vote_average || 0,
        type: 'Movie',
        source: 'tmdb'
      });

      const formatAnimeMovie = (item: any): MediaItem => ({
        id: item.mal_id,
        title: item.title_english || item.title || "Untitled",
        poster_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/500x750?text=No+Poster',
        backdrop_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/1280x720?text=No+Backdrop',
        vote_average: item.score || 0,
        type: 'Anime',
        source: 'jikan'
      });

      const tmdbLatest = [...(latestData?.results || []), ...(latestData2?.results || [])].map(formatMovie);
      const tmdbPop = [...(popData?.results || []), ...(popData2?.results || [])].map(formatMovie);
      const tmdbTop = [...(topData?.results || []), ...(topData2?.results || [])].map(formatMovie);
      const animeLatest = animeMoviesData?.data?.map(formatAnimeMovie) || [];

      setLatestAnimeMovies(animeLatest);
      setPopularMovies(tmdbPop);
      setTopRatedMovies([...tmdbTop, ...animeLatest].sort((a, b) => b.vote_average - a.vote_average));

      // Movie Slideshow (15 total)
      const movieMix = [...tmdbLatest.slice(0, 8), ...animeLatest.slice(0, 7)].sort(() => Math.random() - 0.5).slice(0, 15);
      setMovieSlideshow(movieMix);

      // Genre specific results for Movies
      const genreMapping: { [key: string]: number } = { "Action": 28, "Adventure": 12, "Comedy": 35, "Sci-Fi": 878, "Horror": 27 };
      const genreData: { [key: string]: MediaItem[] } = {};
      
      for (const [name, id] of Object.entries(genreMapping)) {
        try {
          const [data1, data2] = await Promise.all([
            apiFetch(`${TMDB_BASE_URL}/discover/movie?with_genres=${id}&page=1`, { headers }),
            apiFetch(`${TMDB_BASE_URL}/discover/movie?with_genres=${id}&page=2`, { headers }),
          ]);
          const results = [...(data1?.results || []), ...(data2?.results || [])];
          genreData[name] = results.map(formatMovie);
        } catch(e) {}
      }
      setGenreResults(genreData);

    } catch (error) {
      console.error("Movie fetch error", error);
    }
  };

  const fetchTvContent = async () => {
    try {
      const headers = { 'Authorization': `Bearer ${TMDB_TOKEN}` };

      const [popData, topData] = await Promise.all([
        apiFetch(`${TMDB_BASE_URL}/tv/popular?page=1`, { headers }),
        apiFetch(`${TMDB_BASE_URL}/tv/top_rated?page=1`, { headers }),
      ]);

      const [popData2, topData2] = await Promise.all([
        apiFetch(`${TMDB_BASE_URL}/tv/popular?page=2`, { headers }),
        apiFetch(`${TMDB_BASE_URL}/tv/top_rated?page=2`, { headers }),
      ]);

      const formatTv = (item: any): MediaItem => ({
        id: item.id,
        title: item.name || item.title || "Untitled",
        poster_path: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster',
        backdrop_path: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : (item.poster_path ? `https://image.tmdb.org/t/p/original${item.poster_path}` : 'https://via.placeholder.com/1280x720?text=No+Backdrop'),
        vote_average: item.vote_average || 0,
        type: 'TV Show',
        source: 'tmdb'
      });

      const formatAnime = (item: any): MediaItem => ({
        id: item.mal_id,
        title: item.title_english || item.title || "Untitled",
        poster_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/500x750?text=No+Poster',
        backdrop_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/1280x720?text=No+Backdrop',
        vote_average: item.score || 0,
        type: 'Anime',
        source: 'jikan'
      });

      const tmdbPop = [...(Array.isArray(popData.results) ? popData.results : []), ...(Array.isArray(popData2.results) ? popData2.results : [])].map(formatTv);
      const tmdbTop = [...(Array.isArray(topData.results) ? topData.results : []), ...(Array.isArray(topData2.results) ? topData2.results : [])].map(formatTv);
      
      setPopularTv(tmdbPop);
      setTopRatedTv(tmdbTop);

      // Fetch sample anime for TV slideshow specifically to avoid stale state issues
      const animeData = await apiFetch(`${JIKAN_BASE_URL}/anime?type=tv&status=airing&order_by=start_date&sort=desc&limit=25&sfw=true`);
      const animeTv = animeData?.data?.map(formatAnime) || [];

      setLatestAnimeSeries(animeTv);

      // Slideshow for TV
      const tvMix = [...tmdbPop.slice(0, 7), ...animeTv.slice(0, 8)].sort(() => Math.random() - 0.5).slice(0, 15);
      setTvSlideshow(tvMix);

       // Genre specific results for TV
       const genreMapping: { [key: string]: number } = { "Action": 10759, "Comedy": 35, "Drama": 18, "Sci-Fi": 10765, "Mystery": 9648 };
       const genreData: { [key: string]: MediaItem[] } = {};

       for (const [name, id] of Object.entries(genreMapping)) {
         try {
           const [data1, data2] = await Promise.all([
             apiFetch(`${TMDB_BASE_URL}/discover/tv?with_genres=${id}&page=1`, { headers }),
             apiFetch(`${TMDB_BASE_URL}/discover/tv?with_genres=${id}&page=2`, { headers }),
           ]);
           const results = [...(data1?.results || []), ...(data2?.results || [])];
           genreData[name] = results.map(formatTv);
         } catch(e) {}
       }
       setTvGenreResults(genreData);

    } catch (error) {
      console.error("TV fetch error", error);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const headers = { 'Authorization': `Bearer ${TMDB_TOKEN}` };
      
      // TMDB Multi Search (Movies & TV)
      const tmdbPromise = apiFetch(`${TMDB_BASE_URL}/search/multi?query=${encodeURIComponent(query)}`, { headers });

      // Jikan Anime Search
      const jikanPromise = apiFetch(`${JIKAN_BASE_URL}/anime?q=${encodeURIComponent(query)}&limit=20`);

      const [tmdbData, jikanData] = await Promise.all([tmdbPromise, jikanPromise]);

      const tmdbResults = (tmdbData?.results || [])
        .filter((i: any) => i.media_type === 'movie' || i.media_type === 'tv')
        .map((item: any) => ({
          id: item.id,
          title: item.title || item.name || "Untitled",
          poster_path: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster',
          backdrop_path: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : 'https://via.placeholder.com/1280x720?text=No+Backdrop',
          vote_average: item.vote_average || 0,
          type: item.media_type === 'movie' ? 'Movie' : 'TV Show',
          source: 'tmdb' as const
        }));

      const jikanResults = (jikanData.data || [])
        .map((item: any) => ({
          id: item.mal_id,
          title: item.title_english || item.title || "Untitled",
          poster_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/500x750?text=No+Poster',
          backdrop_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/1280x720?text=No+Backdrop',
          vote_average: item.score || 0,
          type: 'Anime' as const,
          source: 'jikan' as const
        }));

      setSearchResults([...tmdbResults, ...jikanResults]);
    } catch (error) {
      console.error("Search error", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleGenreClick = (genre: string) => {
    setGenreView({ genre, type: 'All', items: [], page: 1, totalLoaded: 0 });
    fetchGenreData(genre, 'All', 1);
  };

  const fetchGenreData = async (genre: string, type: 'All' | 'Movie' | 'TV Show' | 'Anime', page: number = 1) => {
    try {
      const headers = { 'Authorization': `Bearer ${TMDB_TOKEN}` };
      let results: MediaItem[] = [];

      const formatTMDB = (item: any, t: 'Movie' | 'TV Show'): MediaItem => ({
        id: item.id,
        title: item.title || item.name || "Untitled",
        poster_path: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster',
        backdrop_path: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : (item.poster_path ? `https://image.tmdb.org/t/p/original${item.poster_path}` : 'https://via.placeholder.com/1280x720?text=No+Backdrop'),
        vote_average: item.vote_average || 0,
        type: t
      });

      const formatAnime = (item: any): MediaItem => ({
        id: item.mal_id,
        title: item.title_english || item.title || "Untitled",
        poster_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/500x750?text=No+Poster',
        backdrop_path: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/1280x720?text=No+Backdrop',
        vote_average: item.score || 0,
        type: 'Anime'
      });

      const tmdbMovieGenre = (GENRE_MAPS.TMDB_MOVIE as any)[genre];
      const tmdbTvGenre = (GENRE_MAPS.TMDB_TV as any)[genre];
      const animeGenre = (GENRE_MAPS.ANIME as any)[genre];

      if (type === 'All' || type === 'Movie') {
        if (tmdbMovieGenre) {
          const data = await apiFetch(`${TMDB_BASE_URL}/discover/movie?with_genres=${tmdbMovieGenre}&page=${page}`, { headers });
          if (data?.results) results = [...results, ...data.results.map((i: any) => formatTMDB(i, 'Movie'))];
        }
      }

      if (type === 'All' || type === 'TV Show') {
        if (tmdbTvGenre) {
          const data = await apiFetch(`${TMDB_BASE_URL}/discover/tv?with_genres=${tmdbTvGenre}&page=${page}`, { headers });
          if (data?.results) results = [...results, ...data.results.map((i: any) => formatTMDB(i, 'TV Show'))];
        }
      }

      if (type === 'All' || type === 'Anime') {
        if (animeGenre) {
          const data = await apiFetch(`${JIKAN_BASE_URL}/anime?genres=${animeGenre}&page=${page}&limit=20&sfw=true`);
          if (data?.data) results = [...results, ...data.data.map(formatAnime)];
        }
      }

      const uniqueResults = results.filter((v, i, a) => a.findIndex(t => t.id === v.id && t.type === v.type) === i);

      setGenreView(prev => {
        const currentItems = page === 1 ? [] : (prev?.items || []);
        const newItems = [...currentItems, ...uniqueResults];
        return {
          genre,
          type,
          page,
          items: newItems,
          totalLoaded: newItems.length
        };
      });
    } catch (error) {
      console.error("Genre fetch error", error);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-deep text-text-main pb-24 font-sans selection:bg-brand-cyan/30">
      {/* Header Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 px-5 py-4 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent">
        <div className="flex items-center gap-2">
          <div className="text-brand-cyan font-extrabold text-xl tracking-tight">Watchable</div>
        </div>
        <button 
          onClick={() => setIsSearchOpen(true)}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
        >
          <div className="w-6 h-6 border-2 border-brand-cyan rounded-full relative after:content-[''] after:absolute after:w-2 after:h-0.5 after:bg-brand-cyan after:rotate-45 after:-bottom-1 after:-right-1 cursor-pointer" />
        </button>
      </header>

      {/* Search Overlay */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 bg-bg-deep z-[100] flex flex-col"
          >
            <div className="h-16 flex items-center gap-3 px-5 border-b border-zinc-800">
              <button 
                onClick={() => {
                  setIsSearchOpen(false);
                  setSearchQuery("");
                  setSearchResults([]);
                }} 
                className="text-zinc-400 p-2 -ml-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <div className="flex-1 relative">
                <input 
                  autoFocus
                  type="text" 
                  placeholder="Search movies, tv, anime..."
                  className="w-full bg-zinc-900/50 border-none rounded-full px-5 py-2 text-sm focus:ring-1 focus:ring-brand-cyan outline-none"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                />
                {isSearching && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-brand-cyan border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 pb-24">
              {searchResults.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {searchResults.map((item, idx) => (
                    <motion.div 
                      key={`${item.type}-${item.id}-${idx}`}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="group cursor-pointer"
                      onClick={() => {
                        setSelectedItem(item);
                        setIsSearchOpen(false);
                      }}
                    >
                      <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-2">
                        <img src={item.poster_path} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                        <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-brand-cyan text-black text-[10px] font-bold rounded">
                          ★ {item.vote_average.toFixed(1)}
                        </div>
                        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[8px] rounded uppercase">
                          {item.type}
                        </div>
                      </div>
                      <h3 className="text-[11px] font-medium line-clamp-1 group-hover:text-brand-cyan transition-colors">{item.title}</h3>
                    </motion.div>
                  ))}
                </div>
              ) : searchQuery.length > 1 && !isSearching ? (
                <div className="flex flex-col items-center justify-center h-[50vh] text-zinc-500">
                  <p className="text-sm">No results found for "{searchQuery}"</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[50vh] text-zinc-500 text-center gap-2">
                  <div className="w-16 h-16 border-2 border-dashed border-zinc-700 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  </div>
                  <p className="text-sm">Search across movies, TV shows and anime</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {viewAllSection && (
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="fixed inset-0 bg-bg-deep z-[150] flex flex-col"
          >
            <div className="h-16 flex items-center gap-3 px-5 border-b border-zinc-800 bg-bg-surface/80 backdrop-blur-md sticky top-0">
              <button 
                onClick={() => {
                  setViewAllSection(null);
                  setViewAllVisibleCount(20);
                }} 
                className="text-zinc-400 p-2 -ml-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h1 className="text-lg font-bold text-text-main line-clamp-1">{viewAllSection.title}</h1>
            </div>

            <div className="flex-1 overflow-y-auto p-5 pb-24">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {viewAllSection.items.slice(0, viewAllVisibleCount).map((item, idx) => (
                  <motion.div 
                    key={`${item.type}-${item.id}-${idx}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: Math.min(idx * 0.05, 1) }}
                    className="group cursor-pointer"
                    onClick={() => setSelectedItem(item)}
                  >
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-2">
                      <img src={item.poster_path} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-brand-cyan text-black text-[10px] font-bold rounded">
                        ★ {item.vote_average.toFixed(1)}
                      </div>
                      <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[8px] rounded uppercase">
                        {item.type}
                      </div>
                    </div>
                    <h3 className="text-[11px] font-medium line-clamp-2 group-hover:text-brand-cyan transition-colors">{item.title}</h3>
                  </motion.div>
                ))}
              </div>

              {viewAllVisibleCount < viewAllSection.items.length && (
                <div className="mt-8 flex justify-center">
                  <button 
                    onClick={() => setViewAllVisibleCount(prev => prev + 10)}
                    className="px-8 py-3 bg-brand-cyan text-black font-bold rounded-full text-sm hover:scale-105 transition-transform shadow-lg shadow-brand-cyan/20 active:scale-95"
                  >
                    Show More
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {genreView && (
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="fixed inset-0 bg-bg-deep z-[140] flex flex-col"
          >
            <div className="h-16 flex items-center gap-3 px-5 border-b border-zinc-800 bg-bg-surface/80 backdrop-blur-md sticky top-0">
              <button 
                onClick={() => setGenreView(null)} 
                className="text-zinc-400 p-2 -ml-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <h1 className="text-lg font-bold text-text-main uppercase tracking-wider">Shows by Genre</h1>
            </div>

            {/* Genre Selector */}
            <div className="py-4 px-5 border-b border-zinc-900 overflow-x-auto no-scrollbar flex gap-2">
              {genres.map(g => (
                <button 
                  key={g}
                  onClick={() => handleGenreClick(g)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs transition-all whitespace-nowrap border",
                    genreView.genre === g ? "bg-brand-cyan text-black border-brand-cyan" : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-brand-cyan/50"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Type Selector */}
            <div className="flex px-5 py-3 gap-2 border-b border-zinc-900 bg-black/20">
              {(['All', 'Movie', 'TV Show', 'Anime'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setGenreView(prev => prev ? { ...prev, type, items: [], page: 1, totalLoaded: 0 } : null);
                    fetchGenreData(genreView.genre, type, 1);
                  }}
                  className={cn(
                    "px-4 py-1 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all",
                    genreView.type === type ? "text-brand-cyan border-b-2 border-brand-cyan" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-5 pb-24">
              <h2 className="text-xl font-bold text-text-main mb-6 uppercase tracking-widest">{genreView.genre} Content</h2>
              
              {genreView.items.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {genreView.items.map((item, idx) => (
                      <motion.div 
                        key={`${item.type}-${item.id}-${idx}`}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="group cursor-pointer"
                        onClick={() => setSelectedItem(item)}
                      >
                        <div className="relative aspect-[2/3] rounded-xl overflow-hidden mb-2">
                          <img src={item.poster_path} alt={item.title} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-brand-cyan text-black text-[10px] font-bold rounded">
                            ★ {item.vote_average.toFixed(1)}
                          </div>
                          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm text-white text-[8px] rounded uppercase">
                            {item.type}
                          </div>
                        </div>
                        <h3 className="text-[11px] font-medium line-clamp-2 group-hover:text-brand-cyan transition-colors">{item.title}</h3>
                      </motion.div>
                    ))}
                  </div>
                  
                  <div className="mt-8 flex justify-center">
                    <button 
                      onClick={() => fetchGenreData(genreView.genre, genreView.type, genreView.page + 1)}
                      className="px-8 py-3 bg-brand-cyan text-black font-bold rounded-full text-sm hover:scale-105 transition-transform shadow-lg shadow-brand-cyan/20 active:scale-95 text-center"
                    >
                      Show More
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center h-[50vh] text-zinc-500">
                  <div className="w-12 h-12 border-4 border-brand-cyan border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-sm tracking-wider">Loading amazing titles...</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Details Overlay */}
      <DetailsOverlay 
        item={selectedItem} 
        onClose={() => setSelectedItem(null)} 
        setSelectedItem={setSelectedItem}
        setPlayingInfo={(info) => {
          if (info) addToHistory(info.item);
          setPlayingInfo(info);
        }}
        watchlist={watchlist}
        onToggleCollection={toggleCollection}
        userName={userName}
      />

      {/* Player Overlay */}
      <AnimatePresence>
        {playingInfo && (
          <PlayerScreen 
            info={playingInfo} 
            onClose={() => setPlayingInfo(null)}
            userName={userName}
          />
        )}
      </AnimatePresence>

      {/* Onboarding Overlay */}
      <AnimatePresence>
        {showOnboarding && <WelcomeOverlay userName={userName} setUserName={setUserName} setShowOnboarding={setShowOnboarding} />}
      </AnimatePresence>

      {/* Content Rendering Logic */}
      <main className="bg-bg-surface">
        <AnimatePresence mode="wait">
          {activeTab === 'All' ? (
            <motion.div
              key="all-view"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
            >
              {/* All / Home Slideshow */}
              <section className="relative h-[260px] md:h-[400px]">
                <Swiper modules={[Autoplay, Pagination]} autoplay={{ delay: 5000 }} pagination={{ clickable: true }} className="h-full w-full">
                  {slideshowItems.map((item, index) => (
                    <SwiperSlide 
                      key={`slide-all-${item.id}-${index}`} 
                      className="relative h-full w-full cursor-pointer"
                      onClick={() => setSelectedItem(item)}
                    >
                      <div className="absolute inset-0">
                        <img src={item.backdrop_path || item.poster_path} alt={item.title} className="w-full h-full object-cover opacity-60" />
                        <div className="absolute inset-0 bg-gradient-to-t from-bg-surface via-transparent to-transparent" />
                      </div>
                      <div className="absolute bottom-10 left-5 right-5">
                        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                          <span className="px-1.5 py-0.5 bg-brand-cyan text-black text-[10px] font-bold rounded uppercase mb-1 inline-block">{item.type}</span>
                          <h1 className="text-xl md:text-3xl font-bold leading-tight mb-1">{item.title}</h1>
                          <div className="text-[11px] opacity-80 flex items-center gap-2">
                            <span>{item.type}</span>
                            <span>•</span>
                            <span className="text-brand-cyan">★ {item.vote_average.toFixed(1)}</span>
                          </div>
                        </motion.div>
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              </section>

              {/* Genre Selection */}
              <section className="py-4 pl-5">
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  {genres.map((genre) => (
                    <button 
                      key={genre} 
                      onClick={() => handleGenreClick(genre)}
                      className="px-4 py-1.5 border border-brand-cyan/30 rounded-full text-xs text-brand-cyan whitespace-nowrap bg-brand-cyan/5 hover:bg-brand-cyan hover:text-black transition-all"
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </section>
              
              <MediaRow onItemClick={setSelectedItem} title="Latest Anime" items={latestAnime} onViewAll={() => setViewAllSection({ title: "Latest Anime", items: latestAnime })} />
              <MediaRow onItemClick={setSelectedItem} title="Trending Movies" items={trendingMovies} onViewAll={() => setViewAllSection({ title: "Trending Movies", items: trendingMovies })} />
              <MediaRow onItemClick={setSelectedItem} title="Trending TV Shows" items={trendingTv} onViewAll={() => setViewAllSection({ title: "Trending TV Shows", items: trendingTv })} />
              <MediaRow onItemClick={setSelectedItem} title="Popular" items={popular} onViewAll={() => setViewAllSection({ title: "Popular", items: popular })} />
              <MediaRow onItemClick={setSelectedItem} title="All Time Popular Anime" items={popularAnime} onViewAll={() => setViewAllSection({ title: "All Time Popular Anime", items: popularAnime })} />
              <MediaRow onItemClick={setSelectedItem} title="Top Rated Movies" items={topRatedMovies} onViewAll={() => setViewAllSection({ title: "Top Rated Movies", items: topRatedMovies })} />
              <MediaRow onItemClick={setSelectedItem} title="Top Rated TV Shows" items={topRatedTv} onViewAll={() => setViewAllSection({ title: "Top Rated TV Shows", items: topRatedTv })} />
              <MediaRow onItemClick={setSelectedItem} title="Top Rated Anime" items={topRatedAnime} onViewAll={() => setViewAllSection({ title: "Top Rated Anime", items: topRatedAnime })} />
              <SearchPrompt />
            </motion.div>
          ) : activeTab === 'Movies' ? (
            <motion.div
              key="movies-view"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="pt-16"
            >
              <div className="px-5 mb-4">
                <h1 className="text-2xl font-bold text-brand-cyan">Movies</h1>
              </div>

              {/* Genre Selection */}
              <section className="py-4 pl-5">
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  {genres.map((genre) => (
                    <button 
                      key={genre} 
                      onClick={() => handleGenreClick(genre)}
                      className="px-4 py-1.5 border border-brand-cyan/30 rounded-full text-xs text-brand-cyan whitespace-nowrap bg-brand-cyan/5 hover:bg-brand-cyan hover:text-black transition-all"
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </section>

              {/* Movie Slideshow */}
              <section className="relative h-[260px] md:h-[400px]">
                <Swiper modules={[Autoplay, Pagination]} autoplay={{ delay: 5000 }} pagination={{ clickable: true }} className="h-full w-full">
                  {movieSlideshow.map((item, index) => (
                    <SwiperSlide 
                      key={`slide-movie-${item.id}-${index}`} 
                      className="relative h-full w-full cursor-pointer"
                      onClick={() => setSelectedItem(item)}
                    >
                      <div className="absolute inset-0">
                        <img src={item.backdrop_path || item.poster_path} alt={item.title} className="w-full h-full object-cover opacity-60" />
                        <div className="absolute inset-0 bg-gradient-to-t from-bg-surface via-transparent to-transparent" />
                      </div>
                      <div className="absolute bottom-10 left-5 right-5">
                        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                          <span className="px-1.5 py-0.5 bg-brand-cyan text-black text-[10px] font-bold rounded uppercase mb-1 inline-block">{item.type}</span>
                          <h1 className="text-xl md:text-3xl font-bold leading-tight mb-1">{item.title}</h1>
                        </motion.div>
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              </section>

              {/* Movie Rows */}
              <MediaRow onItemClick={setSelectedItem} title="Trending Movies" items={trendingMovies} onViewAll={() => setViewAllSection({ title: "Trending Movies", items: trendingMovies })} />
              <MediaRow onItemClick={setSelectedItem} title="Latest Anime Movies" items={latestAnimeMovies} onViewAll={() => setViewAllSection({ title: "Latest Anime Movies", items: latestAnimeMovies })} />
              <MediaRow onItemClick={setSelectedItem} title="Popular Movies" items={popularMovies} onViewAll={() => setViewAllSection({ title: "Popular Movies", items: popularMovies })} />
              <MediaRow onItemClick={setSelectedItem} title="Top Rated Movies & Anime" items={topRatedMovies} onViewAll={() => setViewAllSection({ title: "Top Rated Movies & Anime", items: topRatedMovies })} />
              
              {Object.entries(genreResults).map(([genre, items]) => (
                <div key={genre}>
                  <MediaRow onItemClick={setSelectedItem} title={`${genre} Movies`} items={items as MediaItem[]} onViewAll={() => handleGenreClick(genre)} />
                </div>
              ))}
              <SearchPrompt />
            </motion.div>
          ) : activeTab === 'Tv' ? (
            <motion.div
              key="tv-view"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="pt-16"
            >
              <div className="px-5 mb-4">
                <h1 className="text-2xl font-bold text-brand-cyan">TV Shows</h1>
              </div>

              {/* Genre Selection */}
              <section className="py-4 pl-5">
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                  {genres.map((genre) => (
                    <button 
                      key={genre} 
                      onClick={() => handleGenreClick(genre)}
                      className="px-4 py-1.5 border border-brand-cyan/30 rounded-full text-xs text-brand-cyan whitespace-nowrap bg-brand-cyan/5 hover:bg-brand-cyan hover:text-black transition-all"
                    >
                      {genre}
                    </button>
                  ))}
                </div>
              </section>

              {/* TV Slideshow */}
              <section className="relative h-[260px] md:h-[400px]">
                <Swiper modules={[Autoplay, Pagination]} autoplay={{ delay: 5000 }} pagination={{ clickable: true }} className="h-full w-full">
                  {tvSlideshow.map((item, index) => (
                    <SwiperSlide 
                      key={`slide-tv-${item.id}-${index}`} 
                      className="relative h-full w-full cursor-pointer"
                      onClick={() => setSelectedItem(item)}
                    >
                      <div className="absolute inset-0">
                        <img src={item.backdrop_path || item.poster_path} alt={item.title} className="w-full h-full object-cover opacity-60" />
                        <div className="absolute inset-0 bg-gradient-to-t from-bg-surface via-transparent to-transparent" />
                      </div>
                      <div className="absolute bottom-10 left-5 right-5">
                        <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                          <span className="px-1.5 py-0.5 bg-brand-cyan text-black text-[10px] font-bold rounded uppercase mb-1 inline-block">{item.type}</span>
                          <h1 className="text-xl md:text-3xl font-bold leading-tight mb-1">{item.title}</h1>
                        </motion.div>
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              </section>

              {/* TV Rows */}
              <MediaRow onItemClick={setSelectedItem} title="Trending TV Shows" items={trendingTv} onViewAll={() => setViewAllSection({ title: "Trending TV Shows", items: trendingTv })} />
              <MediaRow onItemClick={setSelectedItem} title="Latest Anime Series" items={latestAnimeSeries} onViewAll={() => setViewAllSection({ title: "Latest Anime Series", items: latestAnimeSeries })} />
              <MediaRow onItemClick={setSelectedItem} title="Popular TV Shows" items={popularTv} onViewAll={() => setViewAllSection({ title: "Popular TV Shows", items: popularTv })} />
              <MediaRow onItemClick={setSelectedItem} title="Top Rated TV Shows" items={topRatedTv} onViewAll={() => setViewAllSection({ title: "Top Rated TV Shows", items: topRatedTv })} />
              
              {Object.entries(tvGenreResults).map(([genre, items]) => (
                <div key={`tv-${genre}`}>
                  <MediaRow onItemClick={setSelectedItem} title={`${genre} TV Shows`} items={items as MediaItem[]} onViewAll={() => handleGenreClick(genre)} />
                </div>
              ))}
              <SearchPrompt />
            </motion.div>
          ) : activeTab === 'Library' ? (
            <motion.div
              key="library-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pt-16"
            >
              <div className="px-5 mb-8">
                <h1 className="text-3xl font-black text-text-main tracking-tight">Your <span className="text-brand-cyan">Library</span></h1>
              </div>

              {watchlist.length > 0 ? (
                <MediaRow 
                  onItemClick={setSelectedItem} 
                  title="Collection" 
                  items={watchlist} 
                  onViewAll={() => setViewAllSection({ title: "Collection", items: watchlist })} 
                />
              ) : (
                <div className="px-5 mb-10 py-12 rounded-3xl bg-bg-surface/50 border-2 border-border-subtle flex flex-col items-center justify-center text-center mx-5">
                  <Bookmark className="text-text-muted/40 mb-4" size={32} />
                  <h3 className="text-text-main font-bold">Your collection is empty</h3>
                  <p className="text-text-muted text-xs mt-1">Bookmark shows to save them here.</p>
                </div>
              )}

              {watchHistory.length > 0 ? (
                <MediaRow 
                  onItemClick={setSelectedItem} 
                  title="Watch History" 
                  items={watchHistory} 
                  onViewAll={() => setViewAllSection({ title: "Watch History", items: watchHistory })} 
                />
              ) : (
                <div className="px-5 mb-10 py-12 rounded-3xl bg-bg-surface/50 border-2 border-border-subtle flex flex-col items-center justify-center text-center mx-5">
                  <History className="text-text-muted/40 mb-4" size={32} />
                  <h3 className="text-text-main font-bold">No watch history</h3>
                  <p className="text-text-muted text-xs mt-1">Watch something and it will appear here.</p>
                </div>
              )}
              <SearchPrompt />
            </motion.div>
          ) : activeTab === 'Me' ? (
            <motion.div
              key="me-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="pt-20 px-5"
            >
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-brand-cyan/10 border-2 border-brand-cyan/20 flex items-center justify-center mb-6 relative group overflow-hidden">
                   <div className="absolute inset-0 bg-brand-cyan/5 blur-xl group-hover:blur-2xl transition-all" />
                   <span className="text-4xl font-black text-brand-cyan relative">
                     {userName ? userName[0].toUpperCase() : 'U'}
                   </span>
                </div>

                <div className="text-center w-full max-w-xs">
                  {isEditingName ? (
                    <div className="space-y-4">
                      <input 
                        type="text" 
                        defaultValue={userName || ""}
                        maxLength={10}
                        autoFocus
                        onBlur={(e) => {
                          const newName = e.target.value.trim().slice(0, 10);
                          if (newName && newName !== userName) {
                            setUserName(newName);
                            localStorage.setItem('streaming_userName', newName);
                            syncUserName(newName);
                          }
                          setIsEditingName(false);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const newName = (e.target as HTMLInputElement).value.trim().slice(0, 10);
                            if (newName && newName !== userName) {
                              setUserName(newName);
                              localStorage.setItem('streaming_userName', newName);
                              syncUserName(newName);
                            }
                            setIsEditingName(false);
                          }
                        }}
                        className="w-full bg-bg-surface border-2 border-brand-cyan/50 rounded-xl px-4 py-2 text-text-main text-center font-bold focus:outline-none focus:ring-2 ring-brand-cyan/20"
                      />
                      <p className="text-[10px] text-text-muted uppercase tracking-widest">Press Enter to Save • Max 10 chars</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <h2 className="text-2xl font-black text-text-main">{userName}</h2>
                      <button 
                        onClick={() => setIsEditingName(true)}
                        className="p-1 px-2 rounded-lg bg-bg-surface border border-border-subtle text-text-muted hover:text-brand-cyan transition-colors"
                      >
                        <Edit2 size={12} />
                      </button>
                    </div>
                  )}
                  <p className="text-text-muted text-xs tracking-wide">Member since May 2026</p>
                </div>

                <div className="w-full mt-12 space-y-3">
                  <div className="p-5 rounded-2xl bg-bg-surface border border-border-subtle flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                        isDarkMode ? "bg-bg-surface text-text-muted" : "bg-brand-cyan/10 text-brand-cyan"
                      )}>
                        {isDarkMode ? <Moon size={20} /> : <Sun size={20} />}
                      </div>
                      <div>
                        <p className="text-text-main text-sm font-bold">App Appearance</p>
                        <p className="text-text-muted text-[11px]">{isDarkMode ? 'Dark Mode Active' : 'Light Mode Active'}</p>
                      </div>
                    </div>
                    <button 
                      onClick={toggleTheme}
                      className={cn(
                        "w-14 h-8 rounded-full relative transition-all duration-300 border-2",
                        isDarkMode ? "bg-bg-surface border-border-subtle" : "bg-brand-cyan border-brand-cyan/50"
                      )}
                    >
                      <motion.div 
                        animate={{ x: isDarkMode ? 4 : 28 }}
                        className={cn(
                          "w-5 h-5 rounded-full absolute top-1 shadow-lg",
                          isDarkMode ? "bg-zinc-600" : "bg-black"
                        )}
                      />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-5 rounded-2xl bg-bg-surface border border-border-subtle text-center shadow-sm">
                      <p className="text-brand-cyan text-xl font-black">{watchlist.length}</p>
                      <p className="text-text-muted text-[10px] uppercase tracking-widest mt-1">Collected</p>
                    </div>
                    <div className="p-5 rounded-2xl bg-bg-surface border border-border-subtle text-center shadow-sm">
                      <p className="text-brand-cyan text-xl font-black">{watchHistory.length}</p>
                      <p className="text-text-muted text-[10px] uppercase tracking-widest mt-1">History</p>
                    </div>
                  </div>

                  {showResetConfirm ? (
                    <div className="mt-8 space-y-3">
                      <p className="text-center text-xs text-text-muted px-4">Are you sure? All your data will be permanently deleted.</p>
                      <div className="flex gap-3">
                        <button 
                          onClick={() => {
                            localStorage.clear();
                            window.location.reload();
                          }}
                          className="flex-1 p-4 rounded-xl bg-red-500 text-white font-bold text-sm active:scale-95 transition-all"
                        >
                          Yes, Reset Everything
                        </button>
                        <button 
                          onClick={() => setShowResetConfirm(false)}
                          className="flex-1 p-4 rounded-xl bg-bg-surface border border-border-subtle text-text-main font-bold text-sm active:scale-95 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setShowResetConfirm(true)}
                      className="w-full p-5 rounded-2xl bg-red-500/5 border border-red-500/10 flex items-center justify-center gap-3 text-red-500 font-bold hover:bg-red-500/10 transition-all mt-8"
                    >
                      <LogOut size={18} />
                      Reset Application
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
                <div className="flex flex-col items-center justify-center h-[50vh] text-text-muted">
                  <span className="text-sm font-medium">{activeTab} section coming soon</span>
                </div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-bg-deep border-t border-brand-cyan/10 px-5 py-3 flex items-center justify-around safe-area-bottom">
        <NavButton label="All" active={activeTab === 'All'} onClick={() => setActiveTab('All')} />
        <NavButton label="Movies" active={activeTab === 'Movies'} onClick={() => setActiveTab('Movies')} />
        <NavButton label="Tv" active={activeTab === 'Tv'} onClick={() => setActiveTab('Tv')} />
        <NavButton label="Library" active={activeTab === 'Library'} onClick={() => setActiveTab('Library')} />
        <NavButton label="Me" active={activeTab === 'Me'} onClick={() => setActiveTab('Me')} />
      </nav>
    </div>
  );
}

function MediaRow({ title, items, onViewAll, onItemClick }: { title: string; items: MediaItem[]; onViewAll?: () => void; onItemClick?: (item: MediaItem) => void }) {
  const displayItems = items.slice(0, 10);
  return (
    <section className="mt-6 pl-5">
      <h2 className="text-sm font-semibold mb-3 flex items-center justify-between pr-5 text-text-main opacity-90">
        {title}
        <button onClick={onViewAll} className="text-brand-cyan text-[11px] font-normal cursor-pointer hover:underline outline-none">View All</button>
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
        {displayItems.map((item, index) => (
          <div 
            key={`${title}-${item.id}-${index}`} 
            className="flex-none w-[100px] group cursor-pointer"
            onClick={() => onItemClick?.(item)}
          >
            <div className="relative aspect-[100/140] rounded-lg overflow-hidden mb-1.5 bg-bg-surface border border-border-subtle">
              <img 
                src={item.poster_path} 
                alt={item.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
              />
              <div className="absolute top-1 right-1 bg-black/70 px-1 py-0.5 rounded text-[9px] text-brand-cyan">
                ★ {item.vote_average.toFixed(1)}
              </div>
            </div>
            <h3 className="text-[10px] font-medium truncate text-text-main group-hover:text-brand-cyan transition-colors">{item.title}</h3>
          </div>
        ))}
      </div>
    </section>
  );
}

function NavButton({ label, active = false, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  const getIcon = () => {
    switch(label) {
      case 'All': return <div className="w-[18px] h-[18px] border-2 border-current rounded-sm" />;
      case 'Movies': return <div className="w-[18px] h-[18px] border-2 border-current rounded-full" />;
      case 'Tv': return <div className="w-[20px] h-[14px] border-2 border-current rounded-[3px]" />;
      case 'Library': return <div className="w-[14px] h-[18px] border-2 border-current border-r-[6px]" />;
      case 'Me': return <div className="w-[14px] h-[14px] border-2 border-current rounded-full" />;
      default: return null;
    }
  };

  return (
    <button onClick={onClick} className={cn(
      "flex flex-col items-center gap-1 transition-all duration-300 outline-none",
      active ? "text-brand-cyan scale-110" : "text-text-muted hover:text-text-main"
    )}>
      {getIcon()}
      <span className="text-[10px]">{label}</span>
      {active && (
        <div className="w-1 h-1 bg-brand-cyan rounded-full mt-0.5 glow-cyan" />
      )}
    </button>
  );
}

function CommentPreviewSection({ comments, onExpand, userName }: { comments: any[], onExpand: () => void, userName: string | null }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onExpand}
      className="cursor-pointer space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-brand-cyan text-xs font-bold uppercase tracking-widest">Comments</h2>
        <span className="text-brand-cyan text-[10px] font-bold uppercase tracking-wider bg-brand-cyan/10 px-2 py-0.5 rounded">
          View All {comments.reduce((acc, c) => acc + 1 + (c.repliesCount || 0), 0)}
        </span>
      </div>
      
      <div className="bg-bg-surface/50 border border-border-subtle rounded-2xl p-5 hover:border-brand-cyan/20 transition-all min-h-[120px] flex flex-col justify-center">
        {comments.length > 0 ? (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-bg-surface flex items-center justify-center text-[10px] font-black text-text-muted border border-border-subtle uppercase">
                {comments[0].userName ? comments[0].userName[0] : '?'}
              </div>
              <div>
                <p className="text-text-main text-xs font-bold">{comments[0].userName}</p>
                <p className="text-text-muted text-[10px]">
                   {formatCommentTimestamp(comments[0].timestamp)}
                </p>
              </div>
            </div>
            <p className="text-text-muted text-sm line-clamp-2 leading-relaxed italic">
              "{comments[0].text}"
            </p>
          </>
        ) : (
          <p className="text-text-muted text-sm italic text-center">No comments yet</p>
        )}
      </div>

      <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-bg-surface flex items-center justify-center text-[9px] font-black text-text-muted border border-border-subtle uppercase">
          {userName ? userName[0] : 'U'}
        </div>
        <div className="w-full bg-bg-surface/30 border border-border-subtle rounded-full py-2.5 pl-14 pr-4 text-[11px] text-text-muted">
          Add comment...
        </div>
      </div>
    </motion.div>
  );
}

function DetailsOverlay({ 
  item, 
  onClose, 
  setSelectedItem, 
  setPlayingInfo,
  watchlist,
  onToggleCollection,
  userName
}: { 
  item: MediaItem | null, 
  onClose: () => void, 
  setSelectedItem: (item: MediaItem | null) => void, 
  setPlayingInfo: (info: { url: string; item: MediaItem; season?: number; episode?: number } | null) => void,
  watchlist: MediaItem[],
  onToggleCollection: (item: MediaItem) => void,
  userName: string | null
}) {
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [imdbId, setImdbId] = useState<string | null>(null);
  const [episodeSearch, setEpisodeSearch] = useState("");
  const [selectedRange, setSelectedRange] = useState<[number, number] | null>(null);
  
  const [episodes, setEpisodes] = useState<any[]>([]);
  const stretch = { opacity: 1, scale: 1 };
  const shrink = { opacity: 0, scale: 1.1 };

  const stringifyDate = (date: any) => {
    if (!date) return "";
    if (typeof date === 'string') return date;
    if (typeof date === 'object' && date.year) {
      return `${date.year}-${String(date.month || 1).padStart(2, '0')}-${String(date.day || 1).padStart(2, '0')}`;
    }
    return String(date);
  };

  useEffect(() => {
    if (item) {
      window.scrollTo(0, 0); // Reset scroll position
      fetchImdbId();
      setSelectedSeason(1);
    } else {
      setDetails(null);
      setImdbId(null);
      setEpisodes([]);
    }
  }, [item]);

  useEffect(() => {
    if (item && (item.type === 'TV Show' || item.type === 'Anime') && selectedSeason && imdbId) {
      fetchSeasonEpisodes(selectedSeason, imdbId);
    }
  }, [selectedSeason, item, imdbId]);

  const fetchSeasonEpisodes = async (seasonNum: number, currentImdbId?: string) => {
    if (!item) return;
    const targetId = currentImdbId || imdbId;
    try {
      if (targetId) {
        const data = await apiFetch(`https://api.imdbapi.dev/titles/${targetId}/episodes?season=${seasonNum}`);
        
        let epList = [];
        if (data && data.episodes && Array.isArray(data.episodes)) {
          epList = data.episodes;
        } else if (Array.isArray(data)) {
          epList = data;
        }

        if (epList.length > 0) {
          let mappedEpisodes = epList.map((ep: any) => ({
            id: ep.id || `${targetId}-${seasonNum}-${ep.episodeNumber || ep.episode}`,
            episode_number: ep.episodeNumber || ep.episode,
            name: typeof ep.title === 'string' ? ep.title : (ep.title?.text || `Episode ${ep.episodeNumber || ep.episode}`),
            still_path: ep.primaryImage?.url || ep.image || ep.thumbnail,
            air_date: stringifyDate(ep.releaseDate || ep.airDate),
            plot: typeof ep.plot === 'string' ? ep.plot : (ep.plot?.text || "")
          }));

          const totalCountVal = parseInt(data.totalCount);
          const totalCount = !isNaN(totalCountVal) ? totalCountVal : mappedEpisodes.length;
          
          if (totalCount > mappedEpisodes.length) {
            const existingEpNumbers = new Set(mappedEpisodes.map(e => Number(e.episode_number)));
            for (let i = 1; i <= totalCount; i++) {
              if (!existingEpNumbers.has(i)) {
                mappedEpisodes.push({
                  id: `${targetId}-${seasonNum}-${i}-placeholder`,
                  episode_number: i,
                  name: `Episode ${i}`,
                  still_path: null,
                  air_date: "",
                  plot: "Episode details are pending update."
                });
              }
            }
            mappedEpisodes.sort((a, b) => Number(a.episode_number) - Number(b.episode_number));
          }

          setEpisodes(mappedEpisodes);
          return;
        }
      }

      // Fallback to TMDB if IMDB episodes fail
      if (item.type !== 'Anime') {
        const headers = { 'Authorization': `Bearer ${TMDB_TOKEN}` };
        const data = await apiFetch(`${TMDB_BASE_URL}/tv/${item.id}/season/${seasonNum}`, { headers });
        if (data && data.episodes) {
          setEpisodes(data.episodes.map((ep: any) => ({
            ...ep,
            still_path: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null
          })));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchImdbId = async () => {
    if (!item) return;
    setLoading(true);
    try {
      let id = "";
      if (item.source === 'kitsu') {
        const data = await apiFetch(`https://arm.haglund.dev/api/v2/ids?source=kitsu&id=${item.id}`);
        id = data?.imdb || "";
      } else if (item.type === 'Anime') {
        const data = await apiFetch(`https://arm.haglund.dev/api/v2/ids?source=myanimelist&id=${item.id}`);
        id = data?.imdb || "";
      } else {
        const type = item.type === 'Movie' ? 'movie' : 'tv';
        const data = await apiFetch(`${TMDB_BASE_URL}/${type}/${item.id}/external_ids?api_key=36f47e4702f0ffbb0c9788d06995ecde`);
        console.log("TMDB External IDs:", data);
        id = data?.imdb_id || "";
      }

      if (id) {
        setImdbId(id);
        fetchImdbDetails(id);
      } else {
        fetchTmdbFallback();
      }
    } catch (e) {
      console.error(e);
      fetchTmdbFallback();
    }
  };

  const fetchImdbDetails = async (id: string) => {
    try {
      const data = await apiFetch(`https://api.imdbapi.dev/titles/${id}`);
      if (!data) throw new Error("No data received from IMDB API");
      
      const mappedDetails: any = {
        title: (typeof data.title === 'string' ? data.title : data.title?.text) || item?.title,
        overview: typeof data.plot === 'string' ? data.plot : (data.plot?.text || "No overview available."),
        poster_path: data.image || item?.poster_path,
        vote_average: data.rating?.aggregateRating || item?.vote_average || 0,
        release_date: stringifyDate(data.releaseDate || data.startYear || "N/A"),
        genres: Array.isArray(data.genres) ? data.genres.map((g: any) => typeof g === 'string' ? g : (g.text || g.displayName)).join(', ') : "N/A",
        status: typeof data.status === 'string' ? data.status : "N/A",
        runtime: data.runtimeSeconds ? Math.floor(data.runtimeSeconds / 60) : null,
        cast: data.stars?.map((star: any) => {
          let imageUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(typeof star === 'string' ? star : (star.displayName || star.name || ''))}&background=random&color=fff`;
          if (star.primaryImage) {
            imageUrl = typeof star.primaryImage === 'string' ? star.primaryImage : (star.primaryImage.url || star.primaryImage);
          }
          return {
            name: typeof star === 'string' ? star : (star.displayName || star.name || 'Unknown'),
            profile_path: imageUrl
          };
        }),
        director: Array.isArray(data.directors) ? data.directors.map((d: any) => typeof d === 'string' ? d : (d.displayName || d.name || '')).join(', ') : "N/A",
        original_language: typeof data.countriesOfOrigin?.[0] === 'string' ? data.countriesOfOrigin[0] : (data.countriesOfOrigin?.[0]?.text || 'English'),
        type: item?.type
      };

      setDetails(mappedDetails);

      // Still need similar shows which IMDB API doesn't seem to provide easily in one go
      if (item) {
        const type = item.type === 'Movie' ? 'movie' : 'tv';
        const headers = { 'Authorization': `Bearer ${TMDB_TOKEN}` };
        const simData = await apiFetch(`${TMDB_BASE_URL}/${type}/${item.id}/similar`, { headers });
        setDetails((prev: any) => ({
          ...prev,
          similar: simData?.results?.slice(0, 10).map((s: any) => ({
            id: s.id,
            title: s.title || s.name,
            poster_path: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster',
            type: item.type,
            vote_average: s.vote_average
          }))
        }));
      }

      // Fetch seasons if it looks like a series (TV or Anime series)
      if (item?.type === 'TV Show' || item?.type === 'Anime') {
        fetchImdbSeasons(id);
      }
    } catch (e) {
      console.error(e);
      fetchTmdbFallback();
    } finally {
      setLoading(false);
    }
  };

  const fetchImdbSeasons = async (id: string) => {
    try {
      const data = await apiFetch(`https://api.imdbapi.dev/titles/${id}/seasons`);
      
      let seasonsList: any[] = [];
      if (data && data.seasons && Array.isArray(data.seasons)) {
        // Map the seasons and convert to integers for correct sorting
        seasonsList = data.seasons.map((s: any) => ({ 
          season_number: parseInt(s.season),
          episode_count: s.episodeCount
        }));
      } else if (Array.isArray(data)) {
        seasonsList = data.map(s => ({ 
          season_number: typeof s === 'number' ? s : (parseInt(s.seasonNumber) || parseInt(s.season)) 
        }));
      }

      let finalSeasons: any[] = [];
      const validNumericSeasons = seasonsList.filter(s => !isNaN(s.season_number) && s.season_number > 0);

      if (validNumericSeasons.length > 0) {
        const maxSeasonNumber = Math.max(...validNumericSeasons.map(s => s.season_number));
        finalSeasons = Array.from({ length: maxSeasonNumber }, (_, i) => ({ 
          season_number: i + 1 
        }));
      } else if (data.totalSeasons) {
        finalSeasons = Array.from({ length: data.totalSeasons }, (_, i) => ({ season_number: i + 1 }));
      }

      if (finalSeasons.length > 0) {
        setDetails((prev: any) => ({
          ...prev,
          seasons: finalSeasons
        }));
        
        // If we have seasons, make sure selected season is valid
        if (finalSeasons.length > 0) {
          const firstSeason = finalSeasons[0].season_number;
          setSelectedSeason(firstSeason);
          fetchSeasonEpisodes(firstSeason, id); // Use current id to avoid closure issues
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTmdbFallback = async () => {
    if (!item) return;
    try {
      const type = item.type === 'Movie' ? 'movie' : 'tv';
      const headers = { 'Authorization': `Bearer ${TMDB_TOKEN}` };
      const [details, cast, similar] = await Promise.all([
        apiFetch(`${TMDB_BASE_URL}/${type}/${item.id}`, { headers }),
        apiFetch(`${TMDB_BASE_URL}/${type}/${item.id}/credits`, { headers }),
        apiFetch(`${TMDB_BASE_URL}/${type}/${item.id}/similar`, { headers })
      ]);
      
      setDetails({
        title: details?.title || details?.name,
        overview: details?.overview,
        poster_path: details?.poster_path ? `https://image.tmdb.org/t/p/w500${details.poster_path}` : item.poster_path,
        vote_average: details?.vote_average,
        release_date: details?.release_date || details?.first_air_date,
        genres: details?.genres?.map((g: any) => g.name).join(', '),
        status: details?.status,
        runtime: details?.runtime || (details?.episode_run_time ? details.episode_run_time[0] : null),
        cast: cast?.cast?.slice(0, 10).map((c: any) => ({
          name: c.name,
          profile_path: c.profile_path ? `https://image.tmdb.org/t/p/w200${c.profile_path}` : 'https://via.placeholder.com/200x300?text=No+Img'
        })),
        similar: similar?.results?.slice(0, 10).map((s: any) => ({
          id: s.id,
          title: s.title || s.name,
          poster_path: s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster',
          type: item.type,
          vote_average: s.vote_average
        })),
        seasons: details?.seasons
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {item && (
        <motion.div 
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          className="fixed inset-0 z-[200] bg-bg-deep overflow-y-auto"
        >
          {/* Header */}
          <div className="relative h-[65vh] w-full">
            <img 
              src={item.backdrop_path || item.poster_path} 
              className="w-full h-full object-cover opacity-50 blur-sm"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-bg-deep via-bg-deep/40 to-transparent" />
            
            <button 
              onClick={onClose}
              className="absolute top-5 left-5 w-10 h-10 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white z-10"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>

            <div className="absolute bottom-0 left-0 right-0 p-5 flex flex-col md:flex-row gap-6 items-end">
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-32 md:w-48 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl shrink-0"
              >
                <img src={item.poster_path} className="w-full h-full object-cover" />
              </motion.div>
              
              <div className="flex-1 pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-brand-cyan text-black text-[10px] font-extrabold rounded uppercase">{item.type}</span>
                  <div className="px-2 py-0.5 bg-white/10 backdrop-blur-md text-brand-cyan text-[10px] font-bold rounded">★ {item.vote_average.toFixed(1)}</div>
                </div>
                <h1 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">{item.title}</h1>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-5 py-8 max-w-4xl mx-auto">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-2 border-brand-cyan border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : details ? (
              <div className="space-y-12">
                <section>
                  <h2 className="text-brand-cyan text-xs font-bold uppercase tracking-widest mb-3">Overview</h2>
                  <p className="text-text-main text-sm leading-relaxed">{details.overview || "No overview available."}</p>
                </section>

                {details.seasons && (details.seasons.length > 0) && (
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-brand-cyan text-xs font-bold uppercase tracking-widest">Seasons</h2>
                    </div>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                      {details.seasons.filter((s: any) => s.season_number > 0).map((s: any) => (
                        <button 
                          key={`season-${s.season_number}`}
                          onClick={() => {
                            setSelectedSeason(s.season_number);
                            setSelectedRange(null);
                            setEpisodeSearch("");
                          }}
                          className={cn(
                            "px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap",
                            selectedSeason === s.season_number ? "bg-brand-cyan text-black" : "bg-bg-surface text-text-muted border border-border-subtle"
                          )}
                        >
                          Season {s.season_number}
                        </button>
                      ))}
                    </div>
                    
                    {/* Episode Filter & Search */}
                    <div className="mt-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                      <div className="flex-1 w-full relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
                        <input 
                          type="text"
                          placeholder="Jump to episode..."
                          value={episodeSearch}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEpisodeSearch(val);
                            if (val) setSelectedRange(null);
                          }}
                          className="w-full bg-bg-surface border border-border-subtle rounded-xl py-2 pl-9 pr-4 text-xs text-text-main focus:outline-none focus:border-brand-cyan/50 transition-all"
                        />
                        {episodeSearch && (
                          <button 
                            onClick={() => setEpisodeSearch("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-brand-cyan transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      
                      {episodes.length > 50 && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 w-full sm:w-auto">
                          {Array.from({ length: Math.ceil(episodes.length / 100) }).map((_, idx) => {
                            const start = idx * 100 + 1;
                            const end = Math.min((idx + 1) * 100, episodes.length);
                            const isActive = selectedRange?.[0] === start;
                            return (
                              <button 
                                key={`details-range-${start}-${end}`}
                                onClick={() => {
                                  setSelectedRange([start, end]);
                                  setEpisodeSearch("");
                                }}
                                className={cn(
                                  "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap border transition-all",
                                  isActive ? "bg-brand-cyan text-black border-brand-cyan" : "bg-bg-surface/50 text-text-muted border-border-subtle hover:border-brand-cyan/40"
                                )}
                              >
                                {start}-{end}
                              </button>
                            );
                          })}
                          {selectedRange && (
                            <button 
                              onClick={() => setSelectedRange(null)}
                              className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-brand-red/10 text-brand-red border border-brand-red/20"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-6 flex gap-4 overflow-x-auto no-scrollbar pb-4">
                      {episodes.length > 0 ? episodes.filter(ep => {
                        if (episodeSearch) {
                          return ep.episode_number.toString() === episodeSearch || ep.name.toLowerCase().includes(episodeSearch.toLowerCase());
                        }
                        if (selectedRange) {
                          return ep.episode_number >= selectedRange[0] && ep.episode_number <= selectedRange[1];
                        }
                        if (episodes.length > 50 && !selectedRange && !episodeSearch) {
                           return ep.episode_number <= 50;
                        }
                        return true;
                      }).map((ep: any, i: number) => (
                        <div 
                          key={`${ep.id}-${i}`} 
                          className="flex-none w-48 group cursor-pointer"
                          onClick={() => {
                            if (imdbId || item.id) {
                              const targetId = imdbId || item.id;
                              let url = imdbId 
                                ? `https://vidsrc.xyz/embed/tv?imdb=${imdbId}&season=${selectedSeason}&episode=${ep.episode_number}`
                                : `https://vidsrc.xyz/embed/tv?tmdb=${item.id}&season=${selectedSeason}&episode=${ep.episode_number}`;
                              
                              setPlayingInfo({ url, item, season: selectedSeason, episode: ep.episode_number });
                            }
                          }}
                        >
                          <div className="aspect-video rounded-lg overflow-hidden relative bg-bg-surface mb-2 border border-border-subtle">
                            <img 
                              src={ep.still_path || (item.backdrop_path || item.poster_path)} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                              <div className="w-10 h-10 bg-brand-cyan/40 backdrop-blur-md rounded-full flex items-center justify-center">
                                <Play fill="currentColor" size={20} className="text-brand-cyan" />
                              </div>
                            </div>
                            <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded text-[8px] font-bold text-white">
                              EP {ep.episode_number}
                            </div>
                          </div>
                          <div className="flex flex-col">
                            <h4 className="text-[11px] font-medium text-text-main truncate">{ep.name}</h4>
                            {ep.plot && <p className="text-[9px] text-text-muted line-clamp-2 mt-1 leading-tight">{ep.plot}</p>}
                            <span className="text-[9px] text-text-muted mt-1">{ep.air_date || "Coming Soon"}</span>
                          </div>
                        </div>
                      )) : (
                        Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className="flex-none w-48 animate-pulse">
                            <div className="aspect-video rounded-lg bg-bg-surface mb-2 border border-border-subtle" />
                            <div className="h-2 w-24 bg-bg-surface rounded mb-1" />
                            <div className="h-2 w-12 bg-bg-surface rounded" />
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                )}

                <section>
                  <h2 className="text-brand-cyan text-xs font-bold uppercase tracking-widest mb-4">Details</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-4 bg-bg-surface/40 p-6 rounded-2xl border border-border-subtle shadow-sm">
                    <DetailItem label="Director" value={details.director || "N/A"} />
                    <DetailItem label="Release Date" value={details.release_date || "N/A"} />
                    <DetailItem label="Genre" value={details.genres || "N/A"} />
                    <DetailItem label="Language" value={details.original_language || "English"} />
                    <DetailItem label="Duration" value={details.runtime ? `${details.runtime} mins` : "N/A"} />
                    <DetailItem label="Status" value={details.status || "N/A"} />
                  </div>
                </section>

                {details.cast && (
                  <section>
                    <h2 className="text-brand-cyan text-xs font-bold uppercase tracking-widest mb-4">Cast</h2>
                    <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
                      {details.cast.map((person: any, i: number) => (
                        <div key={`cast-${person.name}-${i}`} className="flex-none w-20 text-center">
                          <div className="w-20 h-20 rounded-full overflow-hidden mb-2 bg-bg-surface border-2 border-border-subtle">
                            <img src={person.profile_path} className="w-full h-full object-cover" />
                          </div>
                          <span className="text-[10px] font-medium text-text-main block leading-tight">{person.name}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {details.similar && (
                  <section>
                    <h2 className="text-brand-cyan text-xs font-bold uppercase tracking-widest mb-4">Shows You May Like</h2>
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-4">
                      {details.similar.map((sim: any, i: number) => (
                        <div 
                          key={`similar-${sim.id}-${i}`} 
                          className="flex-none w-28 group cursor-pointer"
                          onClick={() => {
                            setSelectedItem(sim);
                          }}
                        >
                          <div className="aspect-[2/3] rounded-lg overflow-hidden bg-bg-surface mb-2 relative border border-border-subtle">
                            <img src={sim.poster_path} className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                          </div>
                          <h4 className="text-[10px] font-medium text-text-main truncate group-hover:text-brand-cyan transition-colors">{sim.title}</h4>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                
                {/* Spacer for fixed button */}
                <div className="h-28" />
              </div>
            ) : null}
          </div>

          {/* Fixed Play Button Container */}
          {item && (
            <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black via-black/80 to-transparent z-[210] flex items-center justify-center px-6 pointer-events-none pb-4">
              <div className="flex gap-3 w-full max-w-sm pointer-events-auto">
                <motion.button 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (imdbId || item.id) {
                      const targetId = imdbId || item.id;
                      let url = item.type === "Movie" 
                        ? (imdbId ? `https://vidsrc.xyz/embed/movie?imdb=${imdbId}` : `https://vidsrc.xyz/embed/movie?tmdb=${item.id}`)
                        : (imdbId ? `https://vidsrc.xyz/embed/tv?imdb=${imdbId}&season=1&episode=1` : `https://vidsrc.xyz/embed/tv?tmdb=${item.id}&season=1&episode=1`);
                      
                      setPlayingInfo({ url, item, season: 1, episode: 1 });
                    }
                  }}
                  className="flex-1 py-4 bg-brand-cyan text-black font-black uppercase tracking-[0.1em] rounded-xl text-xs shadow-2xl shadow-brand-cyan/40 hover:bg-white transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Play fill="currentColor" size={18} />
                  {item.type === 'Movie' ? 'Watch Now' : 'Start E1'}
                </motion.button>
                <motion.button
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onToggleCollection(item)}
                  className={cn(
                    "w-14 py-4 rounded-xl flex items-center justify-center transition-all border-2 active:scale-95",
                    watchlist.find(i => i.id === item.id)
                      ? "bg-brand-cyan/20 border-brand-cyan text-brand-cyan"
                      : "bg-black/50 border-white/10 text-white backdrop-blur-md"
                  )}
                >
                  {watchlist.find(i => i.id === item.id) ? (
                    <BookmarkCheck size={20} fill="currentColor" />
                  ) : (
                    <Bookmark size={20} />
                  )}
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] text-text-muted uppercase font-bold block mb-0.5">{label}</span>
      <span className="text-xs text-text-main font-medium">{value}</span>
    </div>
  );
}
