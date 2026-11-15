import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErrorState } from "../components/ui/StateViews";

describe("ErrorState accessibility", () => {
  it("renders its existing error presentation inside an alert live region", () => {
    const markup = renderToStaticMarkup(
      createElement(ErrorState, {
        title: "Live pool read unavailable",
        description: "Automatic reads will retry.",
        onRetry: () => undefined,
      }),
    );

    assert.match(markup, /<div role="alert">/);
    assert.match(markup, /<h3 class="text-base font-semibold text-mist-100">Live pool read unavailable<\/h3>/);
    assert.match(markup, /<p class="max-w-md text-sm text-mist-400">Automatic reads will retry\.<\/p>/);
    assert.match(markup, /class="rounded-2xl border bg-ink-900\/80 p-5 backdrop-blur-sm sm:p-6 border-line flex flex-col items-center gap-3 border-risk-high\/30 py-12 text-center"/);
    assert.match(markup, /<button[^>]*>Try again<\/button>/);
  });
});
