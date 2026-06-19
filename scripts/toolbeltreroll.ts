import { Rolled } from "@7h3laughingman/foundry-types/client/dice/roll.mjs";
import { ChatMessagePF2e, CheckRoll, DegreeAdjustmentAmount, DegreeOfSuccessString, RollNoteSource, SaveType, TokenDocumentPF2e } from "pf2e-types";
import { moduleId, settings } from "./constants.ts";
import { SimplifiedDegreeOfSuccess } from "./SimplifiedDegreeOfSuccess.ts";

const REROLL_TYPES = ["hero", "mythic", "new", "lower", "higher"] as const;
type RerollType = (typeof REROLL_TYPES)[number];

// hook: "pf2e-toolbelt.rerollSave"
type RerollSaveHook = {
    oldRoll: Rolled<CheckRoll>,
    newRoll: Rolled<CheckRoll>,
    keptRoll: Rolled<CheckRoll>,
    message: ChatMessagePF2e,
    target: TokenDocumentPF2e,
    data: SaveRollData,
};

type SaveRollData = {
    die: number,
    dosAdjustments?: Record<string, { label: string, amount: DegreeAdjustmentAmount }>,
    modifiers: { excluded: boolean, label: string, modifier: number, slug: string }[],
    notes: RollNoteSource[],
    private: boolean,
    rerolled?: RerollType,
    roll: string,
    significantModifiers?: {
        appliedTo: "roll" | "dc",
        name: string,
        significance: "ESSENTIAL" | "HELPFUL" | "NONE" | "HARMFUL" | "DETRIMENTAL",
        value: number,
    }[],
    statistic: SaveType,
    success: DegreeOfSuccessString,
    unadjustedOutcome?: DegreeOfSuccessString | null,
    value: number,
};

async function UpdateToolbeltReroll(hookData: RerollSaveHook) {

    const monkeypatch = game.settings.get(moduleId, settings.monkeypatchMythicReroll) as boolean;
    if (!monkeypatch) {
        return;
    }
    const mythicProficiencyModifier = hookData.data.modifiers.find(x => x.label === 'Mythic');
    if (mythicProficiencyModifier === undefined) {
        return;
    }
    const oldProficiencyModifier = hookData.data.modifiers.find(x => x.label !== 'Mythic' && x.slug === 'proficiency');
    if (oldProficiencyModifier === undefined) {
        return;
    }

    // find dc of a roll
    const messageToolbeltFlags = hookData.message.flags['pf2e-toolbelt'] as any;
    if(!messageToolbeltFlags) return;
    const messageTargetHelper = messageToolbeltFlags['targetHelper'] as any;
    if(!messageTargetHelper) return;
    const saveVariants = messageTargetHelper['saveVariants'] as any;
    if(!saveVariants) return;
    const saveVariant = saveVariants['null'] as any;
    if(!saveVariant) return;
    const dc = saveVariant['dc'] as number | undefined;
    if(!dc) return;

    // update mythic reroll to options from module
    const mythicRerollProficiencyBonus = game.settings.get(moduleId, settings.mythicRerollProficiencyBonus) as number;
    const mythicRerollProficiencyLabel = game.settings.get(moduleId, settings.mythicRerollProficiencyLabel) as string;
    
    // Calculate and adjust new modifier
    const pwolVariant = game.pf2e.settings.variants.pwol.enabled;
    const actorLevel = hookData.target.actor?.level ?? 0;
    mythicProficiencyModifier.modifier = mythicRerollProficiencyBonus + (pwolVariant ? 0 : actorLevel);
    mythicProficiencyModifier.label = mythicRerollProficiencyLabel;

    if (oldProficiencyModifier.modifier > mythicProficiencyModifier.modifier) {
        //mythicProficiencyModifier.modifier += oldTotalModifier - newTotalModifier;
        // setting which proficiency shows up
        mythicProficiencyModifier.excluded = true;
        oldProficiencyModifier.excluded = false;
    }
    const totalModifier = hookData.data.modifiers
        .filter((modifier) => !modifier.excluded)
        .reduce<number>((prevResult, modifier) => {return prevResult + modifier.modifier}, 0)
    
    // Check if old modifier was bigger, if yes, go back to old modifier


    // Change degree of success (if relevant)
    const dieResult = hookData.data.die;
    const degreeOfSuccess = new SimplifiedDegreeOfSuccess({dieValue: dieResult, modifier: totalModifier}, dc, hookData.data.dosAdjustments);
    hookData.data.success = degreeOfSuccess.key as DegreeOfSuccessString;
    hookData.data.value = degreeOfSuccess.rollTotal;

    // Change display data
    const displayData = JSON.parse(hookData.data.roll);
    displayData.options.degreeOfSuccess = degreeOfSuccess.value;
    displayData.options.totalModifier = totalModifier;
    displayData.formula = "1d20 + " + totalModifier.toString();
    displayData.total = degreeOfSuccess.rollTotal;
    displayData.terms[2].number = totalModifier;
    hookData.data.roll = JSON.stringify(displayData);
}
// Todo: edytowac wiadomosc ktora sie pokazuje w toolbelcie

export {UpdateToolbeltReroll};