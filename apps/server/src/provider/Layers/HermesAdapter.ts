import {
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderSendTurnInput,
  type ProviderSessionStartInput,
  type ModelSelection,
} from "@t3tools/contracts";
import { Effect, Layer, Stream } from "effect";

import { ProviderAdapterSessionNotFoundError } from "../Errors.ts";
import { CursorAdapter } from "../Services/CursorAdapter.ts";
import { HermesAdapter, type HermesAdapterShape } from "../Services/HermesAdapter.ts";

const PROVIDER = "hermes" as const;

function toCursorModelSelection(selection: ModelSelection | undefined): ModelSelection | undefined {
  if (selection?.provider !== "hermes") {
    return selection;
  }
  return {
    provider: "cursor",
    model: selection.model,
    ...(selection.options ? { options: selection.options } : {}),
  };
}

function toCursorSessionStartInput(input: ProviderSessionStartInput): ProviderSessionStartInput {
  return {
    ...input,
    provider: "cursor",
    ...(input.modelSelection
      ? { modelSelection: toCursorModelSelection(input.modelSelection) }
      : {}),
  };
}

function toCursorSendTurnInput(input: ProviderSendTurnInput): ProviderSendTurnInput {
  return {
    ...input,
    ...(input.modelSelection
      ? { modelSelection: toCursorModelSelection(input.modelSelection) }
      : {}),
  };
}

function toHermesSession(session: ProviderSession): ProviderSession {
  return {
    ...session,
    provider: PROVIDER,
  };
}

function toHermesRuntimeEvent(event: ProviderRuntimeEvent): ProviderRuntimeEvent {
  return {
    ...event,
    provider: PROVIDER,
  };
}

const ensureHermesThread = (
  threadIds: ReadonlySet<string>,
  threadId: string,
  operation: string,
): Effect.Effect<void, ProviderAdapterSessionNotFoundError> =>
  threadIds.has(threadId)
    ? Effect.void
    : Effect.fail(
        new ProviderAdapterSessionNotFoundError({
          provider: PROVIDER,
          threadId,
          cause: new Error(`Cannot ${operation}: unknown Hermes adapter thread ${threadId}`),
        }),
      );

const makeHermesAdapter = Effect.fn("makeHermesAdapter")(function* () {
  const cursor = yield* CursorAdapter;
  const hermesThreadIds = new Set<string>();

  const startSession: HermesAdapterShape["startSession"] = (input) =>
    cursor.startSession(toCursorSessionStartInput(input)).pipe(
      Effect.tap((session) =>
        Effect.sync(() => {
          hermesThreadIds.add(session.threadId);
        }),
      ),
      Effect.map(toHermesSession),
    );

  const sendTurn: HermesAdapterShape["sendTurn"] = (input) =>
    ensureHermesThread(hermesThreadIds, input.threadId, "sendTurn").pipe(
      Effect.andThen(cursor.sendTurn(toCursorSendTurnInput(input))),
    );

  const interruptTurn: HermesAdapterShape["interruptTurn"] = (threadId, turnId) =>
    ensureHermesThread(hermesThreadIds, threadId, "interruptTurn").pipe(
      Effect.andThen(cursor.interruptTurn(threadId, turnId)),
    );

  const respondToRequest: HermesAdapterShape["respondToRequest"] = (threadId, requestId, decision) =>
    ensureHermesThread(hermesThreadIds, threadId, "respondToRequest").pipe(
      Effect.andThen(cursor.respondToRequest(threadId, requestId, decision)),
    );

  const respondToUserInput: HermesAdapterShape["respondToUserInput"] = (
    threadId,
    requestId,
    answers,
  ) =>
    ensureHermesThread(hermesThreadIds, threadId, "respondToUserInput").pipe(
      Effect.andThen(cursor.respondToUserInput(threadId, requestId, answers)),
    );

  const stopSession: HermesAdapterShape["stopSession"] = (threadId) =>
    ensureHermesThread(hermesThreadIds, threadId, "stopSession").pipe(
      Effect.andThen(cursor.stopSession(threadId)),
      Effect.tap(() =>
        Effect.sync(() => {
          hermesThreadIds.delete(threadId);
        }),
      ),
    );

  const listSessions: HermesAdapterShape["listSessions"] = () =>
    cursor.listSessions().pipe(
      Effect.map((sessions) =>
        sessions
          .filter((session) => hermesThreadIds.has(session.threadId))
          .map((session) => toHermesSession(session)),
      ),
    );

  const hasSession: HermesAdapterShape["hasSession"] = (threadId) =>
    !hermesThreadIds.has(threadId) ? Effect.succeed(false) : cursor.hasSession(threadId);

  const readThread: HermesAdapterShape["readThread"] = (threadId) =>
    ensureHermesThread(hermesThreadIds, threadId, "readThread").pipe(
      Effect.andThen(cursor.readThread(threadId)),
    );

  const rollbackThread: HermesAdapterShape["rollbackThread"] = (threadId, numTurns) =>
    ensureHermesThread(hermesThreadIds, threadId, "rollbackThread").pipe(
      Effect.andThen(cursor.rollbackThread(threadId, numTurns)),
    );

  const stopAll: HermesAdapterShape["stopAll"] = () =>
    Effect.forEach([...hermesThreadIds], stopSession, { discard: true });

  const streamEvents = cursor.streamEvents.pipe(
    Stream.filter((event) => hermesThreadIds.has(event.threadId)),
    Stream.map(toHermesRuntimeEvent),
  );

  return {
    provider: PROVIDER,
    capabilities: {
      sessionModelSwitch: "in-session",
      supportsProposedPlan: true,
      supportsApprovals: true,
      supportsUserInput: true,
    },
    startSession,
    sendTurn,
    interruptTurn,
    respondToRequest,
    respondToUserInput,
    stopSession,
    listSessions,
    hasSession,
    readThread,
    rollbackThread,
    stopAll,
    streamEvents,
  } satisfies HermesAdapterShape;
});

export const HermesAdapterLive = Layer.effect(HermesAdapter, makeHermesAdapter());
