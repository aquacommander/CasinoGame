/**
 * Audio Manager - Prevents creating too many WebMediaPlayer instances
 * Reuses Audio elements to avoid browser limits
 */

class AudioManager {
  private audioCache: Map<string, HTMLAudioElement> = new Map();
  private maxCacheSize = 20; // Maximum number of cached audio elements

  /**
   * Get or create an audio element for a given source
   * Reuses existing audio elements to prevent too many WebMediaPlayers
   */
  getAudio(src: string): HTMLAudioElement | null {
    if (typeof window === "undefined") return null;

    // Check if we already have this audio cached
    if (this.audioCache.has(src)) {
      const audio = this.audioCache.get(src)!;
      // Reset audio to beginning for reuse
      audio.currentTime = 0;
      return audio;
    }

    // If cache is too large, remove oldest entries
    if (this.audioCache.size >= this.maxCacheSize) {
      const firstKey = this.audioCache.keys().next().value;
      if (firstKey) {
        const oldAudio = this.audioCache.get(firstKey);
        if (oldAudio) {
          oldAudio.pause();
          oldAudio.src = "";
        }
        this.audioCache.delete(firstKey);
      }
    }

    // Create new audio element
    try {
      const audio = new Audio(src);
      audio.preload = "auto";
      this.audioCache.set(src, audio);
      return audio;
    } catch (error) {
      console.error("Failed to create audio element:", error);
      return null;
    }
  }

  /**
   * Play audio from a source (reuses cached audio)
   */
  playAudio(src: string, options?: { muted?: boolean; volume?: number }): Promise<void> {
    const audio = this.getAudio(src);
    if (!audio) {
      return Promise.reject(new Error("Failed to get audio element"));
    }

    if (options?.volume !== undefined) {
      audio.volume = options.volume;
    }

    if (options?.muted !== undefined) {
      audio.muted = options.muted;
    }

    // Reset to beginning
    audio.currentTime = 0;

    return audio.play().catch((error) => {
      console.error("Failed to play audio:", error);
      throw error;
    });
  }

  /**
   * Clean up all audio elements
   */
  cleanup() {
    this.audioCache.forEach((audio) => {
      audio.pause();
      audio.src = "";
    });
    this.audioCache.clear();
  }

  /**
   * Remove a specific audio from cache
   */
  removeAudio(src: string) {
    const audio = this.audioCache.get(src);
    if (audio) {
      audio.pause();
      audio.src = "";
      this.audioCache.delete(src);
    }
  }
}

// Singleton instance
export const audioManager = new AudioManager();

// Cleanup on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    audioManager.cleanup();
  });
}

