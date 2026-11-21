import { describe, expect, it } from "vitest";
import { dayLabel, usDate, usTime } from "./displayFormat.js";

describe("display formats", () => {
  it("writes dates as MM/DD/YYYY", () => {
    expect(usDate("2027-10-09")).toBe("10/09/2027");
    expect(dayLabel("2027-10-09")).toBe("Saturday 10/09/2027");
  });

  it("writes times in 12-hour Eastern", () => {
    expect(usTime("00:15")).toBe("12:15 AM ET");
    expect(usTime("08:00")).toBe("8:00 AM ET");
    expect(usTime("12:00")).toBe("12:00 PM ET");
    expect(usTime("13:30")).toBe("1:30 PM ET");
    expect(usTime("23:45")).toBe("11:45 PM ET");
  });
});
