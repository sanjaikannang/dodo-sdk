# dodo-sdk

The embeddable script a merchant drops into their website to open Dodo's hosted checkout.

This is the **only piece of Dodo's code that runs on someone else's page.** It never
sees card data and never renders any payment UI itself — it opens `dodo-checkout-app`
inside an isolated iframe and relays the outcome back to the merchant.

## What it does

1. Exposes one function: `DodoCheckout.open(options)`
2. Creates a full-screen overlay and an iframe pointing at the checkout
3. Verifies the checkout's `ready` message (checking both `event.source` and
   `event.origin`) before trusting it
4. Opens a private `MessageChannel` and hands one port to the checkout, so all
   further communication bypasses the risk of any other script listening in
5. Translates the checkout's `success` / `error` / `close` messages into the
   merchant's `onSuccess` / `onError` / `onClose` callbacks

## API

```ts
const handle = DodoCheckout.open({
  productId: "prod_123",
  onSuccess: ({ sessionId }) => {},
  onClose:   ({ reason }) => {},   // "dismissed" | "completed" | "error" | "host"
  onError:   ({ code, message }) => {},
})

handle.close() // host can close it programmatically
```

Calling `open()` again while a checkout is already open returns the existing
handle instead of creating a second one — this is a deliberate guard against
double-opens (see the top-level write-up for why).

## Requirements

- Node 18+

## Setup

```bash
npm install
```

Create an environment file with the URL of the deployed checkout app:

**`.env`** (used for production builds)
```
VITE_CHECKOUT_URL=https://dodo-checkout-app-nu.vercel.app
```

**`.env.local`** (used for local development — Vite prefers this over `.env`)
```
VITE_CHECKOUT_URL=http://localhost:5174
```

## Build

```bash
npm run build
```

This produces a single self-contained file: `dist/dodo-checkout.js`, exposing a
global `DodoCheckout`. The checkout's URL is baked into this file at build time
from whichever `.env` file was active.

## Using the built file

Copy `dist/dodo-checkout.js` into the merchant site's `public/` folder, then
load it with a plain script tag:

```html
<script src="/dodo-checkout.js"></script>
```

> **Note on deployment:** since this repo has no server component, there's
> nothing to deploy on its own. In this exercise, the built file is manually
> copied into `dodo-example-merchant-site/public/`. In a real product, this
> file would instead be hosted on a CDN (e.g. `js.dodopayments.com/v1/`) and
> loaded directly from there — see "what I'd explore next" in the top-level
> write-up.

## Related repos

- [`dodo-checkout-app`](#) — the hosted payment page this SDK opens
- [`dodo-example-merchant-site`](#) — a demo site using this SDK