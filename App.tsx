
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { Deck } from './components/Deck';
import { Mixer } from './components/Mixer';
import { Equalizer } from './components/Equalizer';
import { FXPanel } from './components/FXPanel';
import { MusicLibrary } from './components/MusicLibrary';
import { PerformancePads } from './components/PerformancePads';
import { BeatsPanel } from './components/BeatsPanel';
import { AutoDjPanel } from './components/AutoDjPanel';
import { Metronome } from './components/Metronome';
import { LayoutToggle } from './components/LayoutToggle';
import { MidiPanel } from './components/MidiPanel';
import { DeckLibraryBrowser } from './components/DeckLibraryBrowser';
import { AIHypeMan } from './components/AIHypeMan';
import { VocalFX } from './components/VocalFX';
import { SamplerPanel } from './components/SamplerPanel';
import { ThemeToggle } from './components/ThemeToggle';
import type { DeckState, Song, EqualizerPreset, Beat, BeatCategoryType, FxType, FxSettings, FxChain, AutoDjSettings, MappableControl, MidiMapping, MidiMessageId, CrossfaderCurveType } from './types';
// FIX: Corrected typo in import from 'EQ_FREQU KdyžENCIES' to 'EQ_FREQUENCIES'.
import { PRESETS, EQ_FREQUENCIES, FX_LIST, FX_PARAM_CONFIG } from './constants';

type LayoutMode = 'pro' | 'performance' | 'library';
type Theme = 'rainbow' | 'black';

// A list of musical keys in Camelot format for a plausible mock
const CAMELOT_KEYS = [
    '1A', '1B', '2A', '2B', '3A', '3B', '4A', '4B',
    '5A', '5B', '6A', '6B', '7A', '7B', '8A', '8B',
    '9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B'
];
const MOCK_GENRES = ['House', 'Techno', 'Trance', 'Drum & Bass', 'Pop', 'Hip Hop', 'Rock', 'Ambient'];

// --- IndexedDB Beat Storage Helpers ---
const DB_NAME = 'dj-app-beats-db';
const DB_VERSION = 1;
const STORE_NAME = 'beats';

const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject("Error opening DB");
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
};

const saveBeatsToDB = async (beats: Record<string, (Beat | null)[]>) => {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    await new Promise<void>((resolve, reject) => {
        const clearRequest = store.clear();
        clearRequest.onsuccess = () => resolve();
        clearRequest.onerror = () => reject(clearRequest.error);
    });

    for (const category in beats) {
        beats[category].forEach((beat, index) => {
            if (beat) {
                // We can't store the File or AudioBuffer object, so create a copy without them.
                const { file, audioBuffer, ...storableBeat } = beat;
                store.add({
                    id: `${category}-${index}`,
                    category,
                    index,
                    beat: storableBeat,
                });
            }
        });
    }
};

const loadBeatsFromDB = async (): Promise<Record<string, (Beat | null)[]>> => {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                const savedBeats = request.result;
                const newBeatsState: Record<string, (Beat | null)[]> = {
                    drum: Array(12).fill(null),
                    tuning: Array(12).fill(null),
                    instrumental: Array(12).fill(null),
                };
                savedBeats.forEach(item => {
                    if (newBeatsState[item.category]) {
                        newBeatsState[item.category][item.index] = item.beat;
                    }
                });
                resolve(newBeatsState);
            };
            request.onerror = () => resolve({
                drum: Array(12).fill(null),
                tuning: Array(12).fill(null),
                instrumental: Array(12).fill(null),
            });
        });
    } catch (error) {
        console.error("Failed to load beats from IndexedDB:", error);
        return {
            drum: Array(12).fill(null),
            tuning: Array(12).fill(null),
            instrumental: Array(12).fill(null),
        };
    }
};

const clearBeatsInDB = async () => {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();
};


// Enhanced mock key detection function
const detectKey = (buffer: AudioBuffer): string => {
    // This is an enhanced mock key detection algorithm. In a real-world scenario,
    // this would involve a proper FFT and chromagram analysis. Here, we simulate
    // it by analyzing the audio data to create a more plausible and content-aware
    // deterministic hash.

    const channelData = buffer.getChannelData(0); // Analyze the first channel
    const sampleRate = buffer.sampleRate;
    let sumOfSquares = 0;
    let zeroCrossings = 0;
    let peakAmplitude = 0;

    // We'll analyze a subset of samples for performance (e.g., first 5 seconds).
    const analysisWindow = Math.min(channelData.length, sampleRate * 5); 

    for (let i = 0; i < analysisWindow; i++) {
        const sample = channelData[i];
        sumOfSquares += sample * sample;

        if (Math.abs(sample) > peakAmplitude) {
            peakAmplitude = Math.abs(sample);
        }
        
        // Check for zero crossing
        if (i > 0 && Math.sign(channelData[i]) !== Math.sign(channelData[i - 1])) {
            zeroCrossings++;
        }
    }

    // RMS (Root Mean Square) - relates to loudness/energy
    const rms = Math.sqrt(sumOfSquares / analysisWindow);

    // Zero-crossing rate - crude approximation of dominant frequency/pitch
    const zcr = zeroCrossings / (analysisWindow / sampleRate);
    
    // Create a "musical hash" from these derived properties.
    // The multipliers are arbitrary primes to create a better distribution.
    const musicalHash = (rms * 1000) * 17 + (zcr * 31) + (peakAmplitude * 100) * 43;

    const hash = Math.floor(Math.abs(musicalHash)) % CAMELOT_KEYS.length;

    return CAMELOT_KEYS[hash];
};

const getMockProperties = (fileName: string): { key: string, genre: string, bpm: number } => {
    let hash = 0;
    for (let i = 0; i < fileName.length; i++) {
        const char = fileName.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    hash = Math.abs(hash);

    return {
        key: CAMELOT_KEYS[hash % CAMELOT_KEYS.length],
        genre: MOCK_GENRES[hash % MOCK_GENRES.length],
        bpm: 118 + (hash % 14), // BPM between 118-132
    };
};

const generateInitialFxSettings = (): Record<FxType, FxSettings> => {
    return FX_LIST.reduce((acc, fx) => {
        acc[fx] = FX_PARAM_CONFIG[fx].defaults;
        return acc;
    }, {} as Record<FxType, FxSettings>);
};

// --- FX Audio Node Types ---
interface FxNodes {
    input: GainNode;
    output: GainNode;
    dry: GainNode;
    wet: GainNode;
    [key: string]: AudioNode | AudioNode[]; // For other specific nodes
}

// Generate a simplified waveform for visualization
const generateWaveform = (buffer: AudioBuffer): Float32Array => {
    const rawData = buffer.getChannelData(0); // Use the first channel
    const samples = 512; // The number of data points for the waveform
    const blockSize = Math.floor(rawData.length / samples);
    const filteredData = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        const blockStart = blockSize * i;
        let max = 0;
        for (let j = 0; j < blockSize; j++) {
            const val = Math.abs(rawData[blockStart + j]);
            if (val > max) {
                max = val;
            }
        }
        filteredData[i] = max;
    }
    return filteredData;
};

const getArtistFromName = (name: string): string | null => {
    const match = name.match(/^(.*?)\s+-\s+.+$/);
    return match ? match[1].trim() : null;
};

// Calculate Root Mean Square to estimate loudness
const calculateLoudness = (buffer: AudioBuffer): number => {
    const data = buffer.getChannelData(0);
    let sumOfSquares = 0.0;
    for (let i = 0; i < data.length; i++) {
        sumOfSquares += data[i] * data[i];
    }
    const rms = Math.sqrt(sumOfSquares / data.length);
    // Return a value in a more usable range, avoiding zero.
    return Math.max(0.01, rms);
};

// Mock energy level calculation based on loudness and genre
const calculateEnergy = (loudness: number, genre?: string): number => {
    let energy = Math.ceil(loudness * 50); // Base energy from loudness (0-10 scale)
    switch (genre) {
        case 'Techno':
        case 'Drum & Bass':
        case 'Trance':
            energy += 2;
            break;
        case 'House':
        case 'Pop':
        case 'Rock':
            energy += 1;
            break;
        case 'Ambient':
            energy -= 2;
            break;
    }
    return Math.max(1, Math.min(10, energy)); // Clamp to 1-10 range
};

const MidiIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 18H6V4h12v16z"/>
        <path d="M7 15h2v-5H7v5zm3 0h2v-5h-2v5zm3 0h2v-5h-2v5zm3-2h2v-3h-2v3z"/>
    </svg>
);

const generateDrumSamples = (context: AudioContext, drumBuffersRef: React.MutableRefObject<AudioBuffer[]>) => {
    if (drumBuffersRef.current.length > 0) return;

    const samples: AudioBuffer[] = [];
    const { sampleRate } = context;

    const createSample = (duration: number, generator: (t: number, i: number) => number) => {
        const buffer = context.createBuffer(1, sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        const length = sampleRate * duration;
        for (let i = 0; i < length; i++) {
            data[i] = generator(i / sampleRate, i);
        }
        return buffer;
    };

    // 1. Kick
    samples.push(createSample(0.2, t => Math.sin(2 * Math.PI * 120 * Math.exp(-t * 35) * t) * Math.exp(-t * 30) * 1.5));

    // 2. Snare
    samples.push(createSample(0.2, t => ((Math.random() * 2 - 1) * 0.8 + Math.sin(2 * Math.PI * 250 * t) * 0.2) * Math.exp(-t * 20)));
    
    // 3. Closed Hi-Hat
    samples.push(createSample(0.05, t => (Math.random() * 2 - 1) * Math.exp(-t * 80)));

    // 4. Open Hi-Hat
    samples.push(createSample(0.4, t => (Math.random() * 2 - 1) * Math.exp(-t * 8)));

    // 5. Clap
    samples.push(createSample(0.15, (t, i) => (Math.random() * 2 - 1) * Math.pow(1 - (i / (sampleRate * 0.15)), 2)));

    // 6. Tom 1 (High)
    samples.push(createSample(0.25, t => Math.sin(2 * Math.PI * 300 * Math.exp(-t * 25) * t) * Math.exp(-t * 20)));

    // 7. Tom 2 (Mid)
    samples.push(createSample(0.35, t => Math.sin(2 * Math.PI * 200 * Math.exp(-t * 20) * t) * Math.exp(-t * 15)));

    // 8. Crash Cymbal
    samples.push(createSample(0.8, t => (Math.random() * 2 - 1) * Math.exp(-t * 4)));
    
    drumBuffersRef.current = samples;
};

// Helper to convert a 0-100 knob value to a gain factor (for preamp)
const mapGainKnobToFactor = (value: number): number => {
    // Knob is 0-100, 50 is unity (0dB)
    // Range is approx -12dB to +12dB
    if (value === 50) return 1.0;
    const db = (value - 50) * (12 / 50); // maps 0-100 to -12 to +12
    return Math.pow(10, db / 20);
};


const App: React.FC = () => {
    const [theme, setTheme] = useState<Theme>('rainbow');
    const [layout, setLayout] = useState<LayoutMode>('pro');
    const [isDeckABrowserVisible, setIsDeckABrowserVisible] = useState(false);
    const [isDeckBBrowserVisible, setIsDeckBBrowserVisible] = useState(false);

    const audioContextRef = useRef<AudioContext | null>(null);
    const masterGainRef = useRef<GainNode | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const deckAAnalyserRef = useRef<AnalyserNode | null>(null);
    const deckBAnalyserRef = useRef<AnalyserNode | null>(null);
    
    // EQ Audio Nodes
    const eqNodesRef = useRef<BiquadFilterNode[]>([]);
    const bassBoostNodeRef = useRef<BiquadFilterNode | null>(null);
    const bassEqNodeRef = useRef<BiquadFilterNode | null>(null);
    const midEqNodeRef = useRef<BiquadFilterNode | null>(null);
    const trebleEqNodeRef = useRef<BiquadFilterNode | null>(null);

    // FX Audio Nodes
    const fxChainEntryRef = useRef<GainNode | null>(null);
    const fxNodesRef = useRef<Record<FxType, FxNodes | null>>({
        'Reverb': null, 'Delay': null, 'Flanger': null, 'Low-Pass': null,
        'High-Pass': null, 'Band-Pass': null, 'Distortion': null, 'Phaser': null, 'Chorus': null,
    });
    
    // Metronome Audio Nodes
    const metronomeGainRef = useRef<GainNode | null>(null);
    const metronomeTimerId = useRef<number | null>(null);
    const nextNoteTime = useRef(0.0);
    const currentBeatInMeasure = useRef(0);
    const tapTempoTimestamps = useRef<number[]>([]);

    // Headphone Cue Nodes
    const deckACueGainRef = useRef<GainNode | null>(null);
    const deckBCueGainRef = useRef<GainNode | null>(null);
    const cueBusGainRef = useRef<GainNode | null>(null);
    const masterMonitorGainRef = useRef<GainNode | null>(null);
    const cueMonitorGainRef = useRef<GainNode | null>(null);
    const headphoneFinalGainRef = useRef<GainNode | null>(null);
    
    // Vocal FX Nodes
    const micStreamRef = useRef<MediaStream | null>(null);
    const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const micGainRef = useRef<GainNode | null>(null);
    const micFilterRef = useRef<BiquadFilterNode | null>(null);
    const micReverbInputRef = useRef<GainNode | null>(null);

    // Sampler Nodes
    const samplerBuffers = useRef<AudioBuffer[]>([]);
    const drumSampleBuffers = useRef<AudioBuffer[]>([]);
    const samplerGainRef = useRef<GainNode | null>(null);


    const deckAAudioRef = useRef<any>({ source: null, gainNode: null, lastUpdateTime: 0, transitionNodes: null, preFaderTap: null, scratchNoiseGain: null, scratchNoiseFilter: null, scratchSnippetSource: null });
    const deckBAudioRef = useRef<any>({ source: null, gainNode: null, lastUpdateTime: 0, transitionNodes: null, preFaderTap: null, scratchNoiseGain: null, scratchNoiseFilter: null, scratchSnippetSource: null });
    const transitionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);


    const [deckA, setDeckA] = useState<DeckState>({
        song: null,
        isPlaying: false,
        gain: 50,
        volume: 0.75,
        playbackRate: 1,
        currentTime: 0,
        duration: 0,
        platterAngle: 0,
        cuePoints: [],
        bpm: null,
        loop: { start: null, end: null, active: false },
        waveform: undefined,
        key: null,
        zoom: 1,
        viewStartRatio: 0,
        perceivedLoudness: undefined,
        keyLock: false,
        scratchModeEnabled: false,
        wasPlayingBeforeScratch: false,
    });
    const [deckB, setDeckB] = useState<DeckState>({
        song: null,
        isPlaying: false,
        gain: 50,
        volume: 0.75,
        playbackRate: 1,
        currentTime: 0,
        duration: 0,
        platterAngle: 0,
        cuePoints: [],
        bpm: null,
        loop: { start: null, end: null, active: false },
        waveform: undefined,
        key: null,
        zoom: 1,
        viewStartRatio: 0,
        perceivedLoudness: undefined,
        keyLock: false,
        scratchModeEnabled: false,
        wasPlayingBeforeScratch: false,
    });

    const [crossfader, setCrossfader] = useState<number>(0);
    const [crossfaderCurve, setCrossfaderCurve] = useState<CrossfaderCurveType>('linear');
    const [masterVolume, setMasterVolume] = useState<number>(0.8);
    const [library, setLibrary] = useState<Song[]>([]);
    const [queueA, setQueueA] = useState<Song[]>([]);
    const [queueB, setQueueB] = useState<Song[]>([]);
    
    // Headphone Cue State
    const [deckACue, setDeckACue] = useState(false);
    const [deckBCue, setDeckBCue] = useState(false);
    const [headphoneVolume, setHeadphoneVolume] = useState(80);
    const [headphoneMix, setHeadphoneMix] = useState(50); // 0=Cue, 100=Master

    // Equalizer State
    const [activePreset, setActivePreset] = useState<EqualizerPreset>(PRESETS[0]);
    const [bandValues, setBandValues] = useState<number[]>(activePreset.values);
    const [bassBoost, setBassBoost] = useState(0);
    const [virtualizer, setVirtualizer] = useState(0);
    const [customPresets, setCustomPresets] = useState<EqualizerPreset[]>([]);
    const [eqKnobs, setEqKnobs] = useState({ bass: 50, mid: 50, treble: 50 });


    // FX Panel State
    const [activeEffects, setActiveEffects] = useState<Set<FxType>>(new Set());
    const [selectedFx, setSelectedFx] = useState<FxType | null>(null);
    const [effectSettings, setEffectSettings] = useState<Record<FxType, FxSettings>>(generateInitialFxSettings());
    const [savedChains, setSavedChains] = useState<FxChain[]>(() => {
        try {
            const saved = localStorage.getItem('dj-fx-chains');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error("Could not load saved FX chains:", error);
            return [];
        }
    });

    const [beats, setBeats] = useState<Record<string, (Beat | null)[]>>({ 
        drum: Array(12).fill(null), 
        tuning: Array(12).fill(null), 
        instrumental: Array(12).fill(null) 
    });
    const [beatVolumes, setBeatVolumes] = useState<Record<BeatCategoryType, number>>({ drum: 100, tuning: 100, instrumental: 100 });
    const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(0));
    const [deckAFrequencyData, setDeckAFrequencyData] = useState<Uint8Array>(new Uint8Array(0));
    const [deckBFrequencyData, setDeckBFrequencyData] = useState<Uint8Array>(new Uint8Array(0));
    
    // Auto DJ State
    const [isAutoDjEnabled, setIsAutoDjEnabled] = useState(false);
    const [autoDjActiveDeck, setAutoDjActiveDeck] = useState<'A' | 'B'>('A');
    const [nextAutoDjTrack, setNextAutoDjTrack] = useState<Song | null>(null);
    const [autoDjHistory, setAutoDjHistory] = useState<Song[]>([]);
    const [isSuggestingTrack, setIsSuggestingTrack] = useState(false);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [autoDjSettings, setAutoDjSettings] = useState<AutoDjSettings>({
        transitionType: 'Smart',
        transitionDuration: 8,
        transitionTrigger: 12,
        playlistSource: 'library',
        shuffle: true,
        harmonicMix: true,
        genreMatch: false,
        bpmMatch: {
            enabled: true,
            range: 5,
        },
        avoidRepeatingArtist: true,
        autoGain: true,
        beatMatch: true,
        energyFlow: 'Any',
    });


    // Metronome State
    const [isMetronomeEnabled, setIsMetronomeEnabled] = useState(false);
    const [metronomeBpm, setMetronomeBpm] = useState(120);
    const [metronomeVolume, setMetronomeVolume] = useState(50);
    const [metronomeBeat, setMetronomeBeat] = useState(0); // 0=off, 1-N for beat
    const [metronomeTimeSignature, setMetronomeTimeSignature] = useState({ beats: 4, note: 4 });
    const [metronomeSubdivision, setMetronomeSubdivision] = useState<'quarter' | 'eighth' | 'sixteenth' | 'triplet'>('quarter');
    const [metronomeSound, setMetronomeSound] = useState<'classic' | 'woodblock' | 'cowbell'>('classic');

    
    // MIDI State
    const [midiAccess, setMidiAccess] = useState<MIDIAccess | null>(null);
    const [midiDevices, setMidiDevices] = useState<MIDIInput[]>([]);
    const [selectedMidiDeviceId, setSelectedMidiDeviceId] = useState<string | null>(null);
    const [midiMapping, setMidiMapping] = useState<MidiMapping>({});
    const [reverseMidiMapping, setReverseMidiMapping] = useState<Record<MidiMessageId, MappableControl>>({});
    const [isMidiLearning, setIsMidiLearning] = useState<MappableControl | null>(null);
    const [lastMidiMessage, setLastMidiMessage] = useState<string | null>(null);
    const [isMidiPanelVisible, setIsMidiPanelVisible] = useState(false);

    // AI Hype Man State
    const [hypeText, setHypeText] = useState('');
    const [isGeneratingHype, setIsGeneratingHype] = useState(false);

    // Vocal FX State
    const [isMicEnabled, setIsMicEnabled] = useState(false);
    const [micFilter, setMicFilter] = useState(50);
    const [micReverb, setMicReverb] = useState(20);

    // Sampler State
    const [samplerVolume, setSamplerVolume] = useState(80);

    useEffect(() => {
        if (layout === 'library') {
            setIsDeckABrowserVisible(false);
            setIsDeckBBrowserVisible(false);
        }
    }, [layout]);

    // Load saved beats from IndexedDB on initial load
    useEffect(() => {
        const loadSavedBeats = async () => {
            const savedBeats = await loadBeatsFromDB();
            setBeats(savedBeats);
        };
        loadSavedBeats();
    }, []);


    const initAudioContext = () => {
        if (!audioContextRef.current) {
            try {
                const context = new (window.AudioContext || (window as any).webkitAudioContext)();
                audioContextRef.current = context;

                // --- Master Path ---
                masterGainRef.current = context.createGain();

                // --- Headphone Cue Path ---
                deckACueGainRef.current = context.createGain();
                deckACueGainRef.current.gain.value = 0; // Start silent
                deckBCueGainRef.current = context.createGain();
                deckBCueGainRef.current.gain.value = 0; // Start silent
                
                cueBusGainRef.current = context.createGain();
                deckACueGainRef.current.connect(cueBusGainRef.current);
                deckBCueGainRef.current.connect(cueBusGainRef.current);

                masterMonitorGainRef.current = context.createGain();
                cueMonitorGainRef.current = context.createGain();
                headphoneFinalGainRef.current = context.createGain();

                masterGainRef.current.connect(masterMonitorGainRef.current);
                cueBusGainRef.current.connect(cueMonitorGainRef.current);

                masterMonitorGainRef.current.connect(headphoneFinalGainRef.current);
                cueMonitorGainRef.current.connect(headphoneFinalGainRef.current);
                
                // --- Final Output & Analyser ---
                analyserRef.current = context.createAnalyser();
                analyserRef.current.fftSize = 1024;
                const bufferLength = analyserRef.current.frequencyBinCount;
                setFrequencyData(new Uint8Array(bufferLength));

                headphoneFinalGainRef.current.connect(analyserRef.current);
                analyserRef.current.connect(context.destination);


                // FX Path
                fxChainEntryRef.current = context.createGain();
                createFxNodes(context);

                // Mixer 3-Band EQ
                bassEqNodeRef.current = context.createBiquadFilter();
                bassEqNodeRef.current.type = 'lowshelf';
                bassEqNodeRef.current.frequency.value = 300;
                bassEqNodeRef.current.gain.value = 0;

                midEqNodeRef.current = context.createBiquadFilter();
                midEqNodeRef.current.type = 'peaking';
                midEqNodeRef.current.frequency.value = 1000;
                midEqNodeRef.current.Q.value = 1;
                midEqNodeRef.current.gain.value = 0;

                trebleEqNodeRef.current = context.createBiquadFilter();
                trebleEqNodeRef.current.type = 'highshelf';
                trebleEqNodeRef.current.frequency.value = 3000;
                trebleEqNodeRef.current.gain.value = 0;

                // 10-Band EQ Path
                bassBoostNodeRef.current = context.createBiquadFilter();
                bassBoostNodeRef.current.type = 'lowshelf';
                bassBoostNodeRef.current.frequency.value = 250;
                bassBoostNodeRef.current.gain.value = 0;

                eqNodesRef.current = EQ_FREQUENCIES.map((freq) => {
                    const filter = context.createBiquadFilter();
                    filter.type = 'peaking';
                    filter.frequency.value = freq;
                    filter.Q.value = 1.41;
                    filter.gain.value = 0;
                    return filter;
                });

                // Connect audio chain: FX -> 3-Band EQ -> Bass Boost -> 10-Band EQ -> Master
                bassEqNodeRef.current.connect(midEqNodeRef.current);
                midEqNodeRef.current.connect(trebleEqNodeRef.current);
                trebleEqNodeRef.current.connect(bassBoostNodeRef.current);

                let lastEqNode: AudioNode = bassBoostNodeRef.current;
                eqNodesRef.current.forEach(filterNode => {
                    lastEqNode.connect(filterNode);
                    lastEqNode = filterNode;
                });
                lastEqNode.connect(masterGainRef.current);

                // Connect the FX entry point to the 3-Band EQ. The FX chain itself is connected via useEffect.
                if (fxChainEntryRef.current && bassEqNodeRef.current) {
                    fxChainEntryRef.current.connect(bassEqNodeRef.current);
                }

                // --- Deck Pre-Fader Taps for Cueing ---
                deckAAudioRef.current.preFaderTap = context.createGain();
                deckBAudioRef.current.preFaderTap = context.createGain();
                deckAAudioRef.current.preFaderTap.connect(deckACueGainRef.current);
                deckBAudioRef.current.preFaderTap.connect(deckBCueGainRef.current);

                // Deck Analysers
                deckAAnalyserRef.current = context.createAnalyser();
                deckAAnalyserRef.current.fftSize = 256;
                const deckABufferLength = deckAAnalyserRef.current.frequencyBinCount;
                setDeckAFrequencyData(new Uint8Array(deckABufferLength));
                deckAAudioRef.current.preFaderTap.connect(deckAAnalyserRef.current); // Tap pre-fader for analyser

                deckBAnalyserRef.current = context.createAnalyser();
                deckBAnalyserRef.current.fftSize = 256;
                const deckBBufferLength = deckBAnalyserRef.current.frequencyBinCount;
                setDeckBFrequencyData(new Uint8Array(deckBBufferLength));
                deckBAudioRef.current.preFaderTap.connect(deckBAnalyserRef.current); // Tap pre-fader for analyser

                // AutoDJ Transition Filters (for each deck)
                const createTransitionNodeChain = () => {
                    const eqFadeFilter = context.createBiquadFilter();
                    eqFadeFilter.type = 'lowshelf';
                    eqFadeFilter.frequency.value = 250;
                    eqFadeFilter.gain.value = 0;

                    const highPassFilter = context.createBiquadFilter();
                    highPassFilter.type = 'highpass';
                    highPassFilter.frequency.value = 10; // Neutral

                    const lowPassFilter = context.createBiquadFilter();
                    lowPassFilter.type = 'lowpass';
                    lowPassFilter.frequency.value = 22050; // Neutral

                    // Connect them in series before the main FX chain
                    highPassFilter.connect(lowPassFilter);
                    lowPassFilter.connect(eqFadeFilter);
                    eqFadeFilter.connect(fxChainEntryRef.current!);
                    
                    return { entry: highPassFilter, highPassFilter, lowPassFilter, eqFadeFilter };
                };
                deckAAudioRef.current.transitionNodes = createTransitionNodeChain();
                deckBAudioRef.current.transitionNodes = createTransitionNodeChain();

                // Metronome Path
                metronomeGainRef.current = context.createGain();
                metronomeGainRef.current.connect(masterGainRef.current); // Connect to master path before monitoring

                // Vocal FX Path
                micGainRef.current = context.createGain();
                micFilterRef.current = context.createBiquadFilter();
                micFilterRef.current.type = 'bandpass';
                micReverbInputRef.current = context.createGain();
                
                micGainRef.current.connect(micFilterRef.current);
                micFilterRef.current.connect(micReverbInputRef.current);
                micReverbInputRef.current.connect(masterGainRef.current);

                // Sampler Path
                samplerGainRef.current = context.createGain();
                samplerGainRef.current.connect(masterGainRef.current);
                generateSamplerSounds(context);
                generateDrumSamples(context, drumSampleBuffers);
                
                // Scratch Noise Path
                const noiseBufferSize = context.sampleRate * 2; // 2 seconds of noise
                const noiseBuffer = context.createBuffer(1, noiseBufferSize, context.sampleRate);
                const noiseOutput = noiseBuffer.getChannelData(0);
                for (let i = 0; i < noiseBufferSize; i++) {
                    noiseOutput[i] = Math.random() * 2 - 1;
                }
                const setupScratchNodes = () => {
                    const source = context.createBufferSource();
                    source.buffer = noiseBuffer;
                    source.loop = true;
                    const filter = context.createBiquadFilter();
                    filter.type = 'bandpass';
                    filter.frequency.value = 1000;
                    filter.Q.value = 2;
                    const gain = context.createGain();
                    gain.gain.value = 0; // Muted by default
                    source.connect(filter);
                    filter.connect(gain);
                    gain.connect(fxChainEntryRef.current!); // Connect scratch sound to main FX chain
                    source.start();
                    return { source, filter, gain };
                }
                const deckAScratch = setupScratchNodes();
                deckAAudioRef.current.scratchNoiseFilter = deckAScratch.filter;
                deckAAudioRef.current.scratchNoiseGain = deckAScratch.gain;

                const deckBScratch = setupScratchNodes();
                deckBAudioRef.current.scratchNoiseFilter = deckBScratch.filter;
                deckBAudioRef.current.scratchNoiseGain = deckBScratch.gain;


            } catch (e) {
                console.error("Web Audio API is not supported in this browser", e);
            }
        }
        if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
        }
    };

    const createFxNodes = (context: AudioContext) => {
        const createDryWet = (): [GainNode, GainNode, GainNode, GainNode] => {
            const input = context.createGain();
            const output = context.createGain();
            const dry = context.createGain();
            const wet = context.createGain();
            input.connect(dry);
            dry.connect(output);
            wet.connect(output);
            return [input, output, dry, wet];
        }

        // Delay
        const [dIn, dOut, dDry, dWet] = createDryWet();
        const delayNode = context.createDelay(5.0); // Max 5s delay
        const feedbackNode = context.createGain();
        dIn.connect(delayNode);
        delayNode.connect(feedbackNode);
        feedbackNode.connect(delayNode);
        delayNode.connect(dWet);
        fxNodesRef.current['Delay'] = { input: dIn, output: dOut, dry: dDry, wet: dWet, delay: delayNode, feedback: feedbackNode };

        // Flanger
        const [fIn, fOut, fDry, fWet] = createDryWet();
        const flangerDelay = context.createDelay(0.1);
        flangerDelay.delayTime.value = 0.005; // Start with a small delay
        const flangerFeedback = context.createGain();
        flangerFeedback.gain.value = 0.5;
        const flangerLfo = context.createOscillator();
        flangerLfo.type = 'sine';
        flangerLfo.frequency.value = 1; // 1 Hz
        const flangerLfoGain = context.createGain();
        flangerLfoGain.gain.value = 0.002;
        flangerLfo.connect(flangerLfoGain);
        flangerLfoGain.connect(flangerDelay.delayTime);
        flangerLfo.start();
        fIn.connect(flangerDelay);
        flangerDelay.connect(fWet);
        flangerDelay.connect(flangerFeedback);
        flangerFeedback.connect(fIn);
        fxNodesRef.current['Flanger'] = { input: fIn, output: fOut, dry: fDry, wet: fWet, delay: flangerDelay, lfo: flangerLfo, lfoGain: flangerLfoGain };
        
        // Low-Pass
        const [lpIn, lpOut, lpDry, lpWet] = createDryWet();
        const lpFilter = context.createBiquadFilter();
        lpFilter.type = 'lowpass';
        lpFilter.frequency.value = context.sampleRate / 2;
        lpIn.connect(lpFilter);
        lpFilter.connect(lpWet);
        fxNodesRef.current['Low-Pass'] = { input: lpIn, output: lpOut, dry: lpDry, wet: lpWet, filter: lpFilter };
        
        // High-Pass
        const [hpIn, hpOut, hpDry, hpWet] = createDryWet();
        const hpFilter = context.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.value = 10;
        hpIn.connect(hpFilter);
        hpFilter.connect(hpWet);
        fxNodesRef.current['High-Pass'] = { input: hpIn, output: hpOut, dry: hpDry, wet: hpWet, filter: hpFilter };

        // Band-Pass
        const [bpIn, bpOut, bpDry, bpWet] = createDryWet();
        const bpFilter = context.createBiquadFilter();
        bpFilter.type = 'bandpass';
        bpFilter.frequency.value = 1000;
        bpIn.connect(bpFilter);
        bpFilter.connect(bpWet);
        fxNodesRef.current['Band-Pass'] = { input: bpIn, output: bpOut, dry: bpDry, wet: bpWet, filter: bpFilter };

        // Reverb (Simulated with feedback delays)
        const [rIn, rOut, rDry, rWet] = createDryWet();
        const reverbTime = 2; // seconds
        const decayRate = 0.5;
        const delay1 = context.createDelay(reverbTime);
        const delay2 = context.createDelay(reverbTime * 0.75);
        const feedback1 = context.createGain();
        const feedback2 = context.createGain();
        feedback1.gain.value = decayRate;
        feedback2.gain.value = decayRate * 0.8;
        rIn.connect(delay1);
        rIn.connect(delay2);
        delay1.connect(feedback1);
        feedback1.connect(delay2);
        delay2.connect(feedback2);
        feedback2.connect(delay1);
        delay1.connect(rWet);
        delay2.connect(rWet);
        fxNodesRef.current['Reverb'] = { input: rIn, output: rOut, dry: rDry, wet: rWet, delay1, delay2 };

        // Distortion
        const [distIn, distOut, distDry, distWet] = createDryWet();
        const distortionNode = context.createWaveShaper();
        const toneFilter = context.createBiquadFilter();
        toneFilter.type = 'lowpass';
        toneFilter.frequency.value = context.sampleRate / 2;
        distIn.connect(distortionNode);
        distortionNode.connect(toneFilter);
        toneFilter.connect(distWet);
        fxNodesRef.current['Distortion'] = { input: distIn, output: distOut, dry: distDry, wet: distWet, shaper: distortionNode, tone: toneFilter };

        // Phaser
        const [pIn, pOut, pDry, pWet] = createDryWet();
        const phaserLfo = context.createOscillator();
        phaserLfo.type = 'sine';
        const phaserLfoGain = context.createGain();
        const allpassFilters = Array(6).fill(0).map(() => {
            const filter = context.createBiquadFilter();
            filter.type = 'allpass';
            return filter;
        });
        let lastFilter: AudioNode = pIn;
        allpassFilters.forEach(filter => {
            lastFilter.connect(filter);
            lastFilter = filter;
        });
        lastFilter.connect(pWet);
        phaserLfo.connect(phaserLfoGain);
        allpassFilters.forEach(filter => phaserLfoGain.connect(filter.frequency));
        phaserLfo.start();
        fxNodesRef.current['Phaser'] = { input: pIn, output: pOut, dry: pDry, wet: pWet, lfo: phaserLfo, lfoGain: phaserLfoGain, filters: allpassFilters };

        // Chorus
        const [cIn, cOut, cDry, cWet] = createDryWet();
        const chorusDelay = context.createDelay(1.0);
        const chorusLfo = context.createOscillator();
        chorusLfo.type = 'sine';
        const chorusLfoGain = context.createGain();
        cIn.connect(chorusDelay);
        chorusDelay.connect(cWet);
        chorusLfo.connect(chorusLfoGain);
        chorusLfoGain.connect(chorusDelay.delayTime);
        chorusLfo.start();
        fxNodesRef.current['Chorus'] = { input: cIn, output: cOut, dry: cDry, wet: cWet, delay: chorusDelay, lfo: chorusLfo, lfoGain: chorusLfoGain };
    }

    // Persist saved FX chains to local storage
    useEffect(() => {
        try {
            localStorage.setItem('dj-fx-chains', JSON.stringify(savedChains));
        } catch (error) {
            console.error("Could not save FX chains:", error);
        }
    }, [savedChains]);


    // Reconnect FX chain when active effects change
    useEffect(() => {
        if (!fxChainEntryRef.current || !bassEqNodeRef.current) return;

        let lastNode: AudioNode = fxChainEntryRef.current;
        lastNode.disconnect(); // Disconnect previous chain

        FX_LIST.forEach(fxType => {
            const fx = fxNodesRef.current[fxType];
            if (fx && activeEffects.has(fxType)) {
                lastNode.connect(fx.input);
                lastNode = fx.output;
            }
        });

        lastNode.connect(bassEqNodeRef.current);

    }, [activeEffects]);
    
    // Update FX parameters when settings change
    useEffect(() => {
        if (!audioContextRef.current) return;
        const now = audioContextRef.current.currentTime;

        for (const [fxType, settings] of Object.entries(effectSettings)) {
            const fx = fxNodesRef.current[fxType as FxType];
            if (!fx) continue;

            // Dry/Wet
            const wetValue = settings.dryWet / 100;
            fx.wet.gain.setTargetAtTime(wetValue, now, 0.015);
            fx.dry.gain.setTargetAtTime(1 - wetValue, now, 0.015);

            const fxConfig = FX_PARAM_CONFIG[fxType as FxType];
            const p1Config = fxConfig.param1;
            const p2Config = fxConfig.param2;

            let p1Value: number;
            const p2Value = p2Config.min + (settings.param2 / 100) * (p2Config.max - p2Config.min);

            if (fxConfig.syncable) {
                const bpm = crossfader <= 0 ? (deckA.bpm || 120) : (deckB.bpm || 120);
                const secondsPerBeat = 60 / bpm;
                const division = settings.beatDivision || 1;

                if (fxType === 'Delay') {
                    p1Value = secondsPerBeat * division;
                } else { // Flanger, Phaser, Chorus (LFOs)
                    const hz = 1 / secondsPerBeat;
                    p1Value = hz / division;
                }
            } else {
                p1Value = p1Config.min + (settings.param1 / 100) * (p1Config.max - p1Config.min);
            }
            
            switch(fxType) {
                case 'Delay':
                    (fx.delay as DelayNode).delayTime.setTargetAtTime(p1Value, now, 0.015);
                    (fx.feedback as GainNode).gain.setTargetAtTime(p2Value, now, 0.015);
                    break;
                case 'Flanger':
                    (fx.lfo as OscillatorNode).frequency.setTargetAtTime(p1Value, now, 0.015);
                    (fx.lfoGain as GainNode).gain.setTargetAtTime(p2Value, now, 0.015);
                    break;
                case 'Low-Pass':
                case 'High-Pass':
                case 'Band-Pass':
                    const minFreq = Math.log(p1Config.min);
                    const maxFreq = Math.log(p1Config.max);
                    const logFreqValue = minFreq + (settings.param1 / 100) * (maxFreq - minFreq);
                    (fx.filter as BiquadFilterNode).frequency.setTargetAtTime(Math.exp(logFreqValue), now, 0.015);
                    (fx.filter as BiquadFilterNode).Q.setTargetAtTime(p2Value, now, 0.015);
                    break;
                case 'Reverb':
                    const decay = p1Value;
                    const mix = p2Value;
                    (fx.delay1 as DelayNode).delayTime.setTargetAtTime(decay * 0.75, now, 0.015);
                    (fx.delay2 as DelayNode).delayTime.setTargetAtTime(decay, now, 0.015);
                    (fx.wet as GainNode).gain.setTargetAtTime(wetValue * mix, now, 0.015);
                    break;
                case 'Distortion':
                    const curve = new Float32Array(4096);
                    const k = p1Value; // Amount
                    const deg = Math.PI / 180;
                    for (let i = 0; i < 4096; i++) {
                        const x = (i * 2) / 4096 - 1;
                        curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
                    }
                    (fx.shaper as WaveShaperNode).curve = curve;
                    (fx.shaper as WaveShaperNode).oversample = '4x';
                    const toneMin = Math.log(p2Config.min);
                    const toneMax = Math.log(p2Config.max);
                    const logToneValue = toneMin + (settings.param2 / 100) * (toneMax - toneMin);
                    (fx.tone as BiquadFilterNode).frequency.setTargetAtTime(Math.exp(logToneValue), now, 0.015);
                    break;
                case 'Phaser':
                    (fx.lfo as OscillatorNode).frequency.setTargetAtTime(p1Value, now, 0.015); // Speed
                    (fx.lfoGain as GainNode).gain.setTargetAtTime(p2Value, now, 0.015); // Depth
                    (fx.filters as BiquadFilterNode[]).forEach(f => f.frequency.setTargetAtTime(p2Value, now, 0.015)); // Base frequency
                    break;
                case 'Chorus':
                    const baseDelay = 0.025; // 25ms base for chorus
                    (fx.delay as DelayNode).delayTime.setTargetAtTime(baseDelay, now, 0.015);
                    (fx.lfo as OscillatorNode).frequency.setTargetAtTime(p1Value, now, 0.015); // Speed
                    (fx.lfoGain as GainNode).gain.setTargetAtTime(p2Value, now, 0.015); // Depth
                    break;
            }
        }
    }, [effectSettings, crossfader, deckA.bpm, deckB.bpm]);


    useEffect(() => {
        setBandValues(activePreset.values);
    }, [activePreset]);

    useEffect(() => {
        if (!audioContextRef.current) return;
        const now = audioContextRef.current.currentTime;
        bandValues.forEach((value, index) => {
            if (eqNodesRef.current[index]) {
                eqNodesRef.current[index].gain.setValueAtTime(value, now);
            }
        });
    }, [bandValues]);

    useEffect(() => {
        if (!audioContextRef.current || !bassBoostNodeRef.current) return;
        const gainValue = (bassBoost / 100) * 15; // Map 0-100 to 0-15dB
        bassBoostNodeRef.current.gain.setValueAtTime(gainValue, audioContextRef.current.currentTime);
    }, [bassBoost]);
    
    // Mixer 3-Band EQ Control
    useEffect(() => {
        if (!audioContextRef.current || !bassEqNodeRef.current || !midEqNodeRef.current || !trebleEqNodeRef.current) return;
        const now = audioContextRef.current.currentTime;

        const mapKnobToGain = (value: number) => {
            // Maps 0-100 to a dB range of -26dB to +6dB. 50 is 0dB.
            if (value === 50) return 0;
            if (value < 50) {
                return (value / 50 - 1) * 26;
            }
            return ((value - 50) / 50) * 6;
        };

        const bassGain = mapKnobToGain(eqKnobs.bass);
        const midGain = mapKnobToGain(eqKnobs.mid);
        const trebleGain = mapKnobToGain(eqKnobs.treble);

        bassEqNodeRef.current.gain.setTargetAtTime(bassGain, now, 0.015);
        midEqNodeRef.current.gain.setTargetAtTime(midGain, now, 0.015);
        trebleEqNodeRef.current.gain.setTargetAtTime(trebleGain, now, 0.015);
    }, [eqKnobs]);


    useEffect(() => {
        const position = (crossfader + 1) / 2; // Normalize to 0 (A) to 1 (B)

        let gainA: number;
        let gainB: number;

        switch (crossfaderCurve) {
            case 'slow-fade': // Constant power curve
                gainA = Math.cos(position * Math.PI / 2);
                gainB = Math.sin(position * Math.PI / 2);
                break;
            case 'fast-cut':
                // A curve that is sharp in the middle for quick cuts
                const p = position < 0.5 ? 2 * position : 2 * (1 - position);
                const shapedP = Math.pow(p, 3); // Steepness factor
                if (position < 0.5) {
                    gainA = 1 - shapedP / 2;
                    gainB = shapedP / 2;
                } else {
                    gainA = shapedP / 2;
                    gainB = 1 - shapedP / 2;
                }
                break;
            case 'linear':
            default:
                gainA = 1 - position;
                gainB = position;
                break;
        }

        if (deckAAudioRef.current.gainNode) {
            deckAAudioRef.current.gainNode.gain.setValueAtTime(deckA.volume * gainA, audioContextRef.current?.currentTime ?? 0);
        }
        if (deckBAudioRef.current.gainNode) {
            deckBAudioRef.current.gainNode.gain.setValueAtTime(deckB.volume * gainB, audioContextRef.current?.currentTime ?? 0);
        }
        if (masterGainRef.current) {
            masterGainRef.current.gain.setValueAtTime(masterVolume, audioContextRef.current?.currentTime ?? 0);
        }
    }, [crossfader, masterVolume, deckA.volume, deckB.volume, crossfaderCurve]);

    // --- Headphone Cue Logic ---
    useEffect(() => {
        if (deckACueGainRef.current && audioContextRef.current) {
            deckACueGainRef.current.gain.setValueAtTime(deckACue ? 1 : 0, audioContextRef.current.currentTime);
        }
    }, [deckACue]);

    useEffect(() => {
        if (deckBCueGainRef.current && audioContextRef.current) {
            deckBCueGainRef.current.gain.setValueAtTime(deckBCue ? 1 : 0, audioContextRef.current.currentTime);
        }
    }, [deckBCue]);

    useEffect(() => {
        if (headphoneFinalGainRef.current && audioContextRef.current) {
            // Map 0-100 to a gain range of 0 to 1.5 for extra headroom
            headphoneFinalGainRef.current.gain.setValueAtTime((headphoneVolume / 100) * 1.5, audioContextRef.current.currentTime);
        }
    }, [headphoneVolume]);

    useEffect(() => {
        if (cueMonitorGainRef.current && masterMonitorGainRef.current && audioContextRef.current) {
            const mixValue = headphoneMix / 100; // 0 (CUE) to 1 (MASTER)
            // Use an equal-power crossfade curve for a smoother transition
            const angle = mixValue * 0.5 * Math.PI;
            const cueGain = Math.cos(angle);
            const masterGain = Math.sin(angle);

            cueMonitorGainRef.current.gain.setValueAtTime(cueGain, audioContextRef.current.currentTime);
            masterMonitorGainRef.current.gain.setValueAtTime(masterGain, audioContextRef.current.currentTime);
        }
    }, [headphoneMix]);

    
    // Metronome Scheduling Logic
    useEffect(() => {
        if (metronomeGainRef.current) {
            metronomeGainRef.current.gain.value = metronomeVolume / 100;
        }
    }, [metronomeVolume]);
    
    useEffect(() => {
        const scheduleClick = (time: number, isDownbeat: boolean, isSubdivision: boolean) => {
            if (!audioContextRef.current || !metronomeGainRef.current) return;
            
            const context = audioContextRef.current;
            const clickGain = context.createGain();
            clickGain.connect(metronomeGainRef.current);
    
            const mainVol = isSubdivision ? 0.4 : 1.0; // Subdivisions are quieter
            let decay = 0.05;
    
            const playSound = (freq: number, type: OscillatorType, startTime: number, stopTime: number) => {
                const osc = context.createOscillator();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, startTime);
                osc.connect(clickGain);
                osc.start(startTime);
                osc.stop(stopTime);
            };
            
            clickGain.gain.setValueAtTime(mainVol, time);
    
            // Sound design
            switch (metronomeSound) {
                case 'woodblock':
                    decay = 0.1;
                    playSound(isDownbeat ? 1500 : 1200, 'square', time, time + decay);
                    break;
                case 'cowbell':
                    decay = 0.15;
                    playSound(isDownbeat ? 800 : 530, 'sawtooth', time, time + decay);
                    playSound(isDownbeat ? 800 * 1.5 : 530 * 1.5, 'square', time, time + decay);
                    break;
                case 'classic': // default beep
                default:
                    playSound(isDownbeat ? 1000 : 800, 'sine', time, time + decay);
                    break;
            }
    
            clickGain.gain.exponentialRampToValueAtTime(0.001, time + decay);
        };
    
        const scheduler = () => {
            const context = audioContextRef.current;
            if (!context) return;
            
            const scheduleAheadTime = 0.1; // seconds
            const secondsPerBeat = 60.0 / metronomeBpm;
            
            let subdivisionsPerBeat = 1;
            switch (metronomeSubdivision) {
                case 'eighth': subdivisionsPerBeat = 2; break;
                case 'sixteenth': subdivisionsPerBeat = 4; break;
                case 'triplet': subdivisionsPerBeat = 3; break;
            }
    
            while (nextNoteTime.current < context.currentTime + scheduleAheadTime) {
                const beatInMeasure = currentBeatInMeasure.current % metronomeTimeSignature.beats;
                const isDownbeat = beatInMeasure === 0;
                
                // Schedule main beat
                scheduleClick(nextNoteTime.current, isDownbeat, false);
    
                // Schedule subdivisions
                if (subdivisionsPerBeat > 1) {
                    for (let i = 1; i < subdivisionsPerBeat; i++) {
                        const subdivisionTime = nextNoteTime.current + (i * secondsPerBeat / subdivisionsPerBeat);
                        scheduleClick(subdivisionTime, false, true);
                    }
                }
                
                 // Update visual feedback state only for main beats
                const visualDelay = (nextNoteTime.current - context.currentTime) * 1000;
                setTimeout(() => {
                    setMetronomeBeat(beatInMeasure + 1);
                }, visualDelay);
    
                nextNoteTime.current += secondsPerBeat;
                currentBeatInMeasure.current++;
            }
            metronomeTimerId.current = window.setTimeout(scheduler, 25.0);
        };
    
        if (isMetronomeEnabled) {
            initAudioContext();
            if (audioContextRef.current?.state === 'suspended') {
                audioContextRef.current.resume();
            }
            if (audioContextRef.current) {
                nextNoteTime.current = audioContextRef.current.currentTime + 0.1;
                currentBeatInMeasure.current = 0;
                scheduler();
            }
        } else {
            if (metronomeTimerId.current) {
                window.clearTimeout(metronomeTimerId.current);
                metronomeTimerId.current = null;
            }
            setMetronomeBeat(0);
        }
        
        return () => {
            if (metronomeTimerId.current) {
                window.clearTimeout(metronomeTimerId.current);
            }
        };
    }, [isMetronomeEnabled, metronomeBpm, metronomeTimeSignature, metronomeSubdivision, metronomeSound]);

    const handleMetronomeTap = () => {
        const now = performance.now();
        const lastTap = tapTempoTimestamps.current[tapTempoTimestamps.current.length - 1];
    
        if (lastTap && (now - lastTap > 2000)) { // Reset after 2s
            tapTempoTimestamps.current = [];
        }
    
        tapTempoTimestamps.current.push(now);
        if (tapTempoTimestamps.current.length > 5) {
            tapTempoTimestamps.current.shift();
        }
        
        if (tapTempoTimestamps.current.length > 1) {
            const intervals = [];
            for (let i = 1; i < tapTempoTimestamps.current.length; i++) {
                intervals.push(tapTempoTimestamps.current[i] - tapTempoTimestamps.current[i - 1]);
            }
            const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            if (averageInterval > 0) {
                const newBpm = Math.round(60000 / averageInterval);
                setMetronomeBpm(Math.max(40, Math.min(240, newBpm)));
            }
        }
    };

    // --- MIDI LOGIC ---
    const initializeMidi = useCallback(async () => {
        if (midiAccess) return; // Already initialized

        try {
            const midi = await navigator.requestMIDIAccess({ sysex: false });
            setMidiAccess(midi);
            const inputs = Array.from(midi.inputs.values());
            setMidiDevices(inputs);
            if (inputs.length > 0) {
                setSelectedMidiDeviceId(inputs[0].id);
            }
            midi.onstatechange = () => {
                setMidiDevices(Array.from(midi.inputs.values()));
            };

            // Load mappings from localStorage
            try {
                const savedMappings = localStorage.getItem('dj-midi-mappings');
                if (savedMappings) {
                    setMidiMapping(JSON.parse(savedMappings));
                }
            } catch (e) { console.error("Could not load MIDI mappings", e); }

        } catch (error) {
            console.error("MIDI Access could not be granted.", error);
        }
    }, [midiAccess]);

    const handleToggleMidiPanel = () => {
        // If opening the panel and MIDI is not yet initialized, initialize it.
        // This ties the permission request to a user gesture.
        if (!isMidiPanelVisible && !midiAccess) {
            initializeMidi();
        }
        setIsMidiPanelVisible(prev => !prev);
    };

    const handleMidiMessage = useCallback((event: MIDIMessageEvent) => {
        const [command, data1, data2] = event.data;
        const channel = (command & 0x0f) + 1;
        const status = command & 0xf0;
    
        let messageId: MidiMessageId | null = null;
        let messageStr = '';

        // Note On/Off
        if (status === 0x90 || status === 0x80) {
            const note = data1;
            const velocity = data2;
            // Treat note on with velocity 0 as note off
            const type = (status === 0x90 && velocity > 0) ? 'note_on' : 'note_off';
            messageId = `${type}_${channel}_${note}`;
            messageStr = `Type: ${type}, Ch: ${channel}, Note: ${note}, Vel: ${velocity}`;
        }
        // Control Change (CC)
        else if (status === 0xB0) {
            const control = data1;
            const value = data2;
            messageId = `cc_${channel}_${control}`;
            messageStr = `Type: CC, Ch: ${channel}, Control: ${control}, Val: ${value}`;
        }
    
        if (!messageId) return;

        setLastMidiMessage(messageStr);
    
        if (isMidiLearning) {
            setMidiMapping(prev => {
                const newMapping = { ...prev };
                // Remove any existing mapping for this control
                Object.keys(newMapping).forEach(key => {
                    if (newMapping[key as MappableControl] === messageId) {
                        delete newMapping[key as MappableControl];
                    }
                });
                newMapping[isMidiLearning] = messageId;
                return newMapping;
            });
            setIsMidiLearning(null);
        } else {
            const targetControl = reverseMidiMapping[messageId];
            if (targetControl) {
                handleControlAction(targetControl, data2);
            }
        }
    }, [isMidiLearning, reverseMidiMapping]);

    const handleControlAction = (controlId: MappableControl, value: number) => {
        // --- DECK A ---
        if (controlId === 'deckA_volume') setDeckA(d => ({ ...d, volume: value / 127 }));
        else if (controlId === 'deckA_pitch') handlePitchChange('A', 0.9 + (value / 127) * 0.2);
        else if (controlId === 'deckA_play' && value > 0) togglePlay('A');
        else if (controlId === 'deckA_cue') setDeckACue(value > 0);
        
        // --- DECK B ---
        else if (controlId === 'deckB_volume') setDeckB(d => ({ ...d, volume: value / 127 }));
        else if (controlId === 'deckB_pitch') handlePitchChange('B', 0.9 + (value / 127) * 0.2);
        else if (controlId === 'deckB_play' && value > 0) togglePlay('B');
        else if (controlId === 'deckB_cue') setDeckBCue(value > 0);
        
        // --- MIXER ---
        else if (controlId === 'crossfader') setCrossfader(-1 + (value / 127) * 2);
        else if (controlId === 'master_volume') setMasterVolume(value / 127);
        else if (controlId === 'headphone_volume') setHeadphoneVolume( (value / 127) * 100);
        else if (controlId === 'headphone_mix') setHeadphoneMix((value / 127) * 100);
        else if (controlId === 'eq_bass') setEqKnobs(k => ({...k, bass: (value/127) * 100}));
        else if (controlId === 'eq_mid') setEqKnobs(k => ({...k, mid: (value/127) * 100}));
        else if (controlId === 'eq_treble') setEqKnobs(k => ({...k, treble: (value/127) * 100}));

        // --- PERFORMANCE PADS ---
        else if (controlId.startsWith('deckA_hotcue_') && value > 0) {
            const index = parseInt(controlId.split('_')[2]) - 1;
            handleCueAction('A', deckA.cuePoints[index] ? 'jump' : 'set', index);
        }
        else if (controlId.startsWith('deckB_hotcue_') && value > 0) {
            const index = parseInt(controlId.split('_')[2]) - 1;
            handleCueAction('B', deckB.cuePoints[index] ? 'jump' : 'set', index);
        }
        else if (controlId.startsWith('deckA_loop_') && value > 0) {
            const beats = parseInt(controlId.split('_')[2]);
            handleSetLoop('A', { beats });
        }
        else if (controlId.startsWith('deckB_loop_') && value > 0) {
            const beats = parseInt(controlId.split('_')[2]);
            handleSetLoop('B', { beats });
        }

        // --- FX PANEL ---
        else if (controlId.startsWith('fx_toggle_') && value > 0) {
            const fxType = controlId.replace('fx_toggle_', '') as FxType;
            setActiveEffects(prev => {
                const newSet = new Set(prev);
                if (newSet.has(fxType)) newSet.delete(fxType);
                else newSet.add(fxType);
                return newSet;
            });
        }
        else if (controlId === 'fx_selected_dryWet' && selectedFx) {
            setEffectSettings(s => ({ ...s, [selectedFx]: { ...s[selectedFx], dryWet: (value / 127) * 100 }}));
        }
        else if (controlId === 'fx_selected_param1' && selectedFx) {
            setEffectSettings(s => ({ ...s, [selectedFx]: { ...s[selectedFx], param1: (value / 127) * 100 }}));
        }
        else if (controlId === 'fx_selected_param2' && selectedFx) {
            setEffectSettings(s => ({ ...s, [selectedFx]: { ...s[selectedFx], param2: (value / 127) * 100 }}));
        }
    };
    
    // Save mappings to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem('dj-midi-mappings', JSON.stringify(midiMapping));
            // Re-create the reverse mapping for quick lookups
            const newReverseMapping: Record<MidiMessageId, MappableControl> = {};
            for (const control in midiMapping) {
                const messageId = midiMapping[control as MappableControl];
                if (messageId) {
                    newReverseMapping[messageId] = control as MappableControl;
                }
            }
            setReverseMidiMapping(newReverseMapping);

        } catch(e) { console.error("Could not save MIDI mappings", e); }
    }, [midiMapping]);

    // Attach/detach MIDI message listener when device changes
    useEffect(() => {
        if (!midiAccess) return;
    
        // Clean up listeners on all devices first
        midiAccess.inputs.forEach(input => {
            input.onmidimessage = null;
        });
    
        if (selectedMidiDeviceId) {
            const selectedDevice = midiAccess.inputs.get(selectedMidiDeviceId);
            if (selectedDevice) {
                selectedDevice.onmidimessage = handleMidiMessage;
            }
        }
        
        return () => { // Cleanup
            if (midiAccess) {
                 midiAccess.inputs.forEach(input => {
                    input.onmidimessage = null;
                });
            }
        };
    }, [midiAccess, selectedMidiDeviceId, handleMidiMessage]);


    const loadSong = useCallback(async (file: File, deck: 'A' | 'B'): Promise<DeckState> => {
       return new Promise((resolve, reject) => {
            initAudioContext();
            if (!audioContextRef.current || !analyserRef.current) {
                reject("Audio context not ready");
                return;
            }
    
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const arrayBuffer = e.target?.result as ArrayBuffer;
                    const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer);
                    const waveformData = generateWaveform(audioBuffer);
                    const loudness = calculateLoudness(audioBuffer);
                    
                    const mockProps = getMockProperties(file.name);
                    const detectedKey = detectKey(audioBuffer);
                    const energy = calculateEnergy(loudness, mockProps.genre);

                    const songWithDetails: Song = {
                        id: Date.now() + Math.random(),
                        name: file.name,
                        file: file,
                        key: detectedKey,
                        genre: mockProps.genre,
                        bpm: mockProps.bpm,
                        energy: energy,
                    };

                    const newDeckState: DeckState = {
                        song: songWithDetails,
                        duration: audioBuffer.duration,
                        isPlaying: false,
                        currentTime: 0,
                        platterAngle: 0,
                        bpm: songWithDetails.bpm,
                        playbackRate: 1,
                        cuePoints: [],
                        loop: { start: null, end: null, active: false },
                        waveform: waveformData,
                        key: detectedKey,
                        zoom: 1,
                        viewStartRatio: 0,
                        perceivedLoudness: loudness,
                        gain: 50, // Reset gain on load
                        volume: 0.75, // Default volume
                        keyLock: false,
                        scratchModeEnabled: false,
                        wasPlayingBeforeScratch: false,
                    };

                    setLibrary(prev => {
                        const existingIndex = prev.findIndex(s => s.name === file.name);
                        if (existingIndex > -1) {
                            const updatedLibrary = [...prev];
                            updatedLibrary[existingIndex] = { ...updatedLibrary[existingIndex], ...mockProps, key: detectedKey, energy: energy };
                            return updatedLibrary;
                        }
                        return [...prev, songWithDetails];
                    });
    
                    if (deck === 'A') {
                        if (deckAAudioRef.current.source) deckAAudioRef.current.source.stop();
                        deckAAudioRef.current = { ...deckAAudioRef.current, source: null, gainNode: null, buffer: audioBuffer };
                        setDeckA(d => ({ ...d, ...newDeckState, volume: d.volume, keyLock: d.keyLock, scratchModeEnabled: d.scratchModeEnabled })); // Preserve settings
                        resolve({ ...deckA, ...newDeckState });
                    } else {
                        if (deckBAudioRef.current.source) deckBAudioRef.current.source.stop();
                        deckBAudioRef.current = { ...deckBAudioRef.current, source: null, gainNode: null, buffer: audioBuffer };
                        setDeckB(d => ({ ...d, ...newDeckState, volume: d.volume, keyLock: d.keyLock, scratchModeEnabled: d.scratchModeEnabled })); // Preserve settings
                        resolve({ ...deckB, ...newDeckState });
                    }
                } catch(err) {
                    console.error("Error decoding audio data:", err);
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsArrayBuffer(file);
        });
    }, [deckA, deckB]);

    const addSongsToLibrary = useCallback((files: FileList) => {
        const newSongs: Song[] = Array.from(files).map(file => {
            const mockProps = getMockProperties(file.name);
            // We can't get loudness/energy without decoding, so they will be undefined here.
            // They will be calculated when the song is loaded into a deck.
            return {
                id: Date.now() + Math.random(),
                name: file.name,
                file: file,
                key: mockProps.key,
                genre: mockProps.genre,
                bpm: mockProps.bpm,
                energy: undefined, 
            };
        });

        setLibrary(prevLibrary => {
            const existingNames = new Set(prevLibrary.map(s => s.name));
            const uniqueNewSongs = newSongs.filter(s => !existingNames.has(s.name));
            if (uniqueNewSongs.length > 0) {
                return [...prevLibrary, ...uniqueNewSongs];
            }
            return prevLibrary;
        });
    }, []);
    
    const handleAddToQueue = useCallback((song: Song, deckId: 'A' | 'B', index?: number) => {
        const updateQueue = (prevQueue: Song[]) => {
            const newQueue = [...prevQueue];
            if (typeof index === 'number' && index >= 0 && index <= newQueue.length) {
                newQueue.splice(index, 0, song);
            } else {
                newQueue.push(song);
            }
            return newQueue;
        };
    
        if (deckId === 'A') {
            setQueueA(updateQueue);
        } else {
            setQueueB(updateQueue);
        }
    }, []);

    const handleRemoveFromQueue = useCallback((songId: number, deckId: 'A' | 'B') => {
        if (deckId === 'A') {
            setQueueA(prev => prev.filter(s => s.id !== songId));
        } else {
            setQueueB(prev => prev.filter(s => s.id !== songId));
        }
    }, []);

    const handleReorderQueue = useCallback((deckId: 'A' | 'B', dragIndex: number, hoverIndex: number) => {
        const reorder = (queue: Song[]) => {
            const newQueue = [...queue];
            const [draggedItem] = newQueue.splice(dragIndex, 1);
            newQueue.splice(hoverIndex, 0, draggedItem);
            return newQueue;
        };

        if (deckId === 'A') {
            setQueueA(reorder);
        } else {
            setQueueB(reorder);
        }
    }, []);

    const loadBeat = useCallback(async (file: File, category: 'drum' | 'tuning' | 'instrumental', padIndex: number) => {
        initAudioContext();
        if (!audioContextRef.current) return;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            try {
                const audioBuffer = await audioContextRef.current!.decodeAudioData(arrayBuffer.slice(0));
                const mockProps = getMockProperties(file.name);
                const beat: Beat = { 
                    id: Date.now(), 
                    name: file.name, 
                    file: file, 
                    audioBuffer,
                    arrayBuffer: arrayBuffer,
                    key: mockProps.key,
                    genre: mockProps.genre,
                    bpm: mockProps.bpm,
                };
                setBeats(prevBeats => {
                    const newCategoryBeats = [...(prevBeats[category] || Array(12).fill(null))];
                    newCategoryBeats[padIndex] = beat;
                    return { ...prevBeats, [category]: newCategoryBeats };
                });
                setLibrary(prev => [...prev.filter(s => s.name !== file.name), beat]);
            } catch (error) {
                console.error("Error decoding audio data for beat:", error);
            }
        };
        reader.readAsArrayBuffer(file);
    }, []);

    const playBeat = useCallback(async (beat: Beat, category: BeatCategoryType, padIndex: number) => {
        initAudioContext();
        if (!audioContextRef.current || !masterGainRef.current) return;

        let bufferToPlay = beat.audioBuffer;

        // Lazy decoding if audioBuffer is missing but arrayBuffer exists
        if (!bufferToPlay && beat.arrayBuffer) {
            try {
                const decodedBuffer = await audioContextRef.current.decodeAudioData(beat.arrayBuffer.slice(0));
                bufferToPlay = decodedBuffer;
                
                // Cache the decoded buffer back into the state for future plays
                setBeats(prevBeats => {
                    const newCategoryBeats = [...prevBeats[category]];
                    const beatToUpdate = newCategoryBeats[padIndex];
                    if (beatToUpdate) {
                        const updatedBeat: Beat = { ...beatToUpdate, audioBuffer: decodedBuffer };
                        newCategoryBeats[padIndex] = updatedBeat;
                    }
                    return { ...prevBeats, [category]: newCategoryBeats };
                });

            } catch (error) {
                console.error("Error decoding beat audio data on play:", error);
                return;
            }
        }

        if (!bufferToPlay) {
            console.error("No audio buffer available to play for beat:", beat.name);
            return;
        }

        const source = audioContextRef.current.createBufferSource();
        source.buffer = bufferToPlay;

        const gainNode = audioContextRef.current.createGain();
        gainNode.gain.value = beatVolumes[category] / 100;

        source.connect(gainNode);
        gainNode.connect(masterGainRef.current);
        source.start(0);
    }, [beatVolumes]);
    
    const handleBeatVolumeChange = (category: BeatCategoryType, volume: number) => {
        setBeatVolumes(prev => ({ ...prev, [category]: volume }));
    };

    const handleSaveBeats = useCallback(() => {
        saveBeatsToDB(beats).then(() => {
            alert("Beat kit saved successfully!");
        }).catch(err => {
            console.error("Failed to save beats:", err);
            alert("Error saving beats. See console for details.");
        });
    }, [beats]);
    
    const handleRemoveBeat = useCallback((category: BeatCategoryType, padIndex: number) => {
        setBeats(prevBeats => {
            const newCategoryBeats = [...prevBeats[category]];
            newCategoryBeats[padIndex] = null;
            return { ...prevBeats, [category]: newCategoryBeats };
        });
    }, []);
    
    const handleClearAllBeats = useCallback(() => {
        if (window.confirm("Are you sure you want to clear all loaded beats? This will also remove the saved kit.")) {
            setBeats({
                drum: Array(12).fill(null),
                tuning: Array(12).fill(null),
                instrumental: Array(12).fill(null)
            });
            clearBeatsInDB();
        }
    }, []);


    const togglePlay = (deck: 'A' | 'B', options?: { playbackRate?: number, forceStartTime?: number }) => {
        initAudioContext();
        
        const deckState = deck === 'A' ? deckA : deckB;
        const setDeckState = deck === 'A' ? setDeckA : setDeckB;
        const audioRef = deck === 'A' ? deckAAudioRef : deckBAudioRef;
        
        if (deckState.isPlaying) {
             audioRef.current.source?.stop();
             setDeckState(d => ({ ...d, isPlaying: false }));
        } else if (audioRef.current.buffer && audioRef.current.preFaderTap && audioRef.current.transitionNodes) {
            const newSource = audioContextRef.current!.createBufferSource();
            newSource.buffer = audioRef.current.buffer;
            
            const rate = options?.playbackRate ?? deckState.playbackRate;
            if(audioContextRef.current) {
                newSource.playbackRate.setValueAtTime(rate, audioContextRef.current.currentTime);
                const detuneValue = deckState.keyLock ? -1200 * Math.log2(rate) : 0;
                newSource.detune.setValueAtTime(detuneValue, audioContextRef.current.currentTime);
            } else {
                 newSource.playbackRate.value = rate;
                 const detuneValue = deckState.keyLock ? -1200 * Math.log2(rate) : 0;
                 newSource.detune.value = detuneValue;
            }
            
            const preampGainNode = audioContextRef.current!.createGain();
            preampGainNode.gain.value = mapGainKnobToFactor(deckState.gain);

            const faderGainNode = audioContextRef.current!.createGain();

            // Corrected audio routing:
            // Path 1: Source -> Preamp (Gain) -> Fader Gain -> Main Mix
            newSource.connect(preampGainNode);
            preampGainNode.connect(faderGainNode);
            faderGainNode.connect(audioRef.current.transitionNodes.entry);

            // Path 2: Preamp (Gain) -> Pre-Fader Tap (for cueing and analysis)
            preampGainNode.connect(audioRef.current.preFaderTap);


            audioRef.current.source = newSource;
            audioRef.current.gainNode = faderGainNode;
            
            updateAudioSourceLoop(deck, deckState.loop);

            const startTime = options?.forceStartTime ?? deckState.currentTime;
            newSource.start(0, startTime);
            setDeckState(d => ({ ...d, isPlaying: true, playbackRate: rate, lastUpdateTime: performance.now() }));
        }
    };
    
    const seekDeck = (deckId: 'A' | 'B', newTime: number) => {
        const deckState = deckId === 'A' ? deckA : deckB;
        const setDeckState = deckId === 'A' ? setDeckA : setDeckB;
        const audioRef = deckId === 'A' ? deckAAudioRef : deckBAudioRef;
    
        if (!deckState.song || !deckState.duration) return;
        const time = Math.max(0, Math.min(newTime, deckState.duration));
        
        let newViewStartRatio = deckState.viewStartRatio;
        if (deckState.zoom > 1) {
            const visibleRatio = 1 / deckState.zoom;
            const targetRatio = time / deckState.duration;
            newViewStartRatio = targetRatio - (visibleRatio / 2);
            newViewStartRatio = Math.max(0, Math.min(newViewStartRatio, 1 - visibleRatio));
        }
    
        setDeckState(d => ({ ...d, currentTime: time, viewStartRatio: newViewStartRatio }));
    
        if (deckState.isPlaying) {
          if (audioRef.current.source) {
              audioRef.current.source.stop();
          }
    
          const deckAnalyser = deckId === 'A' ? deckAAnalyserRef.current : deckBAnalyserRef.current;
          
          if (audioRef.current.buffer && audioRef.current.preFaderTap && deckAnalyser && audioRef.current.transitionNodes) {
              const newSource = audioContextRef.current!.createBufferSource();
              newSource.buffer = audioRef.current.buffer;
              newSource.playbackRate.value = deckState.playbackRate;
              const detuneValue = deckState.keyLock ? -1200 * Math.log2(deckState.playbackRate) : 0;
              newSource.detune.value = detuneValue;
              
              const preampGainNode = audioContextRef.current!.createGain();
              preampGainNode.gain.value = mapGainKnobToFactor(deckState.gain);

              const faderGainNode = audioContextRef.current!.createGain();
              
              // Corrected audio routing:
              // Path 1: Source -> Preamp (Gain) -> Fader Gain -> Main Mix
              newSource.connect(preampGainNode);
              preampGainNode.connect(faderGainNode);
              faderGainNode.connect(audioRef.current.transitionNodes.entry);

              // Path 2: Preamp (Gain) -> Pre-Fader Tap (for cueing and analysis)
              preampGainNode.connect(audioRef.current.preFaderTap);

              audioRef.current.source = newSource;
              audioRef.current.gainNode = faderGainNode;
              setDeckState(d => ({...d, lastUpdateTime: performance.now()}));
              updateAudioSourceLoop(deckId, deckState.loop);
              newSource.start(0, time);
          }
        }
    };

    const handlePitchChange = useCallback((deck: 'A' | 'B', newRate: number) => {
        const setDeck = deck === 'A' ? setDeckA : setDeckB;
        const audioRef = deck === 'A' ? deckAAudioRef : deckBAudioRef;

        setDeck(d => {
            if (audioRef.current.source && audioContextRef.current) {
                audioRef.current.source.playbackRate.setValueAtTime(newRate, audioContextRef.current.currentTime);
                const detuneValue = d.keyLock ? -1200 * Math.log2(newRate) : 0;
                audioRef.current.source.detune.setValueAtTime(detuneValue, audioContextRef.current.currentTime);
            }
            return { ...d, playbackRate: newRate };
        });
    }, []);
    
    const toggleKeyLock = (deckId: 'A' | 'B') => {
        const setDeck = deckId === 'A' ? setDeckA : setDeckB;
        const audioRef = deckId === 'A' ? deckAAudioRef : deckBAudioRef;
    
        setDeck(d => {
            const newKeyLockState = !d.keyLock;
            if (audioRef.current.source && audioContextRef.current) {
                const detuneValue = newKeyLockState ? -1200 * Math.log2(d.playbackRate) : 0;
                audioRef.current.source.detune.setValueAtTime(detuneValue, audioContextRef.current.currentTime);
            }
            return { ...d, keyLock: newKeyLockState };
        });
    };

    const updateLoop = useCallback(() => {
        const processDeck = (deckId: 'A' | 'B') => {
            const setDeckState = deckId === 'A' ? setDeckA : setDeckB;
            
            setDeckState(d => {
                if (!d.isPlaying || !d.lastUpdateTime) {
                    return d;
                }
    
                const elapsed = (performance.now() - d.lastUpdateTime) / 1000;
                let newTime = d.currentTime + elapsed * d.playbackRate;
                const newAngle = (d.platterAngle + 2 * d.playbackRate) % 360;
    
                if (d.loop.active && d.loop.start !== null && d.loop.end !== null && newTime >= d.loop.end) {
                    const loopDuration = d.loop.end - d.loop.start;
                    const timeOver = newTime - d.loop.end;
                    newTime = d.loop.start + (timeOver % loopDuration);
                    seekDeck(deckId, newTime); // Use seekDeck to handle audio source reset
                    return { ...d, platterAngle: newAngle, lastUpdateTime: performance.now() };
                }
    
                let newViewStartRatio = d.viewStartRatio;
                if (d.zoom > 1 && d.duration > 0) {
                    const visibleRatio = 1 / d.zoom;
                    const progressRatio = newTime / d.duration;
                    const viewEndRatio = d.viewStartRatio + visibleRatio;
    
                    if (progressRatio > viewEndRatio - (visibleRatio * 0.2) || progressRatio < d.viewStartRatio + (visibleRatio * 0.2)) {
                        newViewStartRatio = progressRatio - (visibleRatio / 2);
                        newViewStartRatio = Math.max(0, Math.min(newViewStartRatio, 1 - visibleRatio));
                    }
                }
    
                if (newTime >= d.duration) {
                    return { ...d, isPlaying: false, currentTime: d.duration };
                } else {
                    return { ...d, currentTime: newTime, platterAngle: newAngle, viewStartRatio: newViewStartRatio, lastUpdateTime: performance.now() };
                }
            });
        };
    
        processDeck('A');
        processDeck('B');
    
        if (deckAAnalyserRef.current) {
            const dataArray = new Uint8Array(deckAAnalyserRef.current.frequencyBinCount);
            deckAAnalyserRef.current.getByteFrequencyData(dataArray);
            setDeckAFrequencyData(dataArray);
        }
        if (deckBAnalyserRef.current) {
            const dataArray = new Uint8Array(deckBAnalyserRef.current.frequencyBinCount);
            deckBAnalyserRef.current.getByteFrequencyData(dataArray);
            setDeckBFrequencyData(dataArray);
        }
        if (analyserRef.current) {
            const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(dataArray);
            setFrequencyData(dataArray);
        }
    }, []);


    // --- LOOP LOGIC ---
    const updateAudioSourceLoop = (deckId: 'A' | 'B', loop: DeckState['loop']) => {
        const audioRef = deckId === 'A' ? deckAAudioRef : deckBAudioRef;
        if (audioRef.current.source) {
            audioRef.current.source.loop = loop.active;
            if (loop.active && loop.start !== null && loop.end !== null) {
                audioRef.current.source.loopStart = loop.start;
                audioRef.current.source.loopEnd = loop.end;
            }
        }
    };

    const handleSetLoop = (deckId: 'A' | 'B', type: 'in' | 'out' | 'exit' | 'reloop' | { beats: number }) => {
        const deckState = deckId === 'A' ? deckA : deckB;
        const setDeckState = deckId === 'A' ? setDeckA : setDeckB;

        if (typeof type === 'object') { // Auto loop
            if (!deckState.bpm) return;
            const beatDuration = 60 / deckState.bpm;
            const loopDuration = type.beats * beatDuration;
            const start = deckState.currentTime;
            const end = Math.min(start + loopDuration, deckState.duration);
            const newLoop = { start, end, active: true };
            setDeckState(d => ({...d, loop: newLoop}));
            updateAudioSourceLoop(deckId, newLoop);
            return;
        }

        if (type === 'in') {
            setDeckState(d => ({ ...d, loop: { ...d.loop, start: d.currentTime, end: null, active: false } }));
        } else if (type === 'out') {
            if (deckState.loop.start !== null && deckState.currentTime > deckState.loop.start) {
                const newLoop = { ...deckState.loop, end: deckState.currentTime, active: true };
                setDeckState(d => ({...d, loop: newLoop}));
                updateAudioSourceLoop(deckId, newLoop);
            }
        } else if (type === 'exit') {
            const newLoop = { ...deckState.loop, active: false };
            setDeckState(d => ({...d, loop: newLoop}));
            updateAudioSourceLoop(deckId, newLoop);
        } else if (type === 'reloop') {
             if (deckState.loop.start !== null && deckState.loop.end !== null) {
                const newLoop = { ...deckState.loop, active: true };
                setDeckState(d => ({...d, loop: newLoop}));
                updateAudioSourceLoop(deckId, newLoop);
            }
        }
    };
    
    // --- CUE POINT LOGIC ---
    const handleCueAction = (deckId: 'A' | 'B', type: 'set' | 'jump' | 'delete', cueIndex: number) => {
        const deckState = deckId === 'A' ? deckA : deckB;
        const setDeckState = deckId === 'A' ? setDeckA : setDeckB;

        if (!deckState.song) return;

        switch (type) {
            case 'set': {
                const newCues = [...deckState.cuePoints];
                newCues[cueIndex] = deckState.currentTime;
                setDeckState(d => ({ ...d, cuePoints: newCues }));
                break;
            }
            case 'jump': {
                const cueTime = deckState.cuePoints[cueIndex];
                if (typeof cueTime === 'number') {
                    seekDeck(deckId, cueTime);
                }
                break;
            }
            case 'delete': {
                const newCues = [...deckState.cuePoints];
                if (newCues[cueIndex] !== undefined) {
                    newCues[cueIndex] = undefined;
                    // Trim trailing undefined values from the array
                    while (newCues.length > 0 && newCues[newCues.length - 1] === undefined) {
                        newCues.pop();
                    }
                    setDeckState(d => ({ ...d, cuePoints: newCues }));
                }
                break;
            }
        }
    };

    // --- AUTO DJ LOGIC ---

    const getCompatibleKeys = (key: string): string[] => {
        if (!key) return [];
        const num = parseInt(key.slice(0, -1));
        const letter = key.slice(-1);
    
        const compatible: string[] = [];
    
        // Same number, different letter (e.g., 8A -> 8B)
        compatible.push(`${num}${letter === 'A' ? 'B' : 'A'}`);
    
        // One number up, same letter (e.g., 8A -> 9A)
        const nextNum = num === 12 ? 1 : num + 1;
        compatible.push(`${nextNum}${letter}`);
    
        // One number down, same letter (e.g., 8A -> 7A)
        const prevNum = num === 1 ? 12 : num - 1;
        compatible.push(`${prevNum}${letter}`);
    
        return compatible;
    };

    const getNextTrack = useCallback((avoidTrackId?: number): Song | null => {
        const activeDeckState = autoDjActiveDeck === 'A' ? deckA : deckB;
    
        // Handle queue source first, as it's an explicit user choice
        if (autoDjSettings.playlistSource === 'queues') {
            const nextDeckQueue = autoDjActiveDeck === 'A' ? queueB : queueA;
            if (nextDeckQueue.length > 0) {
                return nextDeckQueue[0];
            }
            // Fall back to library if the designated queue is empty and alert the user or log it.
        }
    
        // --- Library Source Logic ---
        if (library.length === 0) return null;
    
        const currentSongId = activeDeckState.song?.id;
    
        // --- Create Selection Pool with Tiered Fallbacks ---
    
        // Tier 1: Ideal tracks - unplayed in this session
        const historyIds = new Set(autoDjHistory.map(s => s.id));
        let selectionPool = library.filter(s => 
            !historyIds.has(s.id) &&
            s.id !== currentSongId && 
            s.id !== avoidTrackId
        );
    
        // Tier 2: If no unplayed tracks, use less-recently played tracks
        if (selectionPool.length === 0 && library.length > 1) {
            const recentHistoryCount = Math.ceil(autoDjHistory.length / 2);
            const recentHistoryIds = new Set(autoDjHistory.slice(0, recentHistoryCount).map(s => s.id));
            if (currentSongId) recentHistoryIds.add(currentSongId);
            if (avoidTrackId) recentHistoryIds.add(avoidTrackId);
    
            selectionPool = library.filter(s => !recentHistoryIds.has(s.id));
        }
    
        // Tier 3: If still no tracks (e.g., small library where all songs were recently played),
        // just avoid the current track. This allows repeats but avoids playing the same song back-to-back.
        if (selectionPool.length === 0 && library.length > 1) {
            selectionPool = library.filter(s => s.id !== currentSongId && s.id !== avoidTrackId);
        }
    
        // Tier 4: Ultimate fallback. If the pool is still empty (e.g. library has only 1-2 songs),
        // use the whole library, minus the track to avoid if 'repick' was used.
        if (selectionPool.length === 0) {
            selectionPool = library.filter(s => s.id !== avoidTrackId);
            if (selectionPool.length === 0) selectionPool = [...library];
        }
    
        if (selectionPool.length === 0) {
            return null; // Should only happen if library is empty, which is handled at the top.
        }
    
        // --- Apply User Criteria Filtering ---
        let filteredTracks = [...selectionPool];
        
        // Energy Flow
        if (autoDjSettings.energyFlow !== 'Any' && activeDeckState.song?.energy) {
            const currentEnergy = activeDeckState.song.energy;
            const energyMatches = filteredTracks.filter(s => {
                if (!s.energy) return true; // Don't filter out songs without energy data
                switch (autoDjSettings.energyFlow) {
                    case 'Maintain': return Math.abs(s.energy - currentEnergy) <= 2;
                    case 'Increase': return s.energy > currentEnergy;
                    case 'Decrease': return s.energy < currentEnergy;
                    default: return true;
                }
            });
            if (energyMatches.length > 0) filteredTracks = energyMatches;
        }
    
        // Avoid repeating artist
        if (autoDjSettings.avoidRepeatingArtist && activeDeckState.song?.name) {
            const currentArtist = getArtistFromName(activeDeckState.song.name);
            if (currentArtist) {
                const artistMatches = filteredTracks.filter(s => {
                    const nextArtist = getArtistFromName(s.name);
                    return !nextArtist || nextArtist.toLowerCase() !== currentArtist.toLowerCase();
                });
                if (artistMatches.length > 0) filteredTracks = artistMatches;
            }
        }
    
        // BPM Match
        if (autoDjSettings.bpmMatch.enabled && activeDeckState.song?.bpm) {
            const { bpm } = activeDeckState.song;
            const { range } = autoDjSettings.bpmMatch;
            const bpmMatches = filteredTracks.filter(s => s.bpm && s.bpm >= bpm - range && s.bpm <= bpm + range);
            if (bpmMatches.length > 0) filteredTracks = bpmMatches;
        }
    
        // Genre Match
        if (autoDjSettings.genreMatch && activeDeckState.song?.genre) {
            const { genre } = activeDeckState.song;
            const genreMatches = filteredTracks.filter(s => s.genre === genre);
            if (genreMatches.length > 0) filteredTracks = genreMatches;
        }
    
        // Harmonic Mix logic
        if (autoDjSettings.harmonicMix && activeDeckState.song?.key) {
            const compatibleKeys = getCompatibleKeys(activeDeckState.song.key);
            const harmonicMatches = filteredTracks.filter(s => s.key && compatibleKeys.includes(s.key));
            if (harmonicMatches.length > 0) filteredTracks = harmonicMatches;
        }
        
        // If criteria filters found matches, use them. Otherwise, fall back to the tiered pool.
        const finalSelectionPool = filteredTracks.length > 0 ? filteredTracks : selectionPool;
    
        // --- Final Selection ---
        if (autoDjSettings.shuffle) {
            const randomIndex = Math.floor(Math.random() * finalSelectionPool.length);
            return finalSelectionPool[randomIndex];
        } else {
            // Find the index of the current song in the main library to determine the next sequential track
            const currentSongIndex = library.findIndex(s => s.id === currentSongId);
            if (currentSongIndex > -1) {
                // Iterate through the main library order to find the first song that's in our selection pool
                for (let i = 1; i <= library.length; i++) {
                    const nextIndex = (currentSongIndex + i) % library.length;
                    const nextSongInLibrary = library[nextIndex];
                    const match = finalSelectionPool.find(p => p.id === nextSongInLibrary.id);
                    if (match) return match;
                }
            }
            // Fallback if sequential logic fails (e.g., current song not in library or no matches)
            return finalSelectionPool[0];
        }
    }, [library, queueA, queueB, deckA.song, deckB.song, autoDjActiveDeck, autoDjSettings, autoDjHistory]);

    const startTransition = useCallback(async (nextTrack: Song) => {
        if (transitionIntervalRef.current) clearInterval(transitionIntervalRef.current);
        if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
        setNextAutoDjTrack(null);
    
        const fromDeck = autoDjActiveDeck;
        const toDeck = fromDeck === 'A' ? 'B' : 'A';
        const fromAudioRef = fromDeck === 'A' ? deckAAudioRef : deckBAudioRef;
        const toAudioRef = toDeck === 'A' ? deckAAudioRef : deckBAudioRef;
        const fromDeckState = fromDeck === 'A' ? deckA : deckB;
        const setFromDeckState = fromDeck === 'A' ? setDeckA : setDeckB;
        const setToDeckState = toDeck === 'A' ? setDeckA : setDeckB;
    
        const { autoGain, beatMatch } = autoDjSettings;
        let { transitionType, transitionDuration } = autoDjSettings;

        const finishTransition = () => {
            if (transitionIntervalRef.current) clearInterval(transitionIntervalRef.current);
            transitionIntervalRef.current = null;
            if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
            transitionTimeoutRef.current = null;
    
            togglePlay(fromDeck);
            setFromDeckState(d => ({ ...d, currentTime: 0, song: null, waveform: undefined, isPlaying: false, loop: { start: null, end: null, active: false }, volume: 0.75 }));
    
            const now = audioContextRef.current?.currentTime ?? 0;
            [fromAudioRef, toAudioRef].forEach(audioRef => {
                if (audioRef.current.transitionNodes) {
                    const { eqFadeFilter, highPassFilter, lowPassFilter } = audioRef.current.transitionNodes;
                    eqFadeFilter.gain.setValueAtTime(0, now);
                    highPassFilter.frequency.setValueAtTime(10, now);
                    lowPassFilter.frequency.setValueAtTime(22050, now);
                }
            });
    
            setCrossfader(fromDeck === 'A' ? 1 : -1);
            if (beatMatch) {
                handlePitchChange(toDeck, 1.0); // Reset pitch after transition
            }
            
            setAutoDjActiveDeck(toDeck);
            if (fromDeckState.song) {
                setAutoDjHistory(prev => [fromDeckState.song!, ...prev]);
            }
            if (autoDjSettings.playlistSource === 'queues') {
                (toDeck === 'A' ? setQueueA : setQueueB)(q => q.slice(1));
            }
            setIsTransitioning(false);
        };

        // --- Smart Transition Logic ---
        if (transitionType === 'Smart') {
            const fromSong = fromDeckState.song;
            if (fromSong && nextTrack) {
                const energyDiff = Math.abs((fromSong.energy || 5) - (nextTrack.energy || 5));
                const genreMatch = fromSong.genre === nextTrack.genre;
                
                if (genreMatch && energyDiff <= 2) {
                    transitionType = 'Filter Fade'; // Smooth blend for similar tracks
                    transitionDuration = 12;
                } else if (energyDiff > 4) {
                    transitionType = 'EQ Fade'; // Bass swap for energy change
                    transitionDuration = 8;
                } else {
                    transitionType = 'Crossfade'; // Default safe transition
                    transitionDuration = 6;
                }
            } else {
                transitionType = 'Crossfade'; // Fallback
            }
        }
    
        if (transitionType === 'Loop Out' && fromDeckState.bpm) {
            const beatDuration = 60 / fromDeckState.bpm;
            const loopDuration = 4 * beatDuration;
            const loopStartTime = fromDeckState.currentTime;
            const loopEndTime = loopStartTime + loopDuration;
            const newLoop = { start: loopStartTime, end: Math.min(loopEndTime, fromDeckState.duration), active: true };
            setFromDeckState(d => ({ ...d, loop: newLoop }));
            updateAudioSourceLoop(fromDeck, newLoop);
        }
    
        const newToDeckState = await loadSong(nextTrack.file, toDeck);
        if (!newToDeckState) {
            setIsTransitioning(false);
            return;
        }
    
        const fromDeckStartVolume = fromDeckState.volume;
        let toDeckStartVolume = newToDeckState.volume;
    
        if (autoGain) {
            const fromLoudness = fromDeckState.perceivedLoudness;
            const toLoudness = newToDeckState.perceivedLoudness;
    
            if (fromLoudness && toLoudness && toLoudness > 0) {
                const gainFactor = fromLoudness / toLoudness;
                const cappedGain = Math.max(0.5, Math.min(1.5, gainFactor));
                toDeckStartVolume = 0.75 * cappedGain;
            }
        }
    
        setToDeckState(d => ({ ...d, volume: toDeckStartVolume }));
        
        let targetPlaybackRate = 1.0;
        if (beatMatch && fromDeckState.song?.bpm && nextTrack?.bpm && nextTrack.bpm > 0) {
            const bpmRatio = fromDeckState.song.bpm / nextTrack.bpm;
            targetPlaybackRate = bpmRatio;
            handlePitchChange(toDeck, bpmRatio);
        } else {
            handlePitchChange(toDeck, 1.0);
        }
    
        togglePlay(toDeck, { playbackRate: targetPlaybackRate, forceStartTime: 0 });
    
        const durationMs = transitionDuration * 1000;
        const steps = durationMs / 50;
        let step = 0;
    
        if (transitionType === 'Cut') {
            setCrossfader(fromDeck === 'A' ? 1 : -1);
            if (transitionTimeoutRef.current) clearTimeout(transitionTimeoutRef.current);
            transitionTimeoutRef.current = setTimeout(finishTransition, 1000);
            return;
        }
    
        transitionIntervalRef.current = setInterval(() => {
            if (!audioContextRef.current) return;
            step++;
            const progress = Math.min(1, step / steps);
            const now = audioContextRef.current!.currentTime;
            const rampTime = now + 0.05;
    
            if (transitionType === 'Fade In/Out') {
                setCrossfader(0);
                setFromDeckState(d => ({ ...d, volume: fromDeckStartVolume * (1 - progress) }));
                setToDeckState(d => ({ ...d, volume: toDeckStartVolume * progress }));
            } else {
                const direction = fromDeck === 'A' ? 1 : -1;
                const startValue = -direction;
                setCrossfader(startValue + (progress * 2 * direction));
    
                if (transitionType === 'EQ Fade') {
                    if (fromAudioRef.current.transitionNodes) {
                        const bassCutDB = -30;
                        fromAudioRef.current.transitionNodes.eqFadeFilter.gain.linearRampToValueAtTime(bassCutDB * progress, rampTime);
                    }
                } else if (transitionType === 'Filter Fade') {
                    if (fromAudioRef.current.transitionNodes) {
                        const highPassEndFreq = 18000;
                        const highPassFreq = 10 + (progress * highPassEndFreq);
                        fromAudioRef.current.transitionNodes.highPassFilter.frequency.linearRampToValueAtTime(highPassFreq, rampTime);
                    }
                    if (toAudioRef.current.transitionNodes) {
                        const lowPassStartFreq = 350;
                        const lowPassEndFreq = 22050;
                        const lowPassFreq = lowPassStartFreq + (progress * (lowPassEndFreq - lowPassStartFreq));
                        toAudioRef.current.transitionNodes.lowPassFilter.frequency.linearRampToValueAtTime(lowPassFreq, rampTime);
                    }
                }
            }
    
            if (step >= steps) {
                if (transitionType === 'Fade In/Out') {
                    setFromDeckState(d => ({ ...d, volume: 0 }));
                    setToDeckState(d => ({ ...d, volume: toDeckStartVolume }));
                }
                finishTransition();
            }
        }, 50);
    
    }, [autoDjActiveDeck, autoDjSettings, loadSong, deckA, deckB, getNextTrack, handlePitchChange]);

    const activeSongIdRef = useRef<number | null>(null);
    useEffect(() => {
        if (!isAutoDjEnabled) {
            return;
        }

        const activeDeckState = autoDjActiveDeck === 'A' ? deckA : deckB;
        const activeSongId = activeDeckState.song?.id;

        // When a new song starts playing, pick the next one
        if (activeSongId && activeSongId !== activeSongIdRef.current) {
            activeSongIdRef.current = activeSongId;
            const nextUp = getNextTrack();
            setNextAutoDjTrack(nextUp);
        }

        const triggerPoint = autoDjSettings.transitionTrigger;
    
        if (
            activeDeckState.isPlaying &&
            activeDeckState.duration > 0 &&
            (activeDeckState.duration - activeDeckState.currentTime) < triggerPoint &&
            !transitionIntervalRef.current && !isTransitioning
        ) {
            const trackToPlay = nextAutoDjTrack;
            if (trackToPlay) {
                setIsTransitioning(true);
                startTransition(trackToPlay);
            } else {
                 const fallbackTrack = getNextTrack();
                 if (fallbackTrack) {
                    setIsTransitioning(true);
                    startTransition(fallbackTrack);
                 } else {
                    setIsAutoDjEnabled(false);
                 }
            }
        }
    
    }, [isAutoDjEnabled, isTransitioning, deckA, deckB, autoDjActiveDeck, autoDjSettings.transitionTrigger, nextAutoDjTrack, getNextTrack, startTransition, setIsAutoDjEnabled]);

    const handleAutoDjRepick = () => {
        if (!isAutoDjEnabled || !nextAutoDjTrack) return;
        const newNextTrack = getNextTrack(nextAutoDjTrack.id);
        setNextAutoDjTrack(newNextTrack);
    };

    const handleAutoDjSkip = () => {
        if (!isAutoDjEnabled || isTransitioning || !nextAutoDjTrack) return;
        setIsTransitioning(true);
        startTransition(nextAutoDjTrack);
    };

    const handleSmartSuggest = async () => {
        setIsSuggestingTrack(true);
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            const activeDeckState = autoDjActiveDeck === 'A' ? deckA : deckB;
    
            if (!activeDeckState.song || library.length < 2) {
                alert("Cannot generate suggestion: Need a playing track and at least two songs in the library.");
                return;
            }
    
            const currentTrackInfo = {
                name: activeDeckState.song.name,
                genre: activeDeckState.song.genre,
                bpm: activeDeckState.song.bpm,
                key: activeDeckState.song.key,
                energy: activeDeckState.song.energy,
            };
    
            const libraryInfo = library
                .filter(s => s.id !== activeDeckState.song?.id)
                .map(s => ({ name: s.name, genre: s.genre, bpm: s.bpm, key: s.key, energy: s.energy }));

            if (libraryInfo.length === 0) {
                 alert("Not enough unique tracks in the library to make a suggestion.");
                 return;
            }
    
            const prompt = `You are an expert DJ with deep knowledge of music theory, harmonic mixing (using the Camelot wheel system), and creating smooth, energetic DJ sets. Your task is to select the best next track to play from a list of available songs.

The currently playing track is:
${JSON.stringify(currentTrackInfo, null, 2)}

The available tracks in the library are:
${JSON.stringify(libraryInfo, null, 2)}

Consider the following criteria for your choice:
1.  **Harmonic Compatibility:** Prioritize tracks that are harmonically compatible with the current track's key ('${currentTrackInfo.key}'). Good matches are the same key, one key up/down, or the relative major/minor.
2.  **Energy Flow:** The current track has an energy level of ${currentTrackInfo.energy}/10. Decide if it's best to maintain, increase, or decrease the energy.
3.  **BPM:** The current track's BPM is ${currentTrackInfo.bpm}. The next track should have a similar BPM, ideally within a 5% range.
4.  **Genre:** Maintain a consistent genre or transition smoothly to a related genre. Avoid jarring genre jumps.

Based on these criteria, choose the single best track from the library to play next. Your response MUST be a JSON object with a single key "trackName", containing the exact 'name' of your chosen song from the library list.`;
    
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: {
                            trackName: {
                                type: Type.STRING,
                                description: 'The exact name of the suggested track from the library.',
                            },
                        },
                        required: ['trackName'],
                    },
                },
            });
    
            const responseText = response.text.trim();
            const result = JSON.parse(responseText);
            
            if (result.trackName) {
                const suggestedSong = library.find(s => s.name === result.trackName);
                if (suggestedSong) {
                    setNextAutoDjTrack(suggestedSong);
                } else {
                    console.error("Gemini suggested a track not found in the library:", result.trackName);
                    alert("AI suggestion was invalid. Please try again.");
                }
            }

        } catch (error) {
            console.error("Error calling Gemini API:", error);
            alert("Failed to get a smart suggestion. Please check the console for details.");
        } finally {
            setIsSuggestingTrack(false);
        }
    };

    const abortAutoDj = useCallback(() => {
        if (transitionIntervalRef.current) {
            clearInterval(transitionIntervalRef.current);
            transitionIntervalRef.current = null;
        }
        if (transitionTimeoutRef.current) {
            clearTimeout(transitionTimeoutRef.current);
            transitionTimeoutRef.current = null;
        }
        setIsTransitioning(false);

        const now = audioContextRef.current?.currentTime ?? 0;

        [deckAAudioRef, deckBAudioRef].forEach(audioRef => {
            if (audioRef.current.transitionNodes) {
                const { eqFadeFilter, highPassFilter, lowPassFilter } = audioRef.current.transitionNodes;
                eqFadeFilter.gain.setValueAtTime(0, now);
                highPassFilter.frequency.setValueAtTime(10, now);
                lowPassFilter.frequency.setValueAtTime(22050, now);
            }
        });

        if (deckA.song) handlePitchChange('A', 1.0);
        if (deckB.song) handlePitchChange('B', 1.0);
        
        setCrossfader(0);
        setDeckA(d => ({ ...d, volume: 0.75 }));
        setDeckB(d => ({ ...d, volume: 0.75 }));

        activeSongIdRef.current = null;
        setNextAutoDjTrack(null);
    }, [deckA.song, deckB.song, handlePitchChange]);


    const toggleAutoDj = async () => {
        const nextState = !isAutoDjEnabled;
        setIsAutoDjEnabled(nextState);
    
        if (nextState) {
            setAutoDjHistory([]); // Clear history on start
            const startingTrack = getNextTrack();
            if (!startingTrack) {
                 alert("No available tracks to start Auto DJ.");
                 setIsAutoDjEnabled(false);
                 return;
            }
            
            setCrossfader(autoDjSettings.transitionType === 'Fade In/Out' ? 0 : -1);
            setDeckA(d => ({ ...d, volume: 0.75 }));
            setDeckB(d => ({ ...d, volume: 0.75 }));

            await loadSong(startingTrack.file, 'A');
            togglePlay('A', { forceStartTime: 0 });
            setAutoDjActiveDeck('A');
            
            if(autoDjSettings.playlistSource === 'queues') {
                setQueueA(q => q.slice(1));
            }

        } else {
            abortAutoDj();
        }
    };

    useEffect(() => {
        let animationFrameId: number;
        const animationLoop = () => {
            updateLoop();
            animationFrameId = requestAnimationFrame(animationLoop);
        };
        animationFrameId = requestAnimationFrame(animationLoop);
        return () => cancelAnimationFrame(animationFrameId);
    }, [updateLoop]);
    
    const setDeckAVolume = (volume: number) => setDeckA(d => ({ ...d, volume }));
    const setDeckBVolume = (volume: number) => setDeckB(d => ({ ...d, volume }));
    const setDeckAGain = (gain: number) => setDeckA(d => ({ ...d, gain }));
    const setDeckBGain = (gain: number) => setDeckB(d => ({ ...d, gain }));


    const handleZoomChange = (deckId: 'A' | 'B', newZoom: number, pointerRatioInView?: number) => {
        const setDeck = deckId === 'A' ? setDeckA : setDeckB;
        const deckState = deckId === 'A' ? deckA : deckB;
        const maxZoom = 64; // Increased max zoom
        const clampedZoom = Math.max(1, Math.min(newZoom, maxZoom));
    
        if (Math.abs(clampedZoom - deckState.zoom) < 0.01) return; // Avoid tiny updates
    
        let newViewStartRatio = deckState.viewStartRatio;
        const visibleRatioOld = 1 / deckState.zoom;
        const visibleRatioNew = 1 / clampedZoom;
    
        if (typeof pointerRatioInView === 'number' && pointerRatioInView >= 0 && pointerRatioInView <= 1) {
            // Zoom towards the pointer's position
            // First, find the absolute ratio in the whole song that the pointer is on
            const pointerTimeRatio = deckState.viewStartRatio + (pointerRatioInView * visibleRatioOld);
            // Then, calculate the new view start ratio to keep that point under the pointer
            newViewStartRatio = pointerTimeRatio - (pointerRatioInView * visibleRatioNew);
        } else {
            // Default to zooming towards the center of the current view
            const centerPointRatio = deckState.viewStartRatio + (visibleRatioOld / 2);
            newViewStartRatio = centerPointRatio - (visibleRatioNew / 2);
        }
    
        // Clamp the new start ratio to be within valid bounds [0, 1 - visibleRatio]
        newViewStartRatio = Math.max(0, Math.min(newViewStartRatio, 1 - visibleRatioNew));
    
        setDeck(d => ({ ...d, zoom: clampedZoom, viewStartRatio: newViewStartRatio }));
    };
    
    const handleScrollChange = (deckId: 'A' | 'B', scrollDeltaRatio: number) => {
        const setDeck = deckId === 'A' ? setDeckA : setDeckB;
        setDeck(d => {
            if (d.zoom <= 1) return d; // No scrolling if not zoomed
            const visibleRatio = 1 / d.zoom;
            // A positive scrollDeltaRatio means dragging left-to-right, so we decrease the view start ratio
            const newViewStartRatio = d.viewStartRatio - scrollDeltaRatio;
            const clampedViewStartRatio = Math.max(0, Math.min(newViewStartRatio, 1 - visibleRatio));
            return { ...d, viewStartRatio: clampedViewStartRatio };
        });
    };
    
     // --- AI Hype Man Logic ---
     const handleGenerateHype = async () => {
        setIsGeneratingHype(true);
        setHypeText('');
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
            const activeDeckState = isAutoDjEnabled ? (autoDjActiveDeck === 'A' ? deckA : deckB) : (deckA.isPlaying ? deckA : deckB);

            if (!activeDeckState.song) {
                setHypeText("Load up a track before you get the party started!");
                return;
            }
            
            const artist = getArtistFromName(activeDeckState.song.name) || 'an incredible artist';

            const prompt = `You are a fun, high-energy party DJ and hype man. The current track is "${activeDeckState.song.name}" which is a ${activeDeckState.song.genre} tune with a BPM of ${activeDeckState.song.bpm} and an energy level of ${activeDeckState.song.energy}/10.

Generate a short, funny, and energetic hype phrase (1-2 sentences) to shout out on the microphone. Make it sound cool and natural for a party. Be creative!`;

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
            });

            setHypeText(response.text.replace(/"/g, ''));
        } catch (error) {
            console.error("Error calling Gemini API for Hype Man:", error);
            setHypeText("Oops! My hype generator is taking a break. Try again in a moment!");
        } finally {
            setIsGeneratingHype(false);
        }
    };
    
    // --- Vocal FX Logic ---
    const toggleMic = async (enable: boolean) => {
        initAudioContext();
        if (enable) {
            if (micStreamRef.current) return;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                micStreamRef.current = stream;
                micSourceNodeRef.current = audioContextRef.current!.createMediaStreamSource(stream);
                micSourceNodeRef.current.connect(micGainRef.current!);
                setIsMicEnabled(true);
            } catch (err) {
                console.error("Microphone access denied:", err);
            }
        } else {
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(track => track.stop());
                micStreamRef.current = null;
            }
            if(micSourceNodeRef.current) {
                micSourceNodeRef.current.disconnect();
                micSourceNodeRef.current = null;
            }
            setIsMicEnabled(false);
        }
    };

    const handleMicTalk = (isTalking: boolean) => {
        if (isMicEnabled && micGainRef.current && audioContextRef.current) {
            const targetGain = isTalking ? 1.0 : 0.0;
            micGainRef.current.gain.linearRampToValueAtTime(targetGain, audioContextRef.current.currentTime + 0.05);
        }
    };

    useEffect(() => {
        if (micFilterRef.current && audioContextRef.current) {
            const minFreq = 40;
            const maxFreq = audioContextRef.current.sampleRate / 2;
            const logMin = Math.log(minFreq);
            const logMax = Math.log(maxFreq);
            const logFreq = logMin + (micFilter / 100) * (logMax - logMin);
            micFilterRef.current.frequency.setValueAtTime(Math.exp(logFreq), audioContextRef.current.currentTime);
            micFilterRef.current.Q.value = 5;
        }
    }, [micFilter]);
    
    useEffect(() => {
        if (micReverbInputRef.current && fxNodesRef.current['Reverb']?.input && audioContextRef.current) {
            const reverbNode = fxNodesRef.current['Reverb'] as FxNodes & { delay1: DelayNode, delay2: DelayNode };
            if (!reverbNode) return;
            
            reverbNode.wet.gain.value = 1;
            reverbNode.dry.gain.value = 0;
            const decay = 0.5 + (micReverb / 100) * 3;
            reverbNode.delay1.delayTime.value = decay * 0.75;
            reverbNode.delay2.delayTime.value = decay;
            
            const mix = micReverb / 100;
            const dryGain = 1 - mix;
            const wetGain = mix;
            
            micReverbInputRef.current.disconnect();
            const dryNode = audioContextRef.current.createGain();
            dryNode.gain.value = dryGain;
            micReverbInputRef.current.connect(dryNode);
            dryNode.connect(masterGainRef.current!);
            
            const wetNode = audioContextRef.current.createGain();
            wetNode.gain.value = wetGain;
            micReverbInputRef.current.connect(wetNode);
            wetNode.connect(reverbNode.input);
        }
    }, [micReverb]);
    
    // --- Sampler Logic ---
    const generateSamplerSounds = (context: AudioContext) => {
        // 1. Air Horn (White noise with envelope)
        const hornBuffer = context.createBuffer(1, context.sampleRate * 1.5, context.sampleRate);
        const hornData = hornBuffer.getChannelData(0);
        for (let i = 0; i < hornData.length; i++) {
            hornData[i] = Math.random() * 2 - 1;
        }
        samplerBuffers.current.push(hornBuffer);

        // 2. Laser (Sine wave sweep)
        const laserBuffer = context.createBuffer(1, context.sampleRate * 0.5, context.sampleRate);
        const laserData = laserBuffer.getChannelData(0);
        for (let i = 0; i < laserData.length; i++) {
            const progress = i / laserData.length;
            const freq = 1200 - progress * 1000;
            laserData[i] = Math.sin(i / context.sampleRate * 2 * Math.PI * freq);
        }
        samplerBuffers.current.push(laserBuffer);

        // 3. Clap (Sharp noise burst)
        const clapBuffer = context.createBuffer(1, context.sampleRate * 0.2, context.sampleRate);
        const clapData = clapBuffer.getChannelData(0);
        for(let i = 0; i < context.sampleRate * 0.05; i++){
            clapData[i] = Math.random() * 2 - 1;
        }
        samplerBuffers.current.push(clapBuffer);
        
        // 4. Record Scratch (Modulated noise)
        const scratchBuffer = context.createBuffer(1, context.sampleRate * 0.4, context.sampleRate);
        const scratchData = scratchBuffer.getChannelData(0);
        for (let i = 0; i < scratchData.length; i++) {
            const progress = i / scratchData.length;
            const modFreq = 20 * Math.sin(progress * Math.PI * 4); // Fast sine wave
            scratchData[i] = (Math.random() * 2 - 1) * (1-progress) * Math.sin(i / context.sampleRate * 2 * Math.PI * modFreq);
        }
        samplerBuffers.current.push(scratchBuffer);
    };

    const playSample = (index: number) => {
        initAudioContext();
        if (!audioContextRef.current || !samplerGainRef.current || !samplerBuffers.current[index]) return;
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = samplerBuffers.current[index];
        
        const gainNode = audioContextRef.current.createGain();
        const mainVol = samplerVolume / 100;
        gainNode.gain.value = mainVol;
        
        // Special case for Air Horn to fade out
        if (index === 0) {
            gainNode.gain.setValueAtTime(mainVol, audioContextRef.current.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContextRef.current.currentTime + 1.5);
        }
        
        source.connect(gainNode);
        gainNode.connect(samplerGainRef.current);
        source.start(0);
    };

    const playDrumSample = (index: number) => {
        initAudioContext();
        if (!audioContextRef.current || !samplerGainRef.current || !drumSampleBuffers.current[index]) return;
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = drumSampleBuffers.current[index];
        
        source.connect(samplerGainRef.current); // Use main sampler gain
        source.start(0);
    };

    const themeClass = theme === 'rainbow' ? 'rainbow-theme-bg' : 'black-theme-bg';

    const toggleScratchMode = (deckId: 'A' | 'B') => {
        const setDeck = deckId === 'A' ? setDeckA : setDeckB;
        setDeck(d => ({ ...d, scratchModeEnabled: !d.scratchModeEnabled }));
    };

    const handlePlatterInteraction = (deckId: 'A' | 'B', type: 'start' | 'drag' | 'end', data?: { movementX: number }) => {
        if (!audioContextRef.current) return;
    
        const setDeckState = deckId === 'A' ? setDeckA : setDeckB;
        const audioRef = deckId === 'A' ? deckAAudioRef : deckBAudioRef;
    
        if (type === 'start') {
            setDeckState(d => {
                if (!d.scratchModeEnabled || !d.song) return d;
                
                const wasPlaying = d.isPlaying;
                if (wasPlaying) {
                    audioRef.current.source?.stop();
                }
    
                audioRef.current.scratchNoiseGain?.gain.linearRampToValueAtTime(0.5, audioContextRef.current!.currentTime + 0.05);
    
                return { ...d, wasPlayingBeforeScratch: wasPlaying, isPlaying: false };
            });
        } else if (type === 'drag' && data) {
            setDeckState(d => {
                if (!d.scratchModeEnabled || !d.song) return d;
    
                const scratchSensitivity = 0.005;
                const deltaTime = data.movementX * scratchSensitivity;
                const newTime = Math.max(0, Math.min(d.duration, d.currentTime + deltaTime));
                const angleChange = data.movementX * 2;
    
                if (audioRef.current.scratchNoiseFilter && audioRef.current.scratchNoiseGain) {
                    const velocity = Math.abs(data.movementX);
                    const filterFreq = Math.min(4000, 200 + velocity * 150);
                    const gainValue = Math.min(0.6, 0.1 + velocity * 0.05);
                    const now = audioContextRef.current!.currentTime;
                    audioRef.current.scratchNoiseFilter.frequency.setTargetAtTime(filterFreq, now, 0.01);
                    audioRef.current.scratchNoiseGain.gain.setTargetAtTime(gainValue, now, 0.01);
                }
    
                if (audioRef.current.buffer && audioRef.current.gainNode) {
                    if (audioRef.current.scratchSnippetSource) {
                        try { audioRef.current.scratchSnippetSource.stop(); } catch (e) { /* ignore */ }
                    }
    
                    const snippetSource = audioContextRef.current!.createBufferSource();
                    snippetSource.buffer = audioRef.current.buffer;
                    
                    const rate = d.playbackRate;
                    snippetSource.playbackRate.value = rate;
                    const detuneValue = d.keyLock ? -1200 * Math.log2(rate) : 0;
                    snippetSource.detune.value = detuneValue;
    
                    snippetSource.connect(audioRef.current.gainNode);
                    snippetSource.start(0, newTime, 0.075);
                    audioRef.current.scratchSnippetSource = snippetSource;
                }
    
                return { 
                    ...d, 
                    currentTime: newTime,
                    platterAngle: (d.platterAngle + angleChange) % 360
                };
            });
        } else if (type === 'end') {
            setDeckState(d => {
                if (!d.scratchModeEnabled || !d.song) return d;
                
                audioRef.current.scratchNoiseGain?.gain.linearRampToValueAtTime(0, audioContextRef.current!.currentTime + 0.1);
                if (audioRef.current.scratchSnippetSource) {
                    try { audioRef.current.scratchSnippetSource.stop(); } catch(e) { /* ignore */ }
                    audioRef.current.scratchSnippetSource = null;
                }
    
                if (d.wasPlayingBeforeScratch) {
                    // Use setTimeout to defer the playback command, ensuring it runs after the current state update is processed.
                    setTimeout(() => {
                        togglePlay(deckId, { forceStartTime: d.currentTime, playbackRate: d.playbackRate });
                    }, 0);
                }
    
                return { ...d, wasPlayingBeforeScratch: false };
            });
        }
    };

    return (
        <div className={`min-h-screen ${themeClass} text-white p-4 flex flex-col gap-4 font-sans`}>
            <header className="flex justify-between items-center">
                <h1 className="text-3xl font-bold tracking-tight title-text">Pro DJ Remix Studio</h1>
                <div className="flex items-center gap-4">
                    <ThemeToggle currentTheme={theme} setTheme={setTheme} />
                    <LayoutToggle currentLayout={layout} setLayout={setLayout} />
                    <button
                        onClick={handleToggleMidiPanel}
                        className={`p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-cyan-400 ${
                            isMidiPanelVisible
                                ? 'rainbow-gradient-bg text-white shadow-md'
                                : 'bg-black/30 backdrop-blur-md text-gray-300 hover:bg-gray-700/50 hover:text-white'
                        }`}
                        title="Toggle MIDI Controls"
                        aria-pressed={isMidiPanelVisible}
                    >
                        <MidiIcon className="w-6 h-6" />
                    </button>
                </div>
            </header>
            <main className={`flex gap-4 ${layout === 'library' ? 'flex-row' : 'flex-col xl:flex-row'} ${layout !== 'library' ? 'flex-grow min-h-0' : ''}`}>
                <div className="flex flex-col gap-4 min-w-[300px] relative xl:flex-1">
                    <Deck deckId="A" deckState={deckA} setDeckState={setDeckA} loadSong={loadSong} togglePlay={togglePlay} onPitchChange={handlePitchChange} seekDeck={seekDeck} isAutoDjEnabled={isAutoDjEnabled} frequencyData={deckAFrequencyData} onZoomChange={handleZoomChange} onScrollChange={handleScrollChange} layout={layout} onToggleBrowser={() => setIsDeckABrowserVisible(v => !v)} toggleKeyLock={toggleKeyLock} onToggleScratchMode={toggleScratchMode} onPlatterInteraction={handlePlatterInteraction} />
                    <div className={layout === 'library' ? 'hidden' : ''}>
                        <PerformancePads deckId="A" deckState={deckA} onCueAction={handleCueAction} onLoopSet={handleSetLoop} onPlayDrumSample={playDrumSample} />
                    </div>
                    {isDeckABrowserVisible && layout !== 'library' && (
                        <DeckLibraryBrowser
                            deckId="A"
                            library={library}
                            queue={queueA}
                            loadSong={loadSong}
                            onClose={() => setIsDeckABrowserVisible(false)}
                        />
                    )}
                </div>

                <div className={`flex flex-col gap-4 transition-all duration-300 ${layout === 'library' ? 'w-[450px]' : 'w-full xl:w-[550px]'} flex-1 xl:flex-initial overflow-y-auto`}>
                    <Mixer
                        deckAVolume={deckA.volume}
                        setDeckAVolume={setDeckAVolume}
                        deckBVolume={deckB.volume}
                        setDeckBVolume={setDeckBVolume}
                        deckAGain={deckA.gain}
                        setDeckAGain={setDeckAGain}
                        deckBGain={deckB.gain}
                        setDeckBGain={setDeckBGain}
                        crossfader={crossfader}
                        setCrossfader={setCrossfader}
                        masterVolume={masterVolume}
                        setMasterVolume={setMasterVolume}
                        deckACue={deckACue}
                        setDeckACue={setDeckACue}
                        deckBCue={deckBCue}
                        setDeckBCue={setDeckBCue}
                        headphoneVolume={headphoneVolume}
                        setHeadphoneVolume={setHeadphoneVolume}
                        headphoneMix={headphoneMix}
                        setHeadphoneMix={setHeadphoneMix}
                        eqKnobs={eqKnobs}
                        setEqKnobs={setEqKnobs}
                        crossfaderCurve={crossfaderCurve}
                        setCrossfaderCurve={setCrossfaderCurve}
                        activeEffects={activeEffects}
                        setActiveEffects={setActiveEffects}
                        selectedFx={selectedFx}
                        setSelectedFx={setSelectedFx}
                        effectSettings={effectSettings}
                        setEffectSettings={setEffectSettings}
                        savedChains={savedChains}
                        setSavedChains={setSavedChains}
                        samplerVolume={samplerVolume}
                        setSamplerVolume={setSamplerVolume}
                        onPlaySample={playSample}
                        isMetronomeEnabled={isMetronomeEnabled}
                        onToggleMetronome={() => setIsMetronomeEnabled(!isMetronomeEnabled)}
                        metronomeBpm={metronomeBpm}
                        setMetronomeBpm={setMetronomeBpm}
                        metronomeVolume={metronomeVolume}
                        setMetronomeVolume={setMetronomeVolume}
                        metronomeBeat={metronomeBeat}
                        beats={beats}
                        loadBeat={loadBeat}
                        playBeat={playBeat}
                        beatVolumes={beatVolumes}
                        onVolumeChange={handleBeatVolumeChange}
                        onSave={handleSaveBeats}
                        onRemove={handleRemoveBeat}
                        onClearAll={handleClearAllBeats}
                        onGenerateHype={handleGenerateHype}
                        hypeText={hypeText}
                        isGeneratingHype={isGeneratingHype}
                        isMicEnabled={isMicEnabled}
                        onToggleMic={toggleMic}
                        onMicTalk={handleMicTalk}
                        micFilter={micFilter}
                        setMicFilter={setMicFilter}
                        micReverb={micReverb}
                        setMicReverb={setMicReverb}
                        isAutoDjEnabled={isAutoDjEnabled}
                        onToggleAutoDj={toggleAutoDj}
                        isAutoDjDisabled={library.length < 2 && (queueA.length + queueB.length < 2)}
                        autoDjSettings={autoDjSettings}
                        onAutoDjSettingsChange={setAutoDjSettings}
                        deckA={deckA}
                        deckB={deckB}
                        autoDjActiveDeck={autoDjActiveDeck}
                        onAutoDjSkip={handleAutoDjSkip}
                        nextAutoDjTrack={nextAutoDjTrack}
                        onAutoDjRepick={handleAutoDjRepick}
                        autoDjHistory={autoDjHistory}
                        onAutoDjSmartSuggest={handleSmartSuggest}
                        isSuggestingAutoDj={isSuggestingTrack}
                        deckAFrequencyData={deckAFrequencyData}
                        deckBFrequencyData={deckBFrequencyData}
                        metronomeTimeSignature={metronomeTimeSignature}
                        setMetronomeTimeSignature={setMetronomeTimeSignature}
                        metronomeSubdivision={metronomeSubdivision}
                        setMetronomeSubdivision={setMetronomeSubdivision}
                        metronomeSound={metronomeSound}
                        setMetronomeSound={setMetronomeSound}
                        onMetronomeTap={handleMetronomeTap}
                    />
                </div>

                <div className="flex flex-col gap-4 min-w-[300px] relative xl:flex-1">
                    <Deck deckId="B" deckState={deckB} setDeckState={setDeckB} loadSong={loadSong} togglePlay={togglePlay} onPitchChange={handlePitchChange} seekDeck={seekDeck} isAutoDjEnabled={isAutoDjEnabled} frequencyData={deckBFrequencyData} onZoomChange={handleZoomChange} onScrollChange={handleScrollChange} layout={layout} onToggleBrowser={() => setIsDeckBBrowserVisible(v => !v)} toggleKeyLock={toggleKeyLock} onToggleScratchMode={toggleScratchMode} onPlatterInteraction={handlePlatterInteraction} />
                    <div className={layout === 'library' ? 'hidden' : ''}>
                        <PerformancePads deckId="B" deckState={deckB} onCueAction={handleCueAction} onLoopSet={handleSetLoop} onPlayDrumSample={playDrumSample} />
                    </div>
                     {isDeckBBrowserVisible && layout !== 'library' && (
                        <DeckLibraryBrowser
                            deckId="B"
                            library={library}
                            queue={queueB}
                            loadSong={loadSong}
                            onClose={() => setIsDeckBBrowserVisible(false)}
                        />
                    )}
                </div>
            </main>
            
            {layout === 'pro' && (
                <footer className="flex flex-col gap-4 mt-4">
                    <Equalizer 
                        activePreset={activePreset} 
                        setActivePreset={setActivePreset} 
                        frequencyData={frequencyData}
                        bandValues={bandValues}
                        setBandValues={setBandValues}
                        bassBoost={bassBoost}
                        setBassBoost={setBassBoost}
                        loudness={masterVolume * 100}
                        setLoudness={(value) => setMasterVolume(value / 100)}
                        virtualizer={virtualizer}
                        setVirtualizer={setVirtualizer}
                        customPresets={customPresets}
                        setCustomPresets={setCustomPresets}
                    />
                    <MusicLibrary
                        library={library}
                        loadSong={loadSong}
                        addSongsToLibrary={addSongsToLibrary}
                        queueA={queueA}
                        queueB={queueB}
                        onAddToQueue={handleAddToQueue}
                        onRemoveFromQueue={handleRemoveFromQueue}
// FIX: Changed `onReorderQueue` variable to `handleReorderQueue` function.
                        onReorderQueue={handleReorderQueue}
                    />
                </footer>
            )}

            {layout === 'library' && (
                <div className="flex-grow flex flex-col min-h-0">
                    <MusicLibrary
                        library={library}
                        loadSong={loadSong}
                        addSongsToLibrary={addSongsToLibrary}
                        queueA={queueA}
                        queueB={queueB}
                        onAddToQueue={handleAddToQueue}
                        onRemoveFromQueue={handleRemoveFromQueue}
// FIX: Changed `onReorderQueue` variable to `handleReorderQueue` function.
                        onReorderQueue={handleReorderQueue}
                    />
                </div>
            )}
            
            {isMidiPanelVisible && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center" onClick={() => setIsMidiPanelVisible(false)}>
                    <div className="w-full max-w-2xl z-50" onClick={e => e.stopPropagation()}>
                        <MidiPanel
                            midiDevices={midiDevices}
                            selectedDeviceId={selectedMidiDeviceId}
                            onSelectDevice={setSelectedMidiDeviceId}
                            mapping={midiMapping}
                            onMappingChange={setMidiMapping}
                            learningTarget={isMidiLearning}
                            onSetLearningTarget={setIsMidiLearning}
                            lastMidiMessage={lastMidiMessage}
                            onClose={() => setIsMidiPanelVisible(false)}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;