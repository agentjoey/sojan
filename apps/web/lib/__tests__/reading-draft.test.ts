import { describe, it, expect, beforeEach } from "vitest";
import { saveReadingDraft, takeReadingDraft, type ReadingDraft } from "../reading-draft";

const draft: ReadingDraft = {
  nickname: "阿甲",
  date: "1991-03-15",
  isLunar: false,
  time: "14:30",
  timeUnknown: false,
  gender: "male",
  geo: { label: "Shanghai, China", lat: 31.23, lon: 121.47, timezone: "Asia/Shanghai" },
};

beforeEach(() => sessionStorage.clear());

describe("reading-draft", () => {
  it("存进 sessionStorage 的 zhaojian.readingDraft，取一次后删除", () => {
    saveReadingDraft(draft);
    expect(sessionStorage.getItem("zhaojian.readingDraft")).not.toBeNull();
    expect(takeReadingDraft()).toEqual(draft);
    expect(sessionStorage.getItem("zhaojian.readingDraft")).toBeNull();
    expect(takeReadingDraft()).toBeNull();
  });

  it("内容损坏 → 返回 null 并清掉", () => {
    sessionStorage.setItem("zhaojian.readingDraft", "{not json");
    expect(takeReadingDraft()).toBeNull();
    expect(sessionStorage.getItem("zhaojian.readingDraft")).toBeNull();
  });
});
