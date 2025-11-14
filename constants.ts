import type { EqualizerPreset, FxType, FxSettings, MappableControl } from './types';

export const PRESETS: EqualizerPreset[] = [
    { name: 'Normal', values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { name: 'Classical', values: [0, 0, 0, 0, 0, 0, -2, -2, -2, -3] },
    { name: 'Dance', values: [4, 3, 1, 0, 1, 2, 3, 3, 2, 1] },
    { name: 'Flat', values: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { name: 'Heavy Metal', values: [2, 3, 4, 3, 1, 3, 4, 3, 2, 1] },
    { name: 'Hip Hop', values: [4, 3, 1, 2, 0, -1, 0, 1, 2, 3] },
    { name: 'Jazz', values: [2, 1, 1, 1, -1, -1, 0, 1, 2, 2] },
    { name: 'Pop', values: [-1, 1, 2, 3, 2, 1, -1, -1, -1, -1] },
    { name: 'Rock', values: [4, 3, 2, 1, -1, -2, 0, 1, 3, 4] },
    { name: 'Bass Boost', values: [8, 6, 4, 2, 0, 0, 0, 0, 0, 0] },
    { name: 'Deep Bass', values: [12, 9, 5, 1, 0, -1, -1, -2, -2, -3] },
    { name: 'Treble Boost', values: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6] },
    { name: 'EDM', values: [4, 3, 1, 0, 1, 2, 4, 3, 2, 3] },
    { name: 'Deep House', values: [3, 2, 1, 0, 1, 2, 1, 0, 1, 2] },
];

export const FX_LIST: FxType[] = [
    'Low-Pass', 'High-Pass', 'Band-Pass',
    'Delay', 'Reverb', 'Flanger', 'Phaser', 'Chorus',
    'Distortion'
];

export const BEAT_DIVISIONS = [1/16, 1/8, 1/4, 1/2, 1, 2, 4];
export const BEAT_DIVISION_LABELS: Record<number, string> = {
    [1/16]: '1/16',
    [1/8]: '1/8',
    [1/4]: '1/4',
    [1/2]: '1/2',
    [1]: '1',
    [2]: '2',
    [4]: '4',
};

interface FxParamInfo {
    label: string;
    min: number;
    max: number;
    step?: number;
}

export const FX_PARAM_CONFIG: Record<FxType, { syncable?: boolean, param1: FxParamInfo, param2: FxParamInfo, defaults: FxSettings }> = {
    'Reverb': {
        param1: { label: 'DECAY', min: 0.1, max: 6 },
        param2: { label: 'MIX', min: 0, max: 1 },
        defaults: { dryWet: 30, param1: 50, param2: 50 }
    },
    'Delay': {
        syncable: true,
        param1: { label: 'TIME', min: 0.01, max: 2.0 },
        param2: { label: 'FEEDBACK', min: 0, max: 0.95 },
        defaults: { dryWet: 40, param1: 25, param2: 50, beatDivision: 0.5 }
    },
    'Flanger': {
        syncable: true,
        param1: { label: 'SPEED', min: 0.1, max: 10 }, // LFO Frequency in Hz
        param2: { label: 'DEPTH', min: 0.0005, max: 0.005 }, // LFO Gain
        defaults: { dryWet: 50, param1: 20, param2: 60, beatDivision: 1 }
    },
    'Low-Pass': {
        param1: { label: 'FREQUENCY', min: 10, max: 22050 }, // Logarithmic scale handled in component
        param2: { label: 'RESONANCE', min: 0, max: 30 },
        defaults: { dryWet: 100, param1: 80, param2: 10 }
    },
    'High-Pass': {
        param1: { label: 'FREQUENCY', min: 10, max: 22050 },
        param2: { label: 'RESONANCE', min: 0, max: 30 },
        defaults: { dryWet: 100, param1: 0, param2: 10 }
    },
    'Band-Pass': {
        param1: { label: 'FREQUENCY', min: 10, max: 22050 },
        param2: { label: 'WIDTH (Q)', min: 0.1, max: 30 },
        defaults: { dryWet: 100, param1: 50, param2: 20 }
    },
    'Distortion': {
        param1: { label: 'AMOUNT', min: 0.1, max: 100 },
        param2: { label: 'TONE', min: 200, max: 22050 }, // Low-pass filter frequency
        defaults: { dryWet: 60, param1: 50, param2: 100 }
    },
    'Phaser': {
        syncable: true,
        param1: { label: 'SPEED', min: 0.1, max: 10 }, // LFO speed in Hz
        param2: { label: 'DEPTH', min: 100, max: 1500 }, // LFO modulation depth
        defaults: { dryWet: 70, param1: 20, param2: 50, beatDivision: 2 }
    },
    'Chorus': {
        syncable: true,
        param1: { label: 'SPEED', min: 0.1, max: 8 }, // LFO speed in Hz
        param2: { label: 'DEPTH', min: 0.001, max: 0.01 }, // LFO modulation depth
        defaults: { dryWet: 60, param1: 30, param2: 50, beatDivision: 1 }
    }
};

export const EQ_BANDS = ['32', '64', '125', '250', '500', '1k', '2k', '4k', '8k', '16k'];
export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const MAPPABLE_CONTROLS: { id: MappableControl, label: string, group: string }[] = [
    // Deck A
    { id: 'deckA_play', label: 'Play / Pause', group: 'Deck A' },
    { id: 'deckA_volume', label: 'Volume Fader', group: 'Deck A' },
    { id: 'deckA_pitch', label: 'Pitch Fader', group: 'Deck A' },
    { id: 'deckA_cue', label: 'Headphone Cue', group: 'Deck A' },
    { id: 'deckA_hotcue_1', label: 'Hot Cue 1', group: 'Deck A' },
    { id: 'deckA_hotcue_2', label: 'Hot Cue 2', group: 'Deck A' },
    { id: 'deckA_hotcue_3', label: 'Hot Cue 3', group: 'Deck A' },
    { id: 'deckA_hotcue_4', label: 'Hot Cue 4', group: 'Deck A' },
    { id: 'deckA_loop_1', label: 'Loop 1 Beat', group: 'Deck A' },
    { id: 'deckA_loop_4', label: 'Loop 4 Beats', group: 'Deck A' },
    { id: 'deckA_loop_8', label: 'Loop 8 Beats', group: 'Deck A' },
    { id: 'deckA_loop_16', label: 'Loop 16 Beats', group: 'Deck A' },
    // Deck B
    { id: 'deckB_play', label: 'Play / Pause', group: 'Deck B' },
    { id: 'deckB_volume', label: 'Volume Fader', group: 'Deck B' },
    { id: 'deckB_pitch', label: 'Pitch Fader', group: 'Deck B' },
    { id: 'deckB_cue', label: 'Headphone Cue', group: 'Deck B' },
    { id: 'deckB_hotcue_1', label: 'Hot Cue 1', group: 'Deck B' },
    { id: 'deckB_hotcue_2', label: 'Hot Cue 2', group: 'Deck B' },
    { id: 'deckB_hotcue_3', label: 'Hot Cue 3', group: 'Deck B' },
    { id: 'deckB_hotcue_4', label: 'Hot Cue 4', group: 'Deck B' },
    { id: 'deckB_loop_1', label: 'Loop 1 Beat', group: 'Deck B' },
    { id: 'deckB_loop_4', label: 'Loop 4 Beats', group: 'Deck B' },
    { id: 'deckB_loop_8', label: 'Loop 8 Beats', group: 'Deck B' },
    { id: 'deckB_loop_16', label: 'Loop 16 Beats', group: 'Deck B' },
    // Mixer
    { id: 'crossfader', label: 'Crossfader', group: 'Mixer' },
    { id: 'master_volume', label: 'Master Volume', group: 'Mixer' },
    { id: 'headphone_volume', label: 'Headphone Volume', group: 'Mixer' },
    { id: 'headphone_mix', label: 'Headphone Mix (Cue/Mstr)', group: 'Mixer' },
    { id: 'eq_bass', label: 'EQ Bass', group: 'Mixer' },
    { id: 'eq_mid', label: 'EQ Mid', group: 'Mixer' },
    { id: 'eq_treble', label: 'EQ Treble', group: 'Mixer' },
    // FX
    { id: 'fx_selected_dryWet', label: 'Selected FX Dry/Wet', group: 'FX' },
    { id: 'fx_selected_param1', label: 'Selected FX Parameter 1', group: 'FX' },
    { id: 'fx_selected_param2', label: 'Selected FX Parameter 2', group: 'FX' },
    ...FX_LIST.map(fx => ({ id: `fx_toggle_${fx}` as MappableControl, label: `${fx} On/Off`, group: 'FX' })),
];