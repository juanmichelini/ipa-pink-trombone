import { Record } from "../fable_modules/fable-library-js.4.29.0/Types.js";
import { bool_type, string_type, record_type, float64_type } from "../fable_modules/fable-library-js.4.29.0/Reflection.js";
import { minBy, zip, sumBy, sum, map, tryFind, filter, ofArray } from "../fable_modules/fable-library-js.4.29.0/List.js";
import { min, max } from "../fable_modules/fable-library-js.4.29.0/Double.js";
import { comparePrimitives } from "../fable_modules/fable-library-js.4.29.0/Util.js";
import { map as map_1, collect, delay, toList } from "../fable_modules/fable-library-js.4.29.0/Seq.js";
import { rangeDouble } from "../fable_modules/fable-library-js.4.29.0/Range.js";
import { map as map_2 } from "../fable_modules/fable-library-js.4.29.0/Option.js";
import { map as map_3, fold, item, setItem } from "../fable_modules/fable-library-js.4.29.0/Array.js";

export class Tongue extends Record {
    constructor(Height, Backness, Rounding) {
        super();
        this.Height = Height;
        this.Backness = Backness;
        this.Rounding = Rounding;
    }
}

export function Tongue_$reflection() {
    return record_type("IpaTrombone.TongueSpace.Tongue", [], Tongue, () => [["Height", float64_type], ["Backness", float64_type], ["Rounding", float64_type]]);
}

export class Formants extends Record {
    constructor(F1, F2) {
        super();
        this.F1 = F1;
        this.F2 = F2;
    }
}

export function Formants_$reflection() {
    return record_type("IpaTrombone.TongueSpace.Formants", [], Formants, () => [["F1", float64_type], ["F2", float64_type]]);
}

export class Vowel extends Record {
    constructor(Symbol$, Name, Tongue, Sound, Approx) {
        super();
        this.Symbol = Symbol$;
        this.Name = Name;
        this.Tongue = Tongue;
        this.Sound = Sound;
        this.Approx = Approx;
    }
}

export function Vowel_$reflection() {
    return record_type("IpaTrombone.TongueSpace.Vowel", [], Vowel, () => [["Symbol", string_type], ["Name", string_type], ["Tongue", Tongue_$reflection()], ["Sound", Formants_$reflection()], ["Approx", bool_type]]);
}

function vowel(symbol, name, backness, height, rounding, f1, f2, approx) {
    return new Vowel(symbol, name, new Tongue(height, backness, rounding), new Formants(f1, f2), approx);
}

export const vowels = ofArray([vowel("i", "close front unrounded", 0, 0, 0, 240, 2400, false), vowel("y", "close front rounded", 0, 0, 1, 235, 2100, false), vowel("ɨ", "close central unrounded", 0.5, 0, 0, 240, 1700, true), vowel("ʉ", "close central rounded", 0.5, 0, 1, 250, 1250, true), vowel("ɯ", "close back unrounded", 1, 0, 0, 300, 1390, false), vowel("u", "close back rounded", 1, 0, 1, 250, 595, false), vowel("ɪ", "near-close near-front unrounded", 0.15, 0.17, 0, 390, 1990, true), vowel("ʏ", "near-close near-front rounded", 0.15, 0.17, 1, 440, 1700, true), vowel("ʊ", "near-close near-back rounded", 0.85, 0.17, 1, 440, 1020, true), vowel("e", "close-mid front unrounded", 0, 0.33, 0, 390, 2300, false), vowel("ø", "close-mid front rounded", 0, 0.33, 1, 370, 1900, false), vowel("ɘ", "close-mid central unrounded", 0.5, 0.33, 0, 400, 1700, true), vowel("ɵ", "close-mid central rounded", 0.5, 0.33, 1, 380, 1350, true), vowel("ɤ", "close-mid back unrounded", 1, 0.33, 0, 460, 1310, false), vowel("o", "close-mid back rounded", 1, 0.33, 1, 360, 640, false), vowel("ə", "mid central", 0.5, 0.5, 0, 500, 1500, true), vowel("ɛ", "open-mid front unrounded", 0, 0.67, 0, 610, 1900, false), vowel("œ", "open-mid front rounded", 0, 0.67, 1, 585, 1710, false), vowel("ɜ", "open-mid central unrounded", 0.5, 0.67, 0, 560, 1500, true), vowel("ɞ", "open-mid central rounded", 0.5, 0.67, 1, 540, 1300, true), vowel("ʌ", "open-mid back unrounded", 1, 0.67, 0, 600, 1170, false), vowel("ɔ", "open-mid back rounded", 1, 0.67, 1, 500, 700, false), vowel("æ", "near-open front unrounded", 0, 0.83, 0, 820, 1700, true), vowel("ɐ", "near-open central", 0.5, 0.83, 0, 750, 1400, true), vowel("a", "open front unrounded", 0, 1, 0, 850, 1610, false), vowel("ɶ", "open front rounded", 0, 1, 1, 820, 1530, false), vowel("ɑ", "open back unrounded", 1, 1, 0, 750, 940, false), vowel("ɒ", "open back rounded", 1, 1, 1, 700, 760, false)]);

const spreadVowels = filter((v) => (v.Tongue.Rounding < 0.5), vowels);

const roundedVowels = filter((v) => (v.Tongue.Rounding >= 0.5), vowels);

function clamp01(x) {
    return max(0, min(1, x));
}

function sq(x) {
    return x * x;
}

export function soundDistance(a, b) {
    return Math.sqrt(sq(Math.log(a.F1 / b.F1)) + sq(Math.log(a.F2 / b.F2)));
}

function blend(anchors, backness, height) {
    const distance2 = (a) => (sq(a.Tongue.Backness - backness) + sq(a.Tongue.Height - height));
    const matchValue = tryFind((a_1) => (distance2(a_1) < 1E-09), anchors);
    if (matchValue == null) {
        const weights = map((a_3) => (1 / Math.pow(distance2(a_3), 1.5)), anchors);
        const total = sum(weights, {
            GetZero: () => 0,
            Add: (x, y) => (x + y),
        });
        const mean = (pick) => (sumBy((tupledArg) => (tupledArg[0] * Math.log(pick(tupledArg[1]))), zip(weights, anchors), {
            GetZero: () => 0,
            Add: (x_1, y_1) => (x_1 + y_1),
        }) / total);
        return [mean((a_5) => a_5.Sound.F1), mean((a_6) => a_6.Sound.F2)];
    }
    else {
        const a_2 = matchValue;
        return [Math.log(a_2.Sound.F1), Math.log(a_2.Sound.F2)];
    }
}

export function toSound(tongue) {
    const b = clamp01(tongue.Backness);
    const h = clamp01(tongue.Height);
    const r = clamp01(tongue.Rounding);
    const patternInput = blend(spreadVowels, b, h);
    const s2 = patternInput[1];
    const s1 = patternInput[0];
    const patternInput_1 = blend(roundedVowels, b, h);
    return new Formants(Math.exp(s1 + ((patternInput_1[0] - s1) * r)), Math.exp(s2 + ((patternInput_1[1] - s2) * r)));
}

function cost(target, tongue) {
    return sq(soundDistance(toSound(tongue), target)) + (1E-09 * tongue.Rounding);
}

const moves = ofArray([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]);

export function fromSound(target) {
    const polish = (t_mut, step_mut) => {
        polish:
        while (true) {
            const t = t_mut, step = step_mut;
            if (step < 0.0001) {
                return t;
            }
            else {
                const best = minBy((tongue) => cost(target, tongue), map((tupledArg) => (new Tongue(clamp01(t.Height + (tupledArg[0] * step)), clamp01(t.Backness + (tupledArg[1] * step)), clamp01(t.Rounding + (tupledArg[2] * step)))), moves), {
                    Compare: comparePrimitives,
                });
                if (cost(target, best) < (cost(target, t) - 1E-15)) {
                    t_mut = best;
                    step_mut = step;
                    continue polish;
                }
                else {
                    t_mut = t;
                    step_mut = (step / 2);
                    continue polish;
                }
            }
            break;
        }
    };
    return polish(minBy((tongue_1) => cost(target, tongue_1), toList(delay(() => collect((i) => collect((j) => map_1((r) => (new Tongue(i / 20, j / 20, r)), [0, 0.5, 1]), rangeDouble(0, 1, 20)), rangeDouble(0, 1, 20)))), {
        Compare: comparePrimitives,
    }), 0.05);
}

export function nearest(tongue) {
    return minBy((v) => ((sq(v.Tongue.Backness - tongue.Backness) + sq(v.Tongue.Height - tongue.Height)) + (0.05 * Math.abs(v.Tongue.Rounding - tongue.Rounding))), vowels, {
        Compare: comparePrimitives,
    });
}

export function ofIpa(symbol) {
    return map_2((v_1) => v_1.Tongue, tryFind((v) => (v.Symbol === symbol), vowels));
}

function pulseTrain(f0, sampleRate, count) {
    const output = new Float64Array(count);
    let phase = 0;
    for (let i = 0; i <= (count - 1); i++) {
        phase = (phase + (f0 / sampleRate));
        if (phase >= 1) {
            phase = (phase - 1);
            setItem(output, i, 1);
        }
    }
    return output;
}

function resonate(frequency, bandwidth, sampleRate, input) {
    const t = 1 / sampleRate;
    const c = -Math.exp(((-2 * 3.141592653589793) * bandwidth) * t);
    const b = (2 * Math.exp((-3.141592653589793 * bandwidth) * t)) * Math.cos(((2 * 3.141592653589793) * frequency) * t);
    const a = (1 - b) - c;
    const output = new Float64Array(input.length);
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i <= (input.length - 1); i++) {
        const y = ((a * item(i, input)) + (b * y1)) + (c * y2);
        setItem(output, i, y);
        y2 = y1;
        y1 = y;
    }
    return output;
}

export function render(sound, f0, sampleRate, seconds) {
    const voiced = resonate(sound.F2, 110, sampleRate, resonate(sound.F1, 70, sampleRate, pulseTrain(f0, sampleRate, ~~Math.floor(sampleRate * seconds))));
    const peak = fold((m, v) => max(m, Math.abs(v)), 0, voiced);
    if (peak === 0) {
        return voiced;
    }
    else {
        return map_3((v_1) => ((0.8 * v_1) / peak), voiced, Float64Array);
    }
}

