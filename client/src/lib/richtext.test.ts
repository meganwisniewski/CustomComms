import { describe, it, expect } from "vitest";
import { htmlToMarkdown, htmlToPlain, isBlank } from "./richtext";

describe("htmlToMarkdown", () => {
  it("converts bold/strong to **", () => {
    expect(htmlToMarkdown("<b>hi</b>")).toBe("**hi**");
    expect(htmlToMarkdown("<strong>hi</strong>")).toBe("**hi**");
  });

  it("converts italic/em to *", () => {
    expect(htmlToMarkdown("<i>hi</i>")).toBe("*hi*");
    expect(htmlToMarkdown("<em>hi</em>")).toBe("*hi*");
  });

  it("converts strikethrough variants to ~~", () => {
    expect(htmlToMarkdown("<strike>x</strike>")).toBe("~~x~~");
    expect(htmlToMarkdown("<s>x</s>")).toBe("~~x~~");
    expect(htmlToMarkdown("<del>x</del>")).toBe("~~x~~");
  });

  it("keeps underline as <u> (no Markdown equivalent)", () => {
    expect(htmlToMarkdown("<u>x</u>")).toBe("<u>x</u>");
  });

  it("nests formatting innermost-first", () => {
    expect(htmlToMarkdown("<b><i>x</i></b>")).toBe("***x***");
  });

  it("turns block structure into newlines", () => {
    expect(htmlToMarkdown("a<div>b</div>")).toBe("a\nb");
    expect(htmlToMarkdown("a<br>b")).toBe("a\nb");
    expect(htmlToMarkdown("<div>a</div><div>b</div>")).toBe("a\nb");
  });

  it("decodes entities and strips unknown tags with their attributes", () => {
    expect(htmlToMarkdown("a &amp; b")).toBe("a & b");
    expect(htmlToMarkdown('<span style="color:red">x</span>')).toBe("x");
    expect(htmlToMarkdown('<b style="font-weight:700">x</b>')).toBe("**x**");
  });

  it("preserves formatting mid-sentence", () => {
    expect(htmlToMarkdown("see <b>this</b> now")).toBe("see **this** now");
  });
});

describe("htmlToPlain", () => {
  it("drops all formatting but keeps line breaks", () => {
    expect(htmlToPlain("<b>a</b><div>b</div>")).toBe("a\nb");
    expect(htmlToPlain("<u>x</u> <i>y</i>")).toBe("x y");
  });
});

describe("isBlank", () => {
  it("is true for empty / whitespace-only / bare-break content", () => {
    expect(isBlank("")).toBe(true);
    expect(isBlank("<br>")).toBe(true);
    expect(isBlank("<div><br></div>")).toBe(true);
    expect(isBlank("   &nbsp; ")).toBe(true);
  });

  it("is false once there is real text", () => {
    expect(isBlank("<b>x</b>")).toBe(false);
    expect(isBlank("hi")).toBe(false);
  });
});
