/*
 * Guards camera requests: one at a time, and a permission grant that arrives
 * after the player moved on (pointer mode, left the game) is stopped, not used.
 * Without this, a double click on "Turn on camera" leaves a second stream
 * running with the camera light on after the game closes.
 */

type Stoppable = { getTracks(): { stop(): void }[] };

export function cameraGate() {
  let gen = 0;
  let pending = false;
  return {
    /** Start a request. Returns its token, or null while another is waiting for permission. */
    begin(): number | null {
      if (pending) return null;
      pending = true;
      return ++gen;
    },
    /** Invalidate any request in flight. */
    cancel() {
      gen++;
      pending = false;
    },
    isCurrent: (token: number) => token === gen,
    /** A request finished (stream, or null on failure). True if the stream should be used; otherwise it is stopped. */
    settle(token: number, stream: Stoppable | null): boolean {
      if (token !== gen) {
        stream?.getTracks().forEach((t) => t.stop());
        return false;
      }
      pending = false;
      return stream !== null;
    },
  };
}
