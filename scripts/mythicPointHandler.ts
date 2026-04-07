import { ActorPF2e } from "pf2e-types";
import { moduleId } from "./constants.ts";

var isMythicHandlerDialogOpen = false

// Types
type MythicHandlerTemplateActor = {
    id: string;
    name: string;
    checkboxId: string;
    checked: boolean;
};

type MythicHandlerTemplateData = {
    instructions: string;
    sessionStart: {
        instructions: string;
        resetTo: string;
        
    }

    killMythicEnemy: {
        instructions: string;
        hint: string;
    }

    followTheCalling: {
        instructions: string;
        hint: string;
    } 
    bonusPoint: string;
    ignore: string;

    actors: MythicHandlerTemplateActor[];
    submitShortLabel: string;
    stopShortLabel: string;
};

type MythicPointRecipient = "ALL" | "NONE" | string;

// Main functions
async function buildHtml(): Promise<string> {
    const actors = mythicHeroes();
    const checkedSet = new Set<number>();


    const templateData: MythicHandlerTemplateData = {
        instructions: "Give players mythic points according to their deeds",
        sessionStart: {
            instructions: "Session Start/Mythic deed",
            resetTo: "Add 3",
        },
        killMythicEnemy: {
            instructions: "Killing the mythic enemy",
            hint: "Selected person, usually the enemy's killer or MVP, will get 2 mythic points, rest will get 1. You MUST select at least 1 person."
        },
        followTheCalling: {
            instructions: "Follow the calling",
            hint: "Selected person will get 1 mythic point, rewarded once per day for crit success on skill described in character's calling."
        },
        bonusPoint: "Give bonus mythic point",
        ignore: "Do nothing",
        actors: actors.map((actor, index) => {
            const currentMythicPoints = actor?.isOfType("character") ? actor.system.resources.mythicPoints.value : 0;
            const maxMythicPoints = actor?.isOfType("character") ? actor.system.resources.mythicPoints.max : 3;
            const ownerName =
                game.users?.find((u) => !u.isGM && actor?.ownership[u.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
                    ?.name ?? "";
            const ownerSuffix = ownerName ? ` (${ownerName})` : "";
            return {
                id: actor.id,
                name: `${actor.name}${ownerSuffix} [${currentMythicPoints}/${maxMythicPoints}]`,
                checkboxId: `characters-${index}`,
                checked: checkedSet.has(index),
            };
        }),
        submitShortLabel: "Submit",
        stopShortLabel: "Stop",
    };

    // @ts-expect-error TODO Fix typing
    return renderTemplate(getMythicHandlerTemplatePath(), templateData);
}

export async function mythicPointHandler() {
    if (isMythicHandlerDialogOpen) {
        return;
    }
    isMythicHandlerDialogOpen = true;
    const actors = mythicHeroes();
    var dialogAdjustment = (actors.length - 3)
    if (dialogAdjustment < 0) dialogAdjustment = 0
    try {
        const dialogWidth = 850;
        const dialogHeight = 630 + dialogAdjustment * 85;
        const title = "Mythic Point Handler";
        const content = await buildHtml();

        const renderHookId = Hooks.on("renderDialogV2", (app: foundry.applications.api.DialogV2) => {
            if (!app.options.window.contentClasses?.includes("mythic-point-handler-window")) {
                return;
            }
            Hooks.off("renderDialogV2", renderHookId);
        });

        const result = <boolean | null>await foundry.applications.api.DialogV2.wait({
            position: {
                top: Math.round((window.innerHeight - dialogHeight) / 2),
                left: Math.round((window.innerWidth - dialogWidth) / 2),
                width: dialogWidth,
                height: dialogHeight,
            },
            window: {
                title,
                resizable: true,
                positioned: true,
                contentClasses: ["mythic-point-handler-window"],
                icon: "fa-solid fa-crown",
            },
            content,
            buttons: [
                {
                    action: "addMythicPoint",
                    // todo: localization
                    label: "Add Mythic Points",
                    default: true,
                    callback: async (_event, button, _dialog) => {
                        handleDialogResponse(button.form ?? button.closest("form"));
                        return true;
                    },
                },
            ],
            close: () => {
                Hooks.off("renderDialogV2", renderHookId);
            },
        });

        if (!result) {
            return;
        }


    } finally {
        isMythicHandlerDialogOpen = false;
    }
}

// Helper functions
function getMythicHandlerTemplatePath(): string {
    return `modules/${moduleId}/templates/mythic-handler.hbs`;
}
/**
 * Retrieves the list of party members that are characters
 *
 * @return {Array<Actor>} The list of hero actors.
*/
function mythicHeroes(): ActorPF2e[] {
    return (
        game.actors?.party?.members
            .filter((actor) => actor?.isOfType("character"))
            .filter((actor) => !actor?.system.traits?.value.toString().includes("minion"))
            .filter((actor) => !actor?.system.traits?.value.toString().includes("eidolon"))
            .filter((actor) => actor?.system.resources.mythicPoints?.max ? (actor?.system.resources.mythicPoints?.max > 0) : false) || []
    );
}

/**
 * Adds mythic points to the specified actor or all actors.
 *
 * @param {number} mythicpoints - The number of mythic points to add.
 * @param {any} [actorId="ALL"] - The ID of the actor to add mythic points to. If "ALL" is specified, mythic points will be added to all actors.
 * @return {Promise<void>} - A promise that resolves when the mythic points have been added.
 */
async function addMythicPoints(mythicpoints: number, actorId: MythicPointRecipient = "ALL"): Promise<void> {
    let actors: ActorPF2e[];
    switch (actorId) {
        case "ALL":
            actors = mythicHeroes();
            break;
        case "NONE":
            actors = [];
            break;
        default:
            actors = game.actors?.has(actorId) ? [game.actors.get(actorId, { strict: true })] : [];
            break;
    }

    for (const actor of actors) {
        if (!actor.isOfType("character")) {
            continue;
        }

        const system = actor.system;
        const value = Math.min(system.resources.mythicPoints.value + mythicpoints, actor.system.resources.mythicPoints.max);
        await actor.update({
            "system.resources.mythicPoints.value": value,
        });
    }
}

// TODO: Dodac send message
async function handleDialogResponse(element: ParentNode | null): Promise<void> {
    if (!element) {
        return;
    }

    const sessionStartEl = element.querySelector<HTMLInputElement>("input[name=\"sessionStart\"]:checked");
    const sessionStart = sessionStartEl ? sessionStartEl.value : "ignore";

    const killMythicEnemyEl = element.querySelectorAll<HTMLInputElement>("input[name=\"killMythicEnemy\"]:checked");
    const killMythicEnemyActors: string[] = Array.from(killMythicEnemyEl).map((el) => el.value);

    const followTheCallingEl = element.querySelector<HTMLInputElement>("input[name=\"followTheCalling\"]:checked");
    const followTheCalling = followTheCallingEl ? followTheCallingEl.value : "ignore";

    const bonusPointEls = element.querySelectorAll<HTMLInputElement>("input[name=\"bonusPoint\"]:checked");
    const bonusPointActors: string[] = Array.from(bonusPointEls).map((el) => el.value);

    if (sessionStart != "ignore") {
        await addMythicPoints(3);
        //const message = "Tu bedzie wiadomosc ze start sesji i wgl";
        //sendMessage(message);
    } 
    if (killMythicEnemyActors.length > 0) {
        await addMythicPoints(1);
        for (const actor of killMythicEnemyActors) {
                await addMythicPoints(1,actor);
        }
    }
    if (followTheCalling != "ignore") {
        await addMythicPoints(1, followTheCalling);
        // todo: dodac cooldown
    }
    if (bonusPointActors.length > 0) {
        for (const actor of bonusPointActors) {
                await addMythicPoints(1,actor);
        }
    }

}