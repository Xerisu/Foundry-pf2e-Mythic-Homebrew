import { ActorPF2e } from "pf2e-types";
import { moduleId } from "./constants.ts";

var isMythicHandlerDialogOpen = false

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

type HeroPointHandlerTemplateActor = {
    id: string;
    name: string;
    radioId: string;
    checked: boolean;
};

type HeroPointHandlerTemplateData = {
    instructions: string;
    sessionStart: {
        instructions: string;
        resetTo: string;
        ignore: string;
    }

    actors: HeroPointHandlerTemplateActor[];
    submitShortLabel: string;
    stopShortLabel: string;
};

function getHeroPointHandlerTemplatePath(): string {
    return `modules/${moduleId}/templates/mythic-handler.hbs`;
}

async function buildHtml(): Promise<string> {
    const actors = mythicHeroes();
    const checkedSet = new Set<number>();


    const templateData: HeroPointHandlerTemplateData = {
        instructions: "Give players mythic points according to their deeds",
        sessionStart: {
            instructions: "Section 1: Session Start/Mythic deed",
            resetTo: "Add 3",
            ignore: "Do nothing"
        },
        actors: actors.map((actor, index) => {
            const currentHeroPoints = actor?.isOfType("character") ? actor.system.resources.heroPoints.value : 0;
            const maxHeroPoints = actor?.isOfType("character") ? actor.system.resources.heroPoints.max : 3;
            const ownerName =
                game.users?.find((u) => !u.isGM && actor?.ownership[u.id] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
                    ?.name ?? "";
            const ownerSuffix = ownerName ? ` (${ownerName})` : "";
            return {
                id: actor.id,
                name: `${actor.name}${ownerSuffix} [${currentHeroPoints}/${maxHeroPoints}]`,
                radioId: `characters-${index}`,
                checked: checkedSet.has(index),
            };
        }),
        submitShortLabel: "Submit",
        stopShortLabel: "Stop",
    };

    // @ts-expect-error TODO Fix typing
    return renderTemplate(getHeroPointHandlerTemplatePath(), templateData);
}

export async function mythicPointHandler() {
    if (isMythicHandlerDialogOpen) {
        return;
    }
    isMythicHandlerDialogOpen = true;
    try {
        const dialogWidth = 375;
        const dialogHeight = 660;
        const title = "Mythic Point Handler";
        const content = await buildHtml();

        const renderHookId = Hooks.on("renderDialogV2", (_app: foundry.applications.api.DialogV2) => {
            /*if (!app.options.window.contentClasses?.includes("hero-point-handler-window")) {
                return;
            }
            Hooks.off("renderDialogV2", renderHookId);

            const el: HTMLElement = app.element;
            el.style.top = `${Math.round((window.innerHeight - dialogHeight) / 2)}px`;
            el.style.left = `${Math.round((window.innerWidth - dialogWidth) / 2)}px`;
            el.style.width = `${dialogWidth}px`;
            el.style.height = `${dialogHeight}px`;

            const titleEl = el.querySelector<HTMLElement>(".window-title");
            if (titleEl) {
                titleEl.innerHTML = title;
            }

            const footerButtons = el.querySelectorAll<HTMLButtonElement>("footer button[data-action]");
            for (const footerButton of footerButtons) {
                switch (footerButton.dataset.action) {
                    case "timer":
                        footerButton.title = submitTooltip;
                        footerButton.setAttribute("aria-label", submitTooltip);
                        break;
                    case "noTimer":
                        footerButton.title = stopTooltip;
                        footerButton.setAttribute("aria-label", stopTooltip);
                        break;
                }
            }*/
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
                contentClasses: ["hero-point-handler-window"],
                icon: "fa-solid fa-hourglass",
            },
            content,
            buttons: [
                {
                    action: "addMythicPoint",
                    // todo: localization
                    label: "Add Mythic Points",
                    default: true,
                    callback: async (_event, _button, _dialog) => {
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

