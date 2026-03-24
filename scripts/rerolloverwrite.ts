import { ErrorPF2e, signedInteger, sluggify, isActorPF2e, isTokenDocumentPF2e, isCheckRoll, fontAwesomeIcon, deepClone } from "./util.ts";
import type { CheckRoll, ActorPF2e, ChatContextFlag, CheckContextChatFlag, ChatMessagePF2e, CheckDC } from "pf2e-types";
import { htmlQuery } from "./htmlHelpers.ts";
import { SimplifiedRollNotePF2e } from "./SimplifiedRollNotePF2e.ts";
import { SIMPLIFIED_DEGREE_OF_SUCCESS_STRINGS, SimplifiedDegreeOfSuccess } from "./SimplifiedDegreeOfSuccess.ts";
import { createResultFlavor } from "./createResultFlavor.ts";
import { moduleId, settings } from "./constants.ts";


// Small helper functions

interface RerollOptions {
    resource?: string;
    keep?: "new" | "higher" | "lower";
}

function isCheckContextFlag(flag?: ChatContextFlag): flag is CheckContextChatFlag {
    return !!flag && !tupleHasValue(["damage-roll", "spell-cast"], flag.type);
}

function tupleHasValue<const A extends readonly unknown[]>(array: A, value: unknown): value is A[number] {
    return array.includes(value);
}

const SYSTEM_ID = "pf2e";

/** Reroll a rolled check given a chat message. */
async function rerollFromMessage(message: ChatMessagePF2e, options: RerollOptions = {}): Promise<void> {
    const mythicRerollProficiencyBonus = game.settings.get(moduleId, settings.mythicRerollProficiencyBonus) as number
    const mythicRerollProficiencyLabel = game.settings.get(moduleId, settings.mythicRerollProficiencyLabel) as string
    if (!(message.isAuthor || game.user.isGM)) {
        ui.notifications.error(game.i18n.localize("PF2E.RerollMenu.ErrorCantDelete"));
        return;
    }

    const actor = message.actor;
    if (!actor) {
        ui.notifications.error("PF2E.RerollMenu.ErrorNoActor", { localize: true });
        return;
    }

    const rerollingActor = actor.isOfType("familiar") ? actor.master : actor;
    const resourceKey = options.resource;
    const resource = rerollingActor?.getResource(resourceKey ?? "");

    if (resource && resource.slug !== "hero-points" && resource.slug !== "mythic-points") {
        console.warn(`${resource.label} is not a supported resource. Using it might lead to unexpected results.`);
    }

    let rerollFlavor = game.i18n.localize(`PF2E.RerollMenu.MessageKeep.${options.keep}`);
    if (resource) {
        // If the reroll costs a hero or mythic point, first check if the actor has one to spare and spend it
        if (rerollingActor?.isOfType("character")) {
            if (resource && resource.value > 0) {
                await rerollingActor.updateResource(resource.slug, resource.value - 1);
                rerollFlavor = game.i18n.localize(
                    `PF2E.RerollMenu.Message${sluggify(resource.slug, { camel: "bactrian" })}`,
                );
            } else {
                ui.notifications.warn("PF2E.RerollMenu.WarnNoResource", {
                    localize: true,
                    format: {
                        name: rerollingActor.name,
                        resource: resource.label,
                    },
                });
                return;
            }
        }
    }

    const systemFlags = deepClone(message.flags[SYSTEM_ID]);
    const context = systemFlags.context;
    if (!isCheckContextFlag(context)) return;

    context.skipDialog = true;
    context.isReroll = true;
    context.options.push("check:reroll");
    if (resource) context.options.push(`check:reroll:${resource.slug}`);

    const oldRoll = message.rolls.at(0);

    if (!isCheckRoll(oldRoll)) throw ErrorPF2e("Unexpected error retrieving prior roll");

    const oldRollJSON = JSON.stringify(oldRoll.toJSON());
    const pwolVariant = game.pf2e.settings.variants.pwol.enabled;
    let replacedProficiencyWithMythic = false;
    // Clone the old roll and call a hook allowing the clone to be altered.
    // Tampering with the old roll is disallowed.
    const unevaluatedNewRoll = ((): CheckRoll => {
        if (resource?.slug !== "mythic-points" || !actor.isOfType("character")) return oldRoll.clone();
        if (game.settings.get(moduleId, settings.allowFlatchecks) as boolean && oldRoll.type === "flat-check") return oldRoll.clone();
        // Create a new CheckRoll in case of a mythic point reroll
        const proficiencyModifier = (systemFlags.modifiers ?? []).find((m) => m.slug === "proficiency");
        if (!proficiencyModifier) {
            throw ErrorPF2e(`Failed to reroll check with a mythic point. Check is missing a proficiency modifier!`);
        }
        // Set flag proficiency modifier to mythic modifier value
        const proficiencyModifierValue = proficiencyModifier.modifier;
        const mythicModifierValue = mythicRerollProficiencyBonus + (pwolVariant ? 0 : actor.level);
        proficiencyModifier.label = mythicRerollProficiencyLabel;
        proficiencyModifier.modifier = mythicModifierValue;
        
        // Calculate the new total modifier
        const options = deepClone(oldRoll.options);
        if (proficiencyModifierValue >= mythicModifierValue) return oldRoll.clone()
        replacedProficiencyWithMythic = true;
        options.totalModifier = (options.totalModifier ?? 0) - proficiencyModifierValue + mythicModifierValue;
        return new (<ConstructorOf<CheckRoll>>(oldRoll.constructor))(
            `${options.dice}${signedInteger(options.totalModifier, { emptyStringZero: true })}`,
            oldRoll.data,
            options,
        );
    })();
    unevaluatedNewRoll.options.isReroll = true;
    Hooks.callAll("pf2e.preReroll", Roll.fromJSON(oldRollJSON), unevaluatedNewRoll, resource, options.keep);

    // Evaluate the new roll and call a second hook allowing the roll to be altered
    const allowInteractive = context.rollMode !== "blindroll";
    const newRoll = await unevaluatedNewRoll.evaluate({ allowInteractive });
    Hooks.callAll("pf2e.reroll", Roll.fromJSON(oldRollJSON), newRoll, resource, options.keep);

    // Keep the new roll by default; Old roll is discarded
    let keptRoll = newRoll;
    let [oldRollClass, newRollClass] = ["reroll-discard", ""];

    // Check if we should keep the old roll instead.
    if (
        (options.keep === "higher" && oldRoll.total && oldRoll.total > newRoll.total) ||
        (options.keep === "lower" && oldRoll.total && oldRoll.total < newRoll.total)
    ) {
        // If so, switch the css classes and keep the old roll.
        [oldRollClass, newRollClass] = [newRollClass, oldRollClass];
        keptRoll = oldRoll;
    }

    const degree = ((): SimplifiedDegreeOfSuccess | null => {
        const dc = context.dc as Maybe<CheckDC>;
        if (!dc) return null;
        if (["ac", "armor"].includes(dc.slug ?? "")) {
            const targetActor = ((): ActorPF2e | null => {
                const target = context.target;
                if (!target?.actor) return null;

                const actorOrToken = fromUuidSync(target.actor);

                return isActorPF2e(actorOrToken) ? actorOrToken : (isTokenDocumentPF2e(actorOrToken) ? actorOrToken.actor : null);
            })();
            dc.statistic = targetActor?.armorClass;
        }
        return new SimplifiedDegreeOfSuccess(newRoll, dc, context.dosAdjustments);
    })();
    const useNewRoll = keptRoll === newRoll;

    if (useNewRoll && degree) {
        newRoll.options.degreeOfSuccess = degree.value;
        context.outcome = SIMPLIFIED_DEGREE_OF_SUCCESS_STRINGS[degree.value];
    }

    const renders = {
        // Tu zamiast Check.renderReroll dałem game.pf2e.Check, bo to też system udostępnia
        old: await game.pf2e.Check.renderReroll(oldRoll, { isOld: true, resource }),
        new: await game.pf2e.Check.renderReroll(newRoll, { isOld: false, resource }),
    };

    const rerollIcon = fontAwesomeIcon(
        resource?.slug === "hero-points"
            ? "hospital-symbol"
            : resource?.slug === "mythic-points"
                ? "circle-m"
                : "dice",
    );
    rerollIcon.classList.add("reroll-indicator");
    rerollIcon.dataset.tooltip = rerollFlavor;

    const oldFlavor = message.flavor ?? "";
    const newFlavor = useNewRoll
        ? await (async (): Promise<string> => {
                const parsedFlavor = document.createElement("div");
                parsedFlavor.innerHTML = oldFlavor;
                const targeting = actor.uuid === context.origin?.actor;
                const self = targeting ? context.origin : context.target;
                const opposer = context.target?.actor === actor.uuid ? context.origin : context.target;
                const targetFlavor = await createResultFlavor({ degree, self, opposer, targeting }) as HTMLElement | null; 
                if (targetFlavor) {
                    htmlQuery(parsedFlavor, ".target-dc-result")?.replaceWith(targetFlavor);
                }

                // Add mythic proficiency tag
                if (resource?.slug === "mythic-points") {
                    const proficiencyTag = htmlQuery(parsedFlavor, "span[data-slug=proficiency]");
                    if (proficiencyTag) {
                        const mythicTag = proficiencyTag.cloneNode() as HTMLElement;
                        const mythicValue = signedInteger(mythicRerollProficiencyBonus + (pwolVariant ? 0 : actor.level), {
                            emptyStringZero: true,
                        });
                        mythicTag.innerHTML = `${mythicRerollProficiencyLabel} ${mythicValue}`;
                        if (replacedProficiencyWithMythic) proficiencyTag.style.textDecorationLine = "line-through";
                        else mythicTag.style.textDecorationLine = "line-through";
                        proficiencyTag.after(mythicTag);
                    }
                }
                

                htmlQuery(parsedFlavor, "ul.notes")?.remove();
                
                const newNotes = context.notes?.map((n) => new SimplifiedRollNotePF2e(n)) ?? [];
                const notesEl = SimplifiedRollNotePF2e.notesToHTML(
                    newNotes.filter((note) => {
                        if (!context.dc || note.outcome.length === 0) {
                            // Always show the note if the check has no DC or no outcome is specified.
                            return true;
                        }
                        const outcome = context.outcome ?? context.unadjustedOutcome;
                        return !!(outcome && note.outcome.includes(outcome));
                    }),
                );
                if (notesEl) parsedFlavor.append(notesEl);

                return parsedFlavor.innerHTML;
            })()
        : oldFlavor;

    // If this was an initiative roll, apply the result to the current encounter
    const initiativeRoll = !!message.flags.core?.initiativeRoll;
    if (initiativeRoll) {
        const combatant = message.token?.combatant;
        await combatant?.parent.setInitiative(combatant.id, newRoll.total);
    }

    await message.delete({ render: false });

    await keptRoll.toMessage(
        {
            content: `<div class="${oldRollClass}">${renders.old}</div><div class="reroll-second ${newRollClass}">${renders.new}</div>`,
            flavor: `${rerollIcon.outerHTML}${newFlavor}`,
            speaker: message.speaker,
            flags: { core: { initiativeRoll }, [SYSTEM_ID]: systemFlags },
        },
        { rollMode: context.rollMode },
    );
}

export { rerollFromMessage }