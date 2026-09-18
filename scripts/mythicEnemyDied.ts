import { TokenPF2e } from "pf2e-types";
import { moduleId, settings } from "./constants.ts";

async function mythicEnemyDiedMessage(token : TokenPF2e, effect : string, active : boolean) {
    if (game.settings.get(moduleId, settings.mythicEnemyDied) as boolean === false) {
        return;
    }
    if (!game.user.isGM) {
        return;
    }
    if (effect === "dead" && active === true) {
        if (token.actor?.system.traits?.value.includes("mythic") ?? false) {
            // todo: Dodać losową osobę z drużyny co zabiła
            let templateData = {};
            //templateData.actor = actor;

            // Find gm
            const owners = game.users.filter(u => u.isGM).map(u => u.id);
           
            // @ts-expect-error
            const content = await renderTemplate(`modules/${moduleId}/templates/mythic-enemy-died.hbs`, templateData);
            
            await ChatMessage.create({
                content: content,
                speaker: ChatMessage.getSpeaker({ token: token.document, actor: token.actor }),
                whisper: owners
            });
        }
    }
}

export { mythicEnemyDiedMessage }