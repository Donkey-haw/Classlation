import { chromium as installedChromium } from "../node_modules/playwright/index.mjs";

export const chromium = new Proxy(installedChromium, {
  get(target, property, receiver) {
    if (property === "launch") {
      return (options = {}) => target.launch({
        ...options,
        executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      });
    }
    return Reflect.get(target, property, receiver);
  },
});
