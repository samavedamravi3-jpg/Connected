/** Assistant button (44) plus the gap above the map controls. */
export const ASK_H = 44 + 8;
/** Recenter + Layers: two 46pt buttons, a 1pt divider and the 1pt border. */
export const CONTROLS_H = 46 * 2 + 1 + 2;

export type RailFit = { controls: boolean; key: boolean; ask: boolean };

/**
 * What fits in `room` (header bottom to just above the sheet) at one sheet position. The map controls go first,
 * then the hub key under them (`keyRoom`: its height plus gap, 0 when off), then the assistant on top. Whatever
 * doesn't fit is hidden instead of overlapping the header, so short phones keep Recenter and Layers at the middle stop.
 */
export function railFit(room: number, keyRoom: number): RailFit {
  const controls = room >= CONTROLS_H;
  const key = keyRoom > 0 && room >= (controls ? CONTROLS_H : 0) + keyRoom;
  const ask = controls && room >= CONTROLS_H + (key ? keyRoom : 0) + ASK_H;
  return { controls, key, ask };
}
