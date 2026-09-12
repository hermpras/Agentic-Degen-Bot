import { Page } from "playwright";

export interface RabbyPopupInfo {
  url: string;
  title: string;
  text: string;
  buttons: string[];
  inputs: string[];
}

export async function inspectRabbyPopup(page: Page): Promise<RabbyPopupInfo> {
  const buttons = await page.locator("button").allInnerTexts();

  const inputs = await page.locator("input").evaluateAll((elements) =>
    elements.map((element) => ({
      type: element.getAttribute("type"),
      placeholder: element.getAttribute("placeholder"),
      ariaLabel: element.getAttribute("aria-label"),
    })),
  );

  const text = await page
    .locator("body")
    .innerText()
    .catch(() => "");

  return {
    url: page.url(),
    title: await page.title(),
    text,
    buttons,
    inputs: inputs.map((input) => JSON.stringify(input)),
  };
}
