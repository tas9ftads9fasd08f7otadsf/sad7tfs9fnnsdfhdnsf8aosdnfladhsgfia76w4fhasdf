/** How lifts are drawn, shared by the base map and the railways package. */

/** Lifts with cabins, drawn like a railway band. */
export const LIFT_CABINS = ["cable_car", "gondola", "mixed_lift"];
export const LIFT_CHAIRS = ["chair_lift"];
/** Lift widths in px at z11, z14 and z17. */
export const LIFT_WIDTH = {
  cabinCasing: [2, 5.5, 8], cabin: [0.8, 3.2, 5], chair: [1.4, 3.6, 5], drag: [0.6, 1.4, 2.2]
};
export const LIFT_DASH = { cabin: [2.5, 2], chair: [3, 1], drag: [3, 1.5] };
export const liftWidthStops = ([a, b, c]) => [[11, a], [14, b], [17, c], [20, c * 1.6]];
