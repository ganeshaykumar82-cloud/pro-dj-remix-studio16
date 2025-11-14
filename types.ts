// FIX: Removed incorrect import of DeckState from './App'. The DeckState type is defined in this file, and the import was causing a circular dependency.

export interface Song {
  id: number;
  name: string;
  file: File;
  key?: string | null;
  bpm?: number | null;
  genre?: string;
  energy?: number; // 1-10 scale
}

export interface Beat extends Song {
  audioBuffer?: AudioBuffer;
  arrayBuffer?: ArrayBuffer;
}

export type BeatCategoryType = 'drum' | 'tuning' | 'instrumental';

export interface DeckState {
  song: Song | null;
  isPlaying: boolean;
  gain: number;
  volume: number;
  playbackRate: number;
  currentTime: number;
  duration: number;
  platterAngle: number;
  cuePoints: (number | undefined)[];
  bpm: number | null;
  loop: {
    start: number | null;
    end: number | null;
    active: boolean;
  };
  waveform?: Float32Array;
  key?: string | null;
  zoom: number;
  viewStartRatio: number;
  perceivedLoudness?: number;
  // FIX: Added missing 'lastUpdateTime' property to track playback timing.
  lastUpdateTime?: number;
  keyLock: boolean;
  scratchModeEnabled: boolean;
  wasPlayingBeforeScratch: boolean;
}

export interface EqualizerPreset {
    name: string;
    values: number[]; // 10 values for the 10 bands
}

// FX Panel Types
export type FxType = 'Reverb' | 'Delay' | 'Flanger' | 'Low-Pass' | 'High-Pass' | 'Band-Pass' | 'Distortion' | 'Phaser' | 'Chorus';

export interface FxSettings {
    dryWet: number; // 0-100
    param1: number; // 0-100
    param2: number; // 0-100
    beatDivision?: number; // e.g., 0.25, 1, 4 for beat-synced effects
}

export interface FxChain {
    id: number;
    name: string;
    activeEffects: FxType[];
    settings: Record<FxType, FxSettings>;
}

export interface AutoDjSettings {
    transitionType: 'Smart' | 'Crossfade' | 'Cut' | 'Fade In/Out' | 'EQ Fade' | 'Loop Out' | 'Filter Fade';
    transitionDuration: number; // in seconds
    transitionTrigger: number; // seconds from end
    playlistSource: 'library' | 'queues';
    shuffle: boolean;
    harmonicMix: boolean;
    genreMatch: boolean;
    bpmMatch: {
        enabled: boolean;
        range: number; // +/- BPM
    };
    avoidRepeatingArtist: boolean;
    autoGain: boolean;
    beatMatch: boolean;
    energyFlow: 'Any' | 'Maintain' | 'Increase' | 'Decrease';
}

export type CrossfaderCurveType = 'linear' | 'slow-fade' | 'fast-cut';

// MIDI Types
export type MappableControl =
  | 'deckA_play' | 'deckB_play'
  | 'deckA_volume' | 'deckB_volume'
  | 'deckA_pitch' | 'deckB_pitch'
  | 'deckA_cue' | 'deckB_cue' // Headphone cue
  | 'crossfader'
  | 'master_volume'
  | 'headphone_volume' | 'headphone_mix'
  | 'eq_bass' | 'eq_mid' | 'eq_treble'
  | 'deckA_hotcue_1' | 'deckA_hotcue_2' | 'deckA_hotcue_3' | 'deckA_hotcue_4'
  | 'deckA_hotcue_5' | 'deckA_hotcue_6' | 'deckA_hotcue_7' | 'deckA_hotcue_8'
  | 'deckB_hotcue_1' | 'deckB_hotcue_2' | 'deckB_hotcue_3' | 'deckB_hotcue_4'
  | 'deckB_hotcue_5' | 'deckB_hotcue_6' | 'deckB_hotcue_7' | 'deckB_hotcue_8'
  | 'deckA_loop_1' | 'deckA_loop_4' | 'deckA_loop_8' | 'deckA_loop_16'
  | 'deckB_loop_1' | 'deckB_loop_4' | 'deckB_loop_8' | 'deckB_loop_16'
  | `fx_toggle_${FxType}`
  | 'fx_selected_dryWet' | 'fx_selected_param1' | 'fx_selected_param2';

export type MidiMessageId = `note_on_${number}_${number}` | `note_off_${number}_${number}` | `cc_${number}_${number}`;

export type MidiMapping = Partial<Record<MappableControl, MidiMessageId>>;