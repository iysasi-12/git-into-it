import { describe, expect, it } from "vitest";
import { matchVenue } from "./dataRepository.js";

describe("matchVenue", () => {
  it.each([
    ["Plan our trip to Central Michigan on October 10", "central-michigan"],
    ["Eastern Michigan game, 65 players", "eastern-michigan"],
    ["Plan our trip to Western Michigan", "western-michigan"],
    ["Away game at Michigan next month", "michigan"],
    ["Plan our trip to Ohio State", "ohio-state"],
    ["Bobcats game in Athens", "ohio"],
    ["Plan our trip to Toledo", "toledo"],
    ["Leaving Bowling Green, Ohio for Akron", "akron"],
    ["Game in Mt. Pleasant on Saturday", "central-michigan"],
  ])("%s -> %s", (text, id) => {
    expect(matchVenue(text)?.id).toBe(id);
  });

  it("does not match plain 'Ohio' to Ohio University", () => {
    expect(matchVenue("Leaving Bowling Green, Ohio on Friday")).toBeUndefined();
  });

  it("returns undefined for a school that is not in the dataset", () => {
    expect(matchVenue("Plan our trip to Sacramento State")).toBeUndefined();
  });
});
