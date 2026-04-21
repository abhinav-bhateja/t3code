import { Context } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface HermesAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "hermes";
}

export class HermesAdapter extends Context.Service<HermesAdapter, HermesAdapterShape>()(
  "t3/provider/Services/HermesAdapter",
) {}
