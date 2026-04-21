import { type ServerProvider } from "@t3tools/contracts";
import { Effect, Layer, Stream } from "effect";

import { ServerSettingsService } from "../../serverSettings.ts";
import { providerModelsFromSettings } from "../providerSnapshot.ts";
import { CursorProvider } from "../Services/CursorProvider.ts";
import { HermesProvider, type HermesProviderShape } from "../Services/HermesProvider.ts";

const PROVIDER = "hermes" as const;

const EMPTY_MODEL_CAPABILITIES = {
  reasoningEffortLevels: [],
  supportsFastMode: false,
  supportsThinkingToggle: false,
  contextWindowOptions: [],
  promptInjectedEffortLevels: [],
};

function toHermesProvider(
  cursorProvider: ServerProvider,
  input: {
    readonly enabled: boolean;
    readonly customModels: ReadonlyArray<string>;
  },
): ServerProvider {
  const builtInModels = cursorProvider.models.filter((model) => !model.isCustom);
  const fallbackCapabilities =
    builtInModels.find((model) => model.capabilities)?.capabilities ?? EMPTY_MODEL_CAPABILITIES;
  const models = providerModelsFromSettings(
    builtInModels,
    PROVIDER,
    input.customModels,
    fallbackCapabilities,
  );

  return {
    ...cursorProvider,
    provider: PROVIDER,
    enabled: input.enabled,
    status: input.enabled ? cursorProvider.status : "disabled",
    models,
  };
}

const makeHermesProvider = Effect.gen(function* () {
  const cursorProvider = yield* CursorProvider;
  const serverSettings = yield* ServerSettingsService;

  const getSnapshot: HermesProviderShape["getSnapshot"] = Effect.gen(function* () {
    const settings = yield* serverSettings.getSettings;
    const cursorSnapshot = yield* cursorProvider.getSnapshot;
    return toHermesProvider(cursorSnapshot, {
      enabled: settings.providers.hermes.enabled,
      customModels: settings.providers.hermes.customModels,
    });
  });

  const refresh: HermesProviderShape["refresh"] = Effect.gen(function* () {
    const settings = yield* serverSettings.getSettings;
    const cursorSnapshot = yield* cursorProvider.refresh;
    return toHermesProvider(cursorSnapshot, {
      enabled: settings.providers.hermes.enabled,
      customModels: settings.providers.hermes.customModels,
    });
  });

  const streamSettings = serverSettings.streamChanges.pipe(Stream.map(() => undefined));
  const streamCursor = cursorProvider.streamChanges.pipe(Stream.map(() => undefined));

  return {
    getSnapshot,
    refresh,
    get streamChanges() {
      return Stream.merge(streamCursor, streamSettings).pipe(Stream.mapEffect(() => refresh));
    },
  } satisfies HermesProviderShape;
});

export const HermesProviderLive = Layer.effect(HermesProvider, makeHermesProvider);
