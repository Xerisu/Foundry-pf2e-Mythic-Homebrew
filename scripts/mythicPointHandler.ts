import { ActorPF2e } from "pf2e-types";

var isMythicHandlerDialogOpen = false

/**
 * Retrieves the list of party members that are characters
 *
 * @return {Array<Actor>} The list of hero actors.
*/
function heroes(): ActorPF2e[] {
    return (
        game.actors?.party?.members
            .filter((actor) => actor?.isOfType("character"))
            .filter((actor) => !actor?.system.traits?.value.toString().includes("minion"))
            .filter((actor) => !actor?.system.traits?.value.toString().includes("eidolon")) || []
    );
}


export async function mythicPointHandler() {
    if (isMythicHandlerDialogOpen) {
        return;
    }
    isMythicHandlerDialogOpen = true;

    ui.notifications.error("Success!!")
}

