import { definePlugin } from "nitro";
import { appVersionHeader } from "../../src/lib/build-info";

export default definePlugin(({ hooks }) => {
  hooks.hook("response", (response) => {
    response.headers.set("X-App-Version", appVersionHeader());
  });
});
