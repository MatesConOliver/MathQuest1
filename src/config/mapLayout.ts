export type MapLocationMeta = {
  locationId: string; // must match GameLocation.id
  x: number; // 0–1, relative horizontal position
  y: number; // 0–1, relative vertical position
  radius?: number; // optional click radius (in % or relative units)
  initiallyHidden?: boolean; // for story-gated locations (fogged at start)
  fogType?: "clouds" | "mist";
};

export const MAP_LOCATIONS: MapLocationMeta[] = [
  {
    locationId: "library",
    x: 0.5,
    y: 0.6,
    initiallyHidden: false,
    fogType: "mist",
  },
  {
    locationId: "algebra",
    x: 0.2,
    y: 0.3,
  },
  {
    locationId: "functions",
    x: 0.8,
    y: 0.2,
  },
  {
    locationId: "geometry",
    x: 0.3,
    y: 0.8,
  },
  {
    locationId: "probability",
    x: 0.7,
    y: 0.8,
  },
  {
    locationId: "calculus",
    x: 0.5,
    y: 0.1,
    initiallyHidden: true,
  },
];
