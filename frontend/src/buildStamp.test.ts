import { describe, expect, it } from "vitest";
import { readBuildStamp } from "../buildStamp";

describe("readBuildStamp", () => {
  it("gir en ekte hash eller «ingen commit», aldri noe oppdiktet", () => {
    const stamp = readBuildStamp(new Date("2026-10-24T10:00:00Z"));
    expect(stamp.commit === "ingen commit" || /^[0-9a-f]{7,40}$/.test(stamp.commit)).toBe(true);
    expect(stamp.time).toBe("2026-10-24T10:00:00.000Z");
    expect(typeof stamp.dirty).toBe("boolean");
  });
});
