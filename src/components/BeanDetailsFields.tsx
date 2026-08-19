import { ROAST_LEVELS, SOURCING_MODELS } from "../lib/coffee";
import { useT } from "../lib/useT";
import type { RoastLevel, SourcingModel } from "../types";

interface Props {
  roastLevels: RoastLevel[];
  onRoastLevelsChange: (value: RoastLevel[]) => void;
  cuppingScoreMin?: number;
  onCuppingScoreMinChange: (value: number | undefined) => void;
  cuppingScoreMax?: number;
  onCuppingScoreMaxChange: (value: number | undefined) => void;
  isRoastery: boolean;
  sourcingModel?: SourcingModel;
  onSourcingModelChange: (value: SourcingModel | undefined) => void;
}

const toggle = <T extends string>(values: T[], value: T): T[] =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

const scoreFrom = (raw: string): number | undefined => {
  if (!raw.trim()) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined;
};

/** Exact same bean vocabulary in owner intake and the team's place editor. */
export function BeanDetailsFields(props: Props) {
  const { t, lang } = useT();
  const invalidRange =
    typeof props.cuppingScoreMin === "number" &&
    typeof props.cuppingScoreMax === "number" &&
    props.cuppingScoreMin > props.cuppingScoreMax;

  return (
    <div className="coffee-details bean-details">
      <fieldset className="submit__choice">
        <legend>{t("beans.roastLevels")}</legend>
        <div className="submit__choice-row">
          {ROAST_LEVELS.map((level) => {
            const on = props.roastLevels.includes(level.id);
            return (
              <button
                key={level.id}
                type="button"
                className={`chip chip--cat ${on ? "is-on" : ""}`}
                onClick={() => props.onRoastLevelsChange(toggle(props.roastLevels, level.id))}
                aria-pressed={on}
              >
                <span aria-hidden="true">{level.icon}</span> {level.label[lang]}
              </button>
            );
          })}
        </div>
        <p className="field__hint">{t("beans.roastHint")}</p>
      </fieldset>

      <div className="coffee-details__group">
        <h4>{t("beans.cuppingTitle")}</h4>
        <div className="field-row">
          <label className="field">
            <span>{t("beans.cuppingMin")}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.25"
              value={props.cuppingScoreMin ?? ""}
              onChange={(event) => props.onCuppingScoreMinChange(scoreFrom(event.target.value))}
              placeholder="84"
            />
          </label>
          <label className="field">
            <span>{t("beans.cuppingMax")}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="0.25"
              value={props.cuppingScoreMax ?? ""}
              onChange={(event) => props.onCuppingScoreMaxChange(scoreFrom(event.target.value))}
              placeholder="88.5"
            />
          </label>
        </div>
        <p className="field__hint">{t("beans.cuppingHint")}</p>
        {invalidRange && <p className="field__err">{t("beans.scoreRangeError")}</p>}
      </div>

      {props.isRoastery && (
        <div className="coffee-details__group">
          <fieldset className="submit__choice">
            <legend>{t("beans.sourcingTitle")}</legend>
            <div className="submit__choice-row">
              {SOURCING_MODELS.map((model) => {
                const on = props.sourcingModel === model.id;
                return (
                  <button
                    key={model.id}
                    type="button"
                    className={`chip chip--cat ${on ? "is-on" : ""}`}
                    onClick={() => props.onSourcingModelChange(on ? undefined : model.id)}
                    aria-pressed={on}
                  >
                    {model.label[lang]}
                  </button>
                );
              })}
            </div>
            <p className="field__hint">{t("beans.sourcingHint")}</p>
          </fieldset>
        </div>
      )}
    </div>
  );
}
