import { useUnitDesignations } from "@/lib/unit-designations";

/**
 * Choose which contracted designation (role slot) a person fills at a unit.
 * Options come from the unit's active client contract resources.
 */
export function UnitDesignationSelect({
  unitId,
  value,
  onChange,
  disabled,
  className = "",
}: {
  unitId: string;
  value: string | null;
  onChange: (designationId: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const q = useUnitDesignations(unitId);
  const options = q.data ?? [];

  return (
    <div className={className}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled || q.isLoading || options.length === 0}
        className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-[12px] disabled:opacity-60"
      >
        <option value="">
          {q.isLoading
            ? "Loading designations…"
            : options.length === 0
              ? "No designations on this unit's contract"
              : "Select designation…"}
        </option>
        {options.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      {!q.isLoading && options.length === 0 && (
        <p className="mt-1 text-[10px] font-medium text-amber-600">
          This unit's contract has no resources — ask an admin to add designations before deploying anyone here.
        </p>
      )}
    </div>
  );
}
