import { CHARACTERS, characterId, type CharacterId } from "../shared/avatars";

export default function CharacterPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: unknown;
  onChange: (value: CharacterId) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="character-picker">
      <legend>
        Choose your character <span className="free-label">FREE</span>
      </legend>
      <div className="character-choices">
        {CHARACTERS.map((c) => (
          <button
            type="button"
            key={c.id}
            disabled={disabled}
            aria-label={`Choose ${c.name}`}
            aria-pressed={characterId(value) === c.id}
            onClick={() => onChange(c.id)}
          >
            <img src={`/assets/character-${c.id}-portrait.png`} alt="" />
            <strong>{c.name}</strong>
            <small>{c.description}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
