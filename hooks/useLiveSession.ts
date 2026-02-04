import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { decodeAudioData, base64ToBytes, float32ToBase64PCM } from '../utils/audioUtils';

interface UseLiveSessionReturn {
  isConnected: boolean;
  isConnecting: boolean;
  volume: number;
  connect: (systemInstruction: string) => Promise<void>;
  disconnect: () => void;
  error: string | null;
}

export const useLiveSession = (): UseLiveSessionReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolume] = useState(0);

  // Audio Contexts
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  
  // Stream & Processing
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  
  // Playback State
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Session
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const currentSessionRef = useRef<any>(null); // To store the resolved session for cleanup if needed

  const disconnect = useCallback(() => {
    // 1. Close session
    if (currentSessionRef.current) {
      try {
        currentSessionRef.current.close();
      } catch (e) {
        console.warn("Error closing session", e);
      }
      currentSessionRef.current = null;
    }
    sessionPromiseRef.current = null;

    // 2. Stop microphone stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // 3. Disconnect Audio Nodes
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (analyzerRef.current) {
      analyzerRef.current.disconnect();
      analyzerRef.current = null;
    }

    // 4. Close AudioContexts
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (outputContextRef.current) {
      outputContextRef.current.close();
      outputContextRef.current = null;
    }

    // 5. Stop all playing audio
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    setIsConnected(false);
    setIsConnecting(false);
    setVolume(0);
  }, []);

  const connect = useCallback(async (systemInstruction: string) => {
    if (isConnected || isConnecting) return;
    
    setIsConnecting(true);
    setError(null);

    try {
      // Initialize Audio Contexts
      // Input: 16kHz for Gemini
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
      });
      // Output: 24kHz for Gemini response
      outputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });

      // Microphone Access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          channelCount: 1, 
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true
        } 
      });
      streamRef.current = stream;

      // Gemini Client
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } },
          },
        },
      };

      // Connect to Live API
      const sessionPromise = ai.live.connect({
        ...config,
        callbacks: {
          onopen: () => {
            console.log("Session Opened");
            setIsConnected(true);
            setIsConnecting(false);

            // Setup Input Processing Pipeline once session is open
            if (!inputContextRef.current || !streamRef.current) return;

            const inputCtx = inputContextRef.current;
            const source = inputCtx.createMediaStreamSource(streamRef.current);
            sourceRef.current = source;

            // Analyzer for visualizer
            const analyzer = inputCtx.createAnalyser();
            analyzer.fftSize = 256;
            analyzerRef.current = analyzer;
            source.connect(analyzer);

            // Processor to capture audio chunks
            // Buffer size 4096 gives decent latency/performance balance
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Calculate volume for visualizer
              let sum = 0;
              for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
              }
              const rms = Math.sqrt(sum / inputData.length);
              setVolume(Math.min(1, rms * 5)); // Amplify a bit for visual

              // Encode and send
              const base64Data = float32ToBase64PCM(inputData);
              
              sessionPromise.then((session) => {
                 session.sendRealtimeInput({
                   media: {
                     mimeType: 'audio/pcm;rate=16000',
                     data: base64Data
                   }
                 });
              });
            };

            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
             // Handle Interruption
             const serverContent = msg.serverContent;
             if (serverContent?.interrupted) {
                console.log("Interrupted!");
                activeSourcesRef.current.forEach(s => {
                   try { s.stop(); } catch(e){}
                });
                activeSourcesRef.current.clear();
                nextStartTimeRef.current = 0;
                return;
             }

             // Handle Audio Output
             const modelTurn = serverContent?.modelTurn;
             if (modelTurn?.parts?.[0]?.inlineData?.data) {
                const base64Audio = modelTurn.parts[0].inlineData.data;
                const outputCtx = outputContextRef.current;
                
                if (outputCtx) {
                  // Decode
                  const audioBuffer = await decodeAudioData(
                    base64ToBytes(base64Audio),
                    outputCtx,
                    24000
                  );

                  // Schedule Playback
                  // Ensure we don't schedule in the past
                  const currentTime = outputCtx.currentTime;
                  if (nextStartTimeRef.current < currentTime) {
                    nextStartTimeRef.current = currentTime;
                  }
                  
                  const source = outputCtx.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(outputCtx.destination);
                  
                  source.start(nextStartTimeRef.current);
                  nextStartTimeRef.current += audioBuffer.duration;
                  
                  activeSourcesRef.current.add(source);
                  source.onended = () => {
                    activeSourcesRef.current.delete(source);
                  };
                }
             }
          },
          onclose: () => {
             console.log("Session Closed");
             disconnect();
          },
          onerror: (err) => {
             console.error("Session Error", err);
             setError("Connection error. Please try again.");
             disconnect();
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;
      sessionPromise.then(sess => {
        currentSessionRef.current = sess;
      });

    } catch (e) {
      console.error(e);
      setError("Failed to initialize audio or connection.");
      setIsConnecting(false);
    }
  }, [isConnected, isConnecting, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    volume,
    connect,
    disconnect,
    error
  };
};