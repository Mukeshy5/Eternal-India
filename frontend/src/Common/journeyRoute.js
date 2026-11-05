// Centre line of the supplied Journey map artwork (1151 × 1370).
// This is a journey illustration; distances are entered by the administrator.
const road = [[900, 1325], [720, 1210], [480, 1100], [270, 1025], [200, 960], [215, 900], [310, 845], [530, 780], [790, 710], [920, 645], [950, 595], [880, 535], [720, 475], [640, 425], [625, 390], [685, 350], [860, 300], [1005, 260], [1035, 235], [1000, 200], [875, 170], [750, 135], [695, 110], [690, 92], [720, 75], [780, 56]];
const lengths = road.slice(1).map((point, index) => Math.hypot(point[0] - road[index][0], point[1] - road[index][1]));
const roadLength = lengths.reduce((sum, value) => sum + value, 0);

export function roadPoint(fraction) {
  let remaining = Math.max(0, Math.min(1, fraction)) * roadLength;
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index]) {
      const ratio = remaining / lengths[index];
      return { x: (road[index][0] + (road[index + 1][0] - road[index][0]) * ratio) / 1151 * 100, y: (road[index][1] + (road[index + 1][1] - road[index][1]) * ratio) / 1370 * 100 };
    }
    remaining -= lengths[index];
  }
  return { x: road.at(-1)[0] / 1151 * 100, y: road.at(-1)[1] / 1370 * 100 };
}

export function journeyRoute(from, fromAddress, stops = []) {
  const named = stops.filter((stop) => stop.name.trim());
  const distances = named.map((stop) => stop.distanceKm === "" || stop.distanceKm == null ? null : Number(stop.distanceKm));
  const complete = distances.every((distance) => Number.isFinite(distance) && distance >= 0);
  const total = distances.reduce((sum, distance) => sum + (Number.isFinite(distance) && distance >= 0 ? distance : 0), 0);
  // Until all legs are supplied, show stop order rather than inventing distances.
  let cumulative = 0;
  const points = [{ name: from || "Starting point", address: fromAddress, cumulative: 0, fraction: 0, ...roadPoint(0) }, ...named.map((stop, index) => {
    cumulative += distances[index] || 0;
    const fraction = complete && total > 0 ? cumulative / total : (index + 1) / Math.max(named.length, 1);
    return { ...stop, cumulative: complete ? cumulative : null, fraction, ...roadPoint(fraction) };
  })];
  return { points, total, complete, count: named.length };
}

export const formatKm = (value) => `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(value)} km`;
