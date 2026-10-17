import { normalizeLocationEquipment } from "./program.js";

export function sessionWithCurrentLocation(session, locations = []) {
  if (!session?.context?.locationId || session.completedAt || session.status === "complete") return session;
  const location = locations.find((item) => item.id === session.context.locationId && item.ready);
  if (!location) return session;
  const normalized = normalizeLocationEquipment(location);
  return {
    ...session,
    context: {
      ...session.context,
      locationName: location.name,
      equipment: [...new Set(["맨몸", ...normalized.equipment])],
      equipmentItems: normalized.equipmentItems,
    },
  };
}
