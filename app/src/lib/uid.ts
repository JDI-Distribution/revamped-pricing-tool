// Monotonically-increasing integer ID generator.
// Seeded from Date.now() so IDs are always > any hardcoded initial IDs (1, 2, 3, 4).
// Guaranteed unique within a session - no floating-point collisions.
let _counter = Date.now();
export const uid = (): number => ++_counter;
