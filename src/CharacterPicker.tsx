import { CHARACTERS, characterId, type CharacterId } from "../shared/avatars";
import { useAccess } from "./Access";
export default function CharacterPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: unknown;
  onChange: (value: CharacterId) => void;
  disabled?: boolean;
}) {
  const { t } = useAccess();
  return (
    <fieldset className="character-picker">
      <legend>
        {t("Choose your character")}
        <span className="free-label">{t("FREE")}</span>
      </legend>
      <div className="character-choices">
        {CHARACTERS.map((c) => (
          <button
            type="button"
            key={c.id}
            disabled={disabled}
            aria-label={`${t("Choose")} ${c.name}`}
            aria-pressed={characterId(value) === c.id}
            onClick={() => onChange(c.id)}
          >
            <img src={`/assets/character-${c.id}-portrait.png`} alt="" />
            <strong>{c.name}</strong>
            <small>{t(c.description)}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
