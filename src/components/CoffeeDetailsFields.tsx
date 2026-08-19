import { DRINK_STYLES, FILTER_METHODS } from "../lib/coffee";
import { useT } from "../lib/useT";
import type { DrinkStyle, FilterMethod } from "../types";

interface Props {
  drinkStyles: DrinkStyle[];
  onDrinkStylesChange: (value: DrinkStyle[]) => void;
  espressoMachineBrand: string;
  onEspressoMachineBrandChange: (value: string) => void;
  espressoGrinderBrand: string;
  onEspressoGrinderBrandChange: (value: string) => void;
  filterGrinderBrand: string;
  onFilterGrinderBrandChange: (value: string) => void;
  filterMethods: FilterMethod[];
  onFilterMethodsChange: (value: FilterMethod[]) => void;
}

const toggle = <T extends string>(values: T[], value: T): T[] =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

/** One coffee-details form used in both intake paths so their options cannot drift. */
export function CoffeeDetailsFields(props: Props) {
  const { t, lang } = useT();
  const hasEspresso = props.drinkStyles.includes("espresso");
  const hasFilter = props.drinkStyles.includes("filter");

  return (
    <div className="coffee-details">
      <fieldset className="submit__choice">
        <legend>{t("coffee.program")}</legend>
        <div className="submit__choice-row">
          {DRINK_STYLES.map((style) => {
            const on = props.drinkStyles.includes(style.id);
            return (
              <button
                key={style.id}
                type="button"
                className={`chip chip--cat ${on ? "is-on" : ""}`}
                onClick={() => props.onDrinkStylesChange(toggle(props.drinkStyles, style.id))}
                aria-pressed={on}
              >
                <span aria-hidden="true">{style.icon}</span> {style.label[lang]}
              </button>
            );
          })}
        </div>
        <p className="field__hint">{t("coffee.programHint")}</p>
      </fieldset>

      {hasEspresso && (
        <div className="coffee-details__group">
          <h4>{t("coffee.espressoSetup")}</h4>
          <div className="field-row">
            <label className="field">
              <span>{t("coffee.espressoMachine")}</span>
              <input
                value={props.espressoMachineBrand}
                onChange={(event) => props.onEspressoMachineBrandChange(event.target.value)}
                placeholder={t("coffee.brandPlaceholder")}
              />
            </label>
            <label className="field">
              <span>{t("coffee.espressoGrinder")}</span>
              <input
                value={props.espressoGrinderBrand}
                onChange={(event) => props.onEspressoGrinderBrandChange(event.target.value)}
                placeholder={t("coffee.brandPlaceholder")}
              />
            </label>
          </div>
        </div>
      )}

      {hasFilter && (
        <div className="coffee-details__group">
          <h4>{t("coffee.filterSetup")}</h4>
          <label className="field">
            <span>{t("coffee.filterGrinder")}</span>
            <input
              value={props.filterGrinderBrand}
              onChange={(event) => props.onFilterGrinderBrandChange(event.target.value)}
              placeholder={t("coffee.brandPlaceholder")}
            />
          </label>
          <fieldset className="submit__choice">
            <legend>{t("coffee.filterMethods")}</legend>
            <div className="submit__choice-row">
              {FILTER_METHODS.map((method) => {
                const on = props.filterMethods.includes(method.id);
                return (
                  <button
                    key={method.id}
                    type="button"
                    className={`chip chip--cat ${on ? "is-on" : ""}`}
                    onClick={() => props.onFilterMethodsChange(toggle(props.filterMethods, method.id))}
                    aria-pressed={on}
                  >
                    {method.label[lang]}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
