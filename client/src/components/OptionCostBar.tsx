type LineItem = {
  category: string;
  cost: number;
};

type Option = {
  id: string;
  name: string;
  lineItems: LineItem[];
  totalCost: number;
};

type CostChartProps = {
  options: Option[];
};

export default function CostChart({
  options,
}: CostChartProps) {
  return (
    <div className="space-y-6 mb-6">
      <h2 className="text-xl font-bold">
        Cost Breakdown
      </h2>

      {options.map((option) => {
        const busCost = option.lineItems
          .filter(
            (item) =>
              item.category.toLowerCase() === "bus"
          )
          .reduce(
            (sum, item) => sum + item.cost,
            0
          );

        const hotelCost = option.lineItems
          .filter(
            (item) =>
              item.category.toLowerCase() === "hotel"
          )
          .reduce(
            (sum, item) => sum + item.cost,
            0
          );

        const mealCost = option.lineItems
          .filter(
            (item) =>
              item.category.toLowerCase() === "meals"
          )
          .reduce(
            (sum, item) => sum + item.cost,
            0
          );

        const total =
          busCost +
          hotelCost +
          mealCost;

        const busWidth =
          total > 0
            ? (busCost / total) * 100
            : 0;

        const hotelWidth =
          total > 0
            ? (hotelCost / total) * 100
            : 0;

        const mealWidth =
          total > 0
            ? (mealCost / total) * 100
            : 0;

        return (
          <div
            key={option.id}
            className="border rounded p-4"
          >
            <div className="flex justify-between mb-2">
              <span className="font-medium">
                {option.name}
              </span>

              <span>
                ${total.toFixed(2)}
              </span>
            </div>

            <div className="w-full h-8 flex overflow-hidden rounded">
              <div
                className="bg-blue-500"
                style={{
                  width: `${busWidth}%`,
                }}
              />

              <div
                className="bg-green-500"
                style={{
                  width: `${hotelWidth}%`,
                }}
              />

              <div
                className="bg-yellow-500"
                style={{
                  width: `${mealWidth}%`,
                }}
              />
            </div>

            <div className="flex gap-6 mt-2 text-sm">
              <div>
                <span className="text-blue-500">
                  ■
                </span>{" "}
                Bus: ${busCost.toFixed(2)}
              </div>

              <div>
                <span className="text-green-500">
                  ■
                </span>{" "}
                Hotel: $
                {hotelCost.toFixed(2)}
              </div>

              <div>
                <span className="text-yellow-500">
                  ■
                </span>{" "}
                Meals: $
                {mealCost.toFixed(2)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}