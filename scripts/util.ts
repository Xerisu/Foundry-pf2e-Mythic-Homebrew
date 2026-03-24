import { ActorPF2e, CheckRoll, StatisticDifficultyClass, TokenDocumentPF2e } from "pf2e-types";
import type { Rolled } from "fvtt-types/client/dice/roll.d.mts";

function sluggify(text: string, { camel = null }: { camel?: SlugCamel } = {}): string {
    return game.pf2e.system.sluggify(text, { camel });
}

type SlugCamel = "dromedary" | "bactrian" | null;

function ErrorPF2e(message: string): Error {
    return Error(`PF2e System | ${message}`);
}

type FontAwesomeStyle = "solid" | "regular" | "duotone";

function fontAwesomeIcon(
    glyph: string,
    { style = "solid", fixedWidth = false }: { style?: FontAwesomeStyle; fixedWidth?: boolean } = {},
): HTMLElement {
    const styleClass = `fa-${style}`;
    const glyphClass = glyph.startsWith("fa-") ? glyph : `fa-${glyph}`;
    const icon = document.createElement("i");
    icon.classList.add(styleClass, glyphClass);
    icon.inert = true;
    if (fixedWidth) icon.classList.add("fa-fw");

    return icon;
}

let intlNumberFormat: Intl.NumberFormat;
/**
 * Return an integer string of a number, always with sign (+/-)
 * @param value The number to convert to a string
 * @param options.emptyStringZero If the value is zero, return an empty string
 * @param options.zeroIsNegative Treat zero as a negative value
 */
function signedInteger(value: number, { emptyStringZero = false, zeroIsNegative = false } = {}): string {
    if (value === 0) {
        if (emptyStringZero) return "";
        value = zeroIsNegative ? -0 : 0;
    }
    const formatter = (intlNumberFormat ??= new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
        signDisplay: "always",
        useGrouping: false,
    }));
    return formatter.format(value);
}

const _cached: {
    checkRoll?: typeof CheckRoll;
} = {};

function getCheckRollClass(): typeof CheckRoll {
    return (_cached.checkRoll ??= CONFIG.Dice.rolls.find((value) => value.name === "CheckRoll") as typeof CheckRoll);
}

function isCheckRoll(value: unknown): value is CheckRoll {
    return value instanceof getCheckRollClass();
}

function isRolledCheckRoll(Value: unknown): Value is Rolled<CheckRoll> {
    return isCheckRoll(Value) && Value._evaluated === true;
}

function isActorPF2e(value: unknown): value is ActorPF2e {
    return value instanceof foundry.abstract.Document && value.documentName === "Actor";
}

function isTokenDocumentPF2e(value: unknown): value is TokenDocumentPF2e {
    return value instanceof foundry.abstract.Document && value.documentName === "Token";
}

function isStatisticDifficultyClass(value: unknown): value is StatisticDifficultyClass {
    return value !== null && value !== undefined;
}

/**
 * Quickly clone a simple piece of data, returning a copy which can be mutated safely.
 * This method DOES support recursive data structures containing inner objects or arrays.`
 * This method DOES NOT support advanced object types like Set, Map, or other specialized classes.
 * @param original Some sort of data
 * @return The clone of that data
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepClone<T>(original: T): T extends Set<any> | Map<any, any> | Collection<string, any> ? never : T {
    // Simple types
    if (typeof original !== "object" || original === null)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return original as T extends Set<any> | Map<any, any> | Collection<string, any> ? never : T;

    // Arrays
    if (original instanceof Array)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return original.map(deepClone) as unknown as T extends Set<any> | Map<any, any> | Collection<string, any>
            ? never
            : T;

    // Dates
    if (original instanceof Date)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new Date(original) as unknown as T extends Set<any> | Map<any, any> | Collection<string, any>
            ? never
            : T;

    // Unsupported advanced objects
    if ((original as { constructor: unknown }).constructor !== Object)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return original as T extends Set<any> | Map<any, any> | Collection<string, any> ? never : T;

    // Other objects
    const clone: Record<string, unknown> = {};
    for (const k of Object.keys(original)) {
        clone[k] = deepClone(original[k as keyof typeof original]);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return clone as unknown as T extends Set<any> | Map<any, any> | Collection<string, any> ? never : T;
}

/**
 * Check if a key is present in a given object in a type safe way
 *
 * @param obj The object to check
 * @param key The key to check
 */
function objectHasKey<O extends object>(obj: O, key: unknown): key is keyof O {
    return (typeof key === "string" || typeof key === "number") && key in obj;
}

export {
    ErrorPF2e,
    sluggify,
    signedInteger,
    isCheckRoll,
    isRolledCheckRoll,
    isActorPF2e,
    isTokenDocumentPF2e,
    fontAwesomeIcon,
    deepClone,
    objectHasKey,
    isStatisticDifficultyClass,
    type SlugCamel,
};