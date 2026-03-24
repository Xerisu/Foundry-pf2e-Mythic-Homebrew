import { ActorPF2e, ActorTokenFlag, CheckCheckContext, CheckModifier, DegreeOfSuccessString, RollOrigin, RollTarget, ScenePF2e, TokenDocumentPF2e } from "pf2e-types";
import { ErrorPF2e, isActorPF2e, isTokenDocumentPF2e, objectHasKey, signedInteger, sluggify, isStatisticDifficultyClass } from "./util.ts";
import { SIMPLIFIED_DEGREE_OF_SUCCESS_STRINGS, SimplifiedDegreeOfSuccess } from "./SimplifiedDegreeOfSuccess.ts";
import { createHTMLElement, parseHTML } from "./htmlHelpers.ts";

async function createResultFlavor({
    degree,
    self,
    opposer,
    targeting,
}: CreateResultFlavorParams): Promise<HTMLElement | null> {
    if (!degree || !self?.actor) return null;

    const dc = degree.dc;
    const needsDCParam = !!dc.label && Number.isInteger(dc.value) && !dc.label.includes("{dc}");
    const customLabel =
        needsDCParam && dc.label ? `<dc>${game.i18n.localize(dc.label)}: {dc}</dc>` : (dc.label ?? null);

    const opposingActor = await (async (): Promise<ActorPF2e | null> => {
        if (!opposer?.actor) return null;
        if (isActorPF2e(opposer.actor)) return opposer.actor;

        // This is a context flag: get the actor via UUID
        const maybeActor = await fromUuid(opposer.actor);
        return isActorPF2e(maybeActor)
            ? maybeActor
            : isTokenDocumentPF2e(maybeActor)
                ? maybeActor.actor
                : null;
    })();

    // Not actually included in the template, but used for creating other template data
    const opposerData = await (async (): Promise<{ name: string; visible: boolean } | null> => {
        if (!opposer) return null;

        const token = await (async (): Promise<TokenDocumentPF2e | null> => {
            if (!opposer.token) return null;
            if (isTokenDocumentPF2e(opposer.token)) return opposer.token;
            if (opposingActor?.token) return opposingActor.token;

            // This is from a context flag: get the actor via UUID
            return fromUuid(opposer.token) as Promise<TokenDocumentPF2e<ScenePF2e> | null>;
        })();

        const canSeeTokenName = (token ?? new CONFIG.Token.documentClass(opposingActor?.prototypeToken.toObject() ?? {}))
            .playersCanSeeName;
        const canSeeName = canSeeTokenName || !game.pf2e.settings.tokens.nameVisibility;

        return {
            name: token?.name ?? opposingActor?.name ?? "",
            visible: !!canSeeName,
        };
    })();

    const checkDCs = CONFIG.PF2E.checkDCs;

    // DC, circumstance adjustments, and the target's name
    const dcData = ((): ResultFlavorTemplateData["dc"] => {
        const dcSlug = ((): string | null => {
            const fromParams =
                dc.slug ?? (isStatisticDifficultyClass(dc.statistic) ? dc.statistic.parent.slug : null);
            return fromParams === "ac" ? "armor" : (fromParams?.replace(/-dc$/, "") ?? null);
        })();
        const dcType = game.i18n.localize(
            dc.label?.trim() ||
                game.i18n.localize(
                    objectHasKey(checkDCs.Specific, dcSlug) ? checkDCs.Specific[dcSlug] : checkDCs.Unspecific,
                ),
        );

        // Get any circumstance penalties or bonuses to the target's DC
        const circumstances =
            isStatisticDifficultyClass(dc.statistic)
                ? dc.statistic.modifiers.filter((m) => m.enabled && m.type === "circumstance")
                : [];
        const preadjustedDC =
            circumstances.length > 0 && dc.statistic
                ? dc.value - circumstances.reduce((total, c) => total + c.modifier, 0)
                : (dc.value ?? null);

        const visible = opposingActor?.hasPlayerOwner || dc.visible || game.pf2e.settings.metagame.dcs;

        if (typeof preadjustedDC !== "number" || circumstances.length === 0) {
            const labelKey = game.i18n.localize(
                opposerData
                    ? targeting
                        ? checkDCs.Label.WithTarget
                        : checkDCs.Label.WithOrigin
                    : (customLabel ?? checkDCs.Label.NoTarget),
            );
            const markup = game.i18n.format(labelKey, { dcType, dc: dc.value, opposer: opposerData?.name ?? null });

            return { markup, visible };
        }

        const adjustment = {
            preadjusted: preadjustedDC,
            direction:
                preadjustedDC < dc.value ? "increased" : preadjustedDC > dc.value ? "decreased" : "no-change",
            circumstances: circumstances.map((c) => ({ label: c.label, value: c.modifier })),
        } as const;

        // If the adjustment direction is "no-change", the bonuses and penalties summed to zero
        const translation =
            adjustment.direction === "no-change" ? checkDCs.Label.NoChangeTarget : checkDCs.Label.AdjustedTarget;

        const markup = game.i18n.format(translation, {
            opposer: opposerData?.name ?? game.user.name,
            dcType,
            preadjusted: preadjustedDC,
            adjusted: dc.value,
        });

        return { markup, visible, adjustment };
    })();

    // The result: degree of success (with adjustment if applicable) and visibility setting
    const resultData = ((): ResultFlavorTemplateData["result"] => {
        const offset = {
            value: new Intl.NumberFormat(game.i18n.lang, {
                maximumFractionDigits: 0,
                signDisplay: "always",
                useGrouping: false,
            }).format(degree.rollTotal - dc.value),
            visible: dc.visible,
        };

        const checkOrAttack = sluggify(dc.scope ?? "Check", { camel: "bactrian" });
        const locPath = (checkOrAttack: string, dosKey: DegreeOfSuccessString) =>
            `PF2E.Check.Result.Degree.${checkOrAttack}.${dosKey}`;
        const unadjusted = game.i18n.localize(locPath(checkOrAttack, SIMPLIFIED_DEGREE_OF_SUCCESS_STRINGS[degree.unadjusted]));
        const [adjusted, locKey] = degree.adjustment
            ? [game.i18n.localize(locPath(checkOrAttack, SIMPLIFIED_DEGREE_OF_SUCCESS_STRINGS[degree.value])), "AdjustedLabel"]
            : [unadjusted, "Label"];

        const markup = game.i18n.format(`PF2E.Check.Result.${locKey}`, {
            adjusted,
            unadjusted,
            offset: offset.value,
        });
        const visible = game.pf2e.settings.metagame.results;

        return { markup, visible };
    })();

    // Render the template and replace quasi-XML nodes with visibility-data-containing HTML elements
    // @ts-expect-error
    const rendered = await renderTemplate(
        `systems/pf2e/templates/chat/check/target-dc-result.hbs`,
        {
            dc: dcData,
            result: resultData,
        },
    );

    const html = parseHTML(rendered);
    const convertXMLNode = game.pf2e.TextEditor.convertXMLNode;

    if (opposerData) {
        convertXMLNode(html, "opposer", { visible: opposerData.visible, whose: "opposer" });
    }
    convertXMLNode(html, "dc", { visible: dcData.visible, whose: "opposer" });
    const adjustment = dcData.adjustment;
    if (adjustment) {
        convertXMLNode(html, "preadjusted", { classes: ["unadjusted"] });

        // Add circumstance bonuses/penalties for tooltip content
        const adjustedNode = convertXMLNode(html, "adjusted", {
            classes: ["adjusted", adjustment.direction],
        });
        if (!adjustedNode) throw ErrorPF2e("Unexpected error processing roll template");

        if (adjustment.circumstances.length > 0) {
            adjustedNode.dataset.tooltip = adjustment.circumstances
                .map(
                    (a: { label: string; value: number }) =>
                        createHTMLElement("div", { children: [`${a.label}: ${signedInteger(a.value)}`] }).outerHTML,
                )
                .join("\n");
        }
    }
    convertXMLNode(html, "unadjusted", {
        visible: resultData.visible,
        classes: degree.adjustment ? ["unadjusted"] : [SIMPLIFIED_DEGREE_OF_SUCCESS_STRINGS[degree.value]],
    });
    if (degree.adjustment) {
        const adjustedNode = convertXMLNode(html, "adjusted", {
            visible: resultData.visible,
            classes: [SIMPLIFIED_DEGREE_OF_SUCCESS_STRINGS[degree.value], "adjusted"],
        });
        if (!adjustedNode) throw ErrorPF2e("Unexpected error processing roll template");
        adjustedNode.dataset.tooltip = degree.adjustment.label;
    }

    convertXMLNode(html, "offset", { visible: dcData.visible, whose: "opposer" });

    // If target and DC are both hidden from view, hide both
    if (!opposerData?.visible && !dcData.visible) {
        const targetDC = html.querySelector<HTMLElement>(".target-dc");
        if (targetDC) targetDC.dataset.visibility = "gm";

        // If result is also hidden, hide everything
        if (!resultData.visible) {
            html.dataset.visibility = "gm";
        }
    }

    return html;
}

interface CreateResultFlavorParams {
    degree: SimplifiedDegreeOfSuccess | null;
    self: RollOrigin | RollTarget | ActorTokenFlag | null;
    opposer?: RollOrigin | RollTarget | ActorTokenFlag | null;
    /** Whether `self` is targeting the `opposer` (or otherwise being targeted by it) */
    targeting: boolean;
}

interface ResultFlavorTemplateData {
    dc: {
        markup: string;
        visible: boolean;
        adjustment?: {
            preadjusted: number;
            direction: "increased" | "decreased" | "no-change";
            circumstances: { label: string; value: number }[];
        };
    };
    result: {
        markup: string;
        visible: boolean;
    };
}

interface CreateTagFlavorParams {
    check: CheckModifier;
    context: CheckCheckContext;
    extraTags: string[];
}

export {createResultFlavor, type CreateTagFlavorParams}