import { page } from "vite-plus/test/browser";
import { describe, expect, it } from "vite-plus/test";
import { render } from "vitest-browser-svelte";
import Welcome from "./Welcome.svelte";

const browserExpect = expect as typeof expect & {
  element: (target: unknown) => {
    toHaveTextContent: (value: string) => Promise<void>;
    toBeInTheDocument: () => Promise<void>;
  };
};

describe("Welcome.svelte", () => {
  it("renders greetings for host and guest", async () => {
    render(Welcome, { host: "SvelteKit", guest: "Vitest" });

    await browserExpect
      .element(page.getByRole("heading", { level: 1 }))
      .toHaveTextContent("Hello, SvelteKit!");
    await browserExpect
      .element(page.getByText("Hello, Vitest!"))
      .toBeInTheDocument();
  });
});
