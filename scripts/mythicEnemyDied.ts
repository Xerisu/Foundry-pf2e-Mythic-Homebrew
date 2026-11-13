import { ActiveEffectPF2e, ActorPF2e } from "pf2e-types";
import { moduleId, settings } from "./constants.ts";
import { sample } from "lodash";
import { mythicHeroes } from "./util.ts";

/*
async function mythicEnemyDiedMessageOld(token : TokenPF2e, effect : string, active : boolean) {
    if (game.settings.get(moduleId, settings.mythicEnemyDied) as boolean === false) {
        return;
    }

    if (!game.user.isGM) {
        return;
    }
    console.log(token.actor?.isDead);
    if (effect === "dead" && active === true) {
        if (token.actor?.system.traits?.value.includes("mythic") ?? false) {
            let randomCharacter =  sample( mythicHeroes() );

            const templateData = {
                randomCharacterName: randomCharacter?.name ?? "None"
            };

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
*/


async function mythicEnemyDiedMessage(effect : ActiveEffectPF2e<ActorPF2e>, _data1 : any, _data2 : any, _effectId : string) {
    if (effect.name !== "Dead") {
        return;
    }

    if (game.settings.get(moduleId, settings.mythicEnemyDied) as boolean === false) {
        return;
    }

    if (!game.user.isGM) {
        return;
    }

    const mythicActor = effect.target as ActorPF2e;
    if(!mythicActor) {
        return;
    }

    if(!mythicActor.system.traits?.value.includes("mythic")) {
        return;
    }

    let randomCharacter =  sample( mythicHeroes() );

    const templateData = {
        randomCharacterName: randomCharacter?.name ?? "None"
    };

    // Find gm
    const owners = game.users.filter(u => u.isGM).map(u => u.id);
    
    // @ts-expect-error
    const content = await renderTemplate(`modules/${moduleId}/templates/mythic-enemy-died.hbs`, templateData);
    
    await ChatMessage.create({
        content: content,
        speaker: ChatMessage.getSpeaker({ token: mythicActor.token, actor: mythicActor }),
        whisper: owners
    });
}

export { mythicEnemyDiedMessage }