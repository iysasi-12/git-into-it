import type { TravelOption } from "@app/shared";
import { money } from "../lib/format";

type Props = {
  options: TravelOption[];
};

export function CostChart({ options }: Props) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Cost Breakdown</h2>
      {options.map((option) => (
        <div key={option.id}>
          <p className="font-medium">{option.label}</p>
          <ul>
            {option            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}