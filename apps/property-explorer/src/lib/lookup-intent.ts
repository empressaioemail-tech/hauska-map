// Monotonic lookup generation. A map click (or a newer Find) bumps; an
// in-flight Find whose `started` is no longer current must not inspect,
// rebind, or fly the camera.

export type LookupIntent = {
  bump(): number;
  current(): number;
  isCurrent(started: number): boolean;
};

export function createLookupIntent(): LookupIntent {
  let generation = 0;
  return {
    bump(): number {
      generation += 1;
      return generation;
    },
    current(): number {
      return generation;
    },
    isCurrent(started: number): boolean {
      return started === generation;
    },
  };
}
