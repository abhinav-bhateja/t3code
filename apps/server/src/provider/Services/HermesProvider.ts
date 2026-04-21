import { Context } from "effect";

import type { ServerProviderShape } from "./ServerProvider.ts";

export interface HermesProviderShape extends ServerProviderShape {}

export class HermesProvider extends Context.Service<HermesProvider, HermesProviderShape>()(
  "t3/provider/Services/HermesProvider",
) {}
