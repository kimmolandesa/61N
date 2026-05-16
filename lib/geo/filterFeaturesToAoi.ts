import { booleanIntersects, booleanPointInPolygon, featureCollection, point } from "@turf/turf";
import type { SectionIntelFeatureCollection, SectionIntelFeatureProperties } from "@/lib/aoi/types";

function emptyFeatureCollection(): SectionIntelFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

export function filterFeaturesToAoi(
  input: GeoJSON.FeatureCollection,
  aoiGeometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): SectionIntelFeatureCollection {
  if (!input?.features?.length) {
    return emptyFeatureCollection();
  }

  return featureCollection(
    input.features.filter((feature) => {
      if (!feature?.geometry) {
        return false;
      }

      try {
        if (feature.geometry.type === "Point") {
          const coordinates = feature.geometry.coordinates;
          if (
            !Array.isArray(coordinates) ||
            coordinates.length < 2 ||
            typeof coordinates[0] !== "number" ||
            typeof coordinates[1] !== "number"
          ) {
            return false;
          }

          return booleanPointInPolygon(point(coordinates), aoiGeometry);
        }

        if (
          feature.geometry.type === "LineString" ||
          feature.geometry.type === "Polygon" ||
          feature.geometry.type === "MultiPolygon" ||
          feature.geometry.type === "MultiLineString"
        ) {
          return booleanIntersects(feature as GeoJSON.Feature, {
            type: "Feature",
            geometry: aoiGeometry,
            properties: {},
          });
        }

        return false;
      } catch {
        return false;
      }
    }) as Array<GeoJSON.Feature<GeoJSON.Geometry, SectionIntelFeatureProperties>>,
  ) as SectionIntelFeatureCollection;
}
