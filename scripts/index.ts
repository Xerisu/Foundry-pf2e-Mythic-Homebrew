import {moduleId, settings} from "./constants.js"

Hooks.once('init', async function() {
    game.settings.register(
        moduleId, 
        settings.mythicRerollProficiencyBonus, 
        {
            name: "settings.mythicRerollProficiencyBonus.name",
            hint: "settings.mythicRerollProficiencyBonus.hint",
            scope: "world",
            config: true,
            type: Number,
            default: 10
        }
    );
    game.settings.register(
        moduleId, 
        settings.mythicRerollProficiencyLabel, 
        {
            name: "settings.mythicRerollProficiencyLabel.name",
            hint: "settings.mythicRerollProficiencyLabel.hint",
            scope: "world",
            config: true,
            type: String,
            default: "Mythic"
        }
    );
    game.settings.register(
        moduleId, 
        settings.allowFlatchecks, 
        {
            name: "settings.allowFlatchecks.name",
            hint: "settings.allowFlatchecks.hint",
            scope: "world",
            config: true,
            type: Boolean,
            default: false
        }
    );
    game.settings.register(
        moduleId, 
        settings.monkeypatchMythicReroll, 
        {
            name: "settings.monkeypatchMythicReroll.name",
            hint: "settings.monkeypatchMythicReroll.hint",
            scope: "world",
            config: true,
            type: Boolean,
            default: false
        }
    );
});

Hooks.once('ready', async function() {
});
