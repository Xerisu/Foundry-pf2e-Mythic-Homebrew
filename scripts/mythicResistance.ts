import { Rolled } from "fvtt-types/client/dice/roll.mjs";
import { ActorPF2e, DamageRoll, DegreeOfSuccessString, ItemPF2e, RollNotePF2e, TokenDocumentPF2e } from "pf2e-types";
import { moduleId, settings } from "./constants.ts";

interface ApplyDamageParams {
    damage: number | Rolled<DamageRoll>;
    token: TokenDocumentPF2e;
    /** The item used in the damaging action */
    item?: ItemPF2e<ActorPF2e> | null;
    skipIWR?: boolean;
    /** Predicate statements from the damage roll */
    rollOptions?: Set<string>;
    shieldBlockRequest?: boolean;
    breakdown?: string[];
    outcome?: DegreeOfSuccessString | null;
    notes?: RollNotePF2e[];
    /** Whether to treat to not adjust the damage any further. Skips IWR regardless of its setting if set */
    final?: boolean;
}

function findDescriptor(obj : Object, prop : string) {
    while (obj) {
        const desc = Object.getOwnPropertyDescriptor(obj, prop);
        if (desc) return desc;
        obj = Object.getPrototypeOf(obj);
    }
    return null;
}


function shouldApplyMythicResistance( rollOptions : Set<string> ) {
    return !(rollOptions.has(game.settings.get(moduleId, settings.mythicProficiencyName) as string) || rollOptions.has("item:trait:mythic")) && rollOptions.has("attack");
}

function getMythicResistance(actor : ActorPF2e) {
    return actor.system.attributes.resistances.find((element) => element.type == "mythic")?.value ?? 0 ; 
}

function monkeyPatchApplyDamage() {
    const originalApplyDamage = CONFIG.Actor.documentClass.prototype.applyDamage;

    CONFIG.Actor.documentClass.prototype.applyDamage = async function ({
            damage,
            token,
            item,
            rollOptions = new Set(),
            skipIWR = false,
            shieldBlockRequest = false,
            breakdown = [],
            notes = [],
            outcome = null,
            final = false,
        }: ApplyDamageParams) {

        const mythicResistance = shouldApplyMythicResistance(rollOptions) ? getMythicResistance(this) : 0;

        const originalDescriptor = findDescriptor(Object.getPrototypeOf(this), "hardness");

        Object.defineProperty(this, "hardness", {
            configurable: true,
            get() {
                return (originalDescriptor?.get?.call(this) ?? 0) + mythicResistance;
            },
        });

        console.log(this);
        
        try {
            return await originalApplyDamage.apply(this, [{
                damage,
                token,
                item,
                rollOptions,
                skipIWR,
                shieldBlockRequest,
                breakdown,
                notes,
                outcome,
                final
            }]);
        } finally {
            delete this.hardness;
        }

    };
}

export { monkeyPatchApplyDamage }