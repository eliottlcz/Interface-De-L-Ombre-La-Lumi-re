export async function onRequestError(err: unknown, request: { path: string; method: string }) {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportError } = await import("./instrumentation-node");
    await reportError(err, request);
  }
}
