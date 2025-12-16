import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Square, Loader2, Sparkles } from 'lucide-react';
import { generateSpeech } from '../services/geminiService';

interface TTSButtonProps {
  text: string;
  className?: string;
  size?: number;
  quality?: 'standard' | 'high'; // Standard = Browser API, High = Gemini TTS
}

const TTSButton: React.FC<TTSButtonProps> = ({ text, className = "", size = 20, quality = 'standard' }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  
  // Refs
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedAtRef = useRef<number>(0);
  const wasManuallyStoppedRef = useRef<boolean>(false);

  useEffect(() => {
    if (quality === 'standard' && !('speechSynthesis' in window)) {
      setIsSupported(false);
    }
    
    return () => {
      // Cleanup
      window.speechSynthesis.cancel();
      if (sourceNodeRef.current) {
        try { sourceNodeRef.current.stop(); } catch (e) {}
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [quality]);

  // Decode helper: Base64 string to Uint8Array
  function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // Decode helper: PCM Data to AudioBuffer
  async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
  ): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  const handleStandardToggle = () => {
    // Check both state and actual speaking status
    const isActuallyPlaying = isPlaying || isPaused || window.speechSynthesis.speaking || window.speechSynthesis.pending;
    
    if (isActuallyPlaying) {
      // Stop completely (not pause) - be aggressive about stopping
      window.speechSynthesis.cancel();
      // Call cancel again to ensure it stops (some browsers need this)
      setTimeout(() => {
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          window.speechSynthesis.cancel();
        }
      }, 10);
      
      setIsPlaying(false);
      setIsPaused(false);
      utteranceRef.current = null;
    } else {
      // Start new
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/[#*`_]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utteranceRef.current = utterance;

      utterance.onend = () => {
        setIsPlaying(false);
        setIsPaused(false);
      };
      utterance.onerror = () => {
        setIsPlaying(false);
        setIsPaused(false);
      };

      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => v.name.includes('Google') && v.lang.includes('en')) || 
                             voices.find(v => v.lang.includes('en'));
      
      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.rate = 1.0;

      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
      setIsPaused(false);
    }
  };

  const handleHighQualityToggle = async () => {
    if (isPlaying || isPaused) {
      // Stop completely (not pause)
      wasManuallyStoppedRef.current = true; // Mark as manually stopped
      
      if (sourceNodeRef.current) {
        try { 
          // Disconnect and stop immediately
          sourceNodeRef.current.disconnect();
          sourceNodeRef.current.stop(0); // Stop immediately
        } catch (e) {
          // Source might already be stopped or disconnected
          console.error('Error stopping audio:', e);
        }
        sourceNodeRef.current = null;
      }
      // Also disconnect the audio context destination to ensure no audio continues
      if (audioContextRef.current) {
        try {
          // Close any active connections
          if (audioContextRef.current.state !== 'closed') {
            // Don't close the context, just ensure it's stopped
            const ctx = audioContextRef.current;
            if (ctx.state === 'running') {
              await ctx.suspend();
              await ctx.resume(); // Reset state
            }
          }
        } catch (e) {
          console.error('Error managing audio context:', e);
        }
      }
      setIsPlaying(false);
      setIsPaused(false);
      pausedAtRef.current = 0;
      audioBufferRef.current = null;
      return;
    }

    // Start new playback
    setIsLoading(true);
    try {
      // Clean text slightly
      const cleanText = text.replace(/[#*`_]/g, '');
      const base64Audio = await generateSpeech(cleanText);
      
      if (base64Audio) {
        // Initialize AudioContext if needed
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
             const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
             audioContextRef.current = new AudioContextClass({sampleRate: 24000});
        }
        
        const ctx = audioContextRef.current;
        if (!ctx) throw new Error("Audio Context not supported");

        // Ensure context is running (fixes browser autoplay policies)
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        
        // Decode PCM
        const pcmData = decode(base64Audio);
        const audioBuffer = await decodeAudioData(pcmData, ctx, 24000, 1);
        audioBufferRef.current = audioBuffer; // Store for resume
        
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        
        // Reset manual stop flag
        wasManuallyStoppedRef.current = false;
        
        source.onended = () => {
            // Only update state if we didn't manually stop
            if (!wasManuallyStoppedRef.current) {
              setIsPlaying(false);
              setIsPaused(false);
              sourceNodeRef.current = null;
              pausedAtRef.current = 0;
            }
        };
        
        startTimeRef.current = ctx.currentTime;
        pausedAtRef.current = 0;
        source.start();
        sourceNodeRef.current = source;
        
        setIsLoading(false);
        setIsPlaying(true);
        setIsPaused(false);
      } else {
        // Fallback to standard if HQ fails
        console.warn("HQ Audio generation returned empty. Falling back to standard TTS.");
        setIsLoading(false);
        handleStandardToggle();
      }
    } catch (e) {
      console.error("HQ TTS Failed", e);
      setIsLoading(false);
      handleStandardToggle(); // Fallback
    }
  };

  const handleToggle = () => {
    if (quality === 'high') {
      handleHighQualityToggle();
    } else {
      handleStandardToggle();
    }
  };

  if (!isSupported && quality === 'standard') return null;
  if (!text) return null;

  return (
    <button
      onClick={handleToggle}
      disabled={isLoading}
      className={`flex items-center justify-center p-2 rounded-lg transition-colors relative group ${
        isPlaying 
          ? 'bg-zinc-900 text-white' 
          : 'bg-zinc-100 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200'
      } ${className}`}
      title={isPlaying ? "Stop Reading" : quality === 'high' ? "Read Aloud (Gemini Voice)" : "Read Aloud"}
    >
      {isLoading ? (
        <Loader2 size={size} className="animate-spin" />
      ) : isPlaying ? (
        <Square size={size} fill="currentColor" />
      ) : (
        <Volume2 size={size} />
      )}
      
      {quality === 'high' && !isPlaying && !isLoading && (
        <span className="absolute -top-1 -right-1 text-amber-500 bg-white rounded-full">
          <Sparkles size={10} fill="currentColor" />
        </span>
      )}
    </button>
  );
};

export default TTSButton;
