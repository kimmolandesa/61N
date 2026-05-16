"use client";

import { useState } from "react";
import OperationalMap from "@/components/map/OperationalMap";
import { useAoiManager } from "@/hooks/useAoiManager";
import type { Asset } from "@/lib/types";
import type { IntelFeature } from "@/lib/intel/types";
import type { BaseMapId } from "@/lib/map/baseMaps";

interface MapViewProps {
  results: Asset[];
  weatherFeatures: IntelFeature[];
  bounds: [number, number, number, number] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  filterOperator: string | null;
  filterType: string | null;
}

export default function MapView(props: MapViewProps) {
  const {
    aois,
    selectedAoiId,
    selectedAoi,
    activeDrawMode,
    addAoiFromGeometry,
    replaceAoiGeometry,
    selectAoi,
  } = useAoiManager();
  const [activeBasemap] = useState<BaseMapId>("mml");

  return (
    <OperationalMap
      {...props}
      areaSearchResults={[]}
      selectedSectionIntel={null}
      aois={aois}
      selectedAoiId={selectedAoiId}
      selectedAoi={selectedAoi}
      drawMode={activeDrawMode}
      activeBasemap={activeBasemap}
      onAddAoiFromGeometry={addAoiFromGeometry}
      onReplaceAoiGeometry={replaceAoiGeometry}
      onSelectAoi={selectAoi}
    />
  );
}
