/**
 * Dynamic Deno Deploy entrypoint: x402 merchant/resource endpoints plus the Vite SPA.
 * The server fails closed for pay links until PAY_LINK_SECRET is configured as a
 * server-side secret. Buyer payment authorizations are verified and settled by the
 * official Mezo facilitator; this app never holds keys or sends buyer transactions.
 */
import process from "node:process";
import { createMerchantApp } from "./app.ts";

const port = Number(process.env.PORT ?? "8000");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be a valid TCP port.");

const app = createMerchantApp({ payLinkSecret: process.env.PAY_LINK_SECRET });
app.listen(port, "0.0.0.0", () => {
  console.log(`MezoVault IQ dynamic server listening on port ${port}.`);
});
