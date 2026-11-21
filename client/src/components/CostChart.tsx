type LineItem = {
  category: "bus" | "hotel" | "meals";
  amount: number;
};

type Option = {
  id: string;
  name: string;
  lineItems: LineItem[];
};
export function CostChart({ options }: { options: Option[] }) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Cost Breakdown</h2>
      {options.map((option) => (
        <div key={option.id}>
          <p className="font-medium">{option.name}</p>
          <ul>
            {option.lineItems.map((item, index) => (
              <li key={index}>
                {item.category}: ${item.amount.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}