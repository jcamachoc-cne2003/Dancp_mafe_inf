'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { X, Eye, AlertCircle } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// =========================================================================
// ⚙️ PARÁMETROS DE AJUSTE Y CALIBRACIÓN
// =========================================================================
const MAP_CONFIG = {
  USE_AUTO_FIT: false, 

  // Parámetros manuales:
  ZOOM_LEVEL: 6,
  CENTER_LAT: 4.5,
  CENTER_LNG: -73.2,

  AUTO_FIT_PADDING: [25, 25] as [number, number],

  // Bordes dinámicos
  BORDER_DEFAULT_COLOR: '#ffffff',
  BORDER_DEFAULT_WEIGHT: 1.2,
  BORDER_HOVER_COLOR: '#0f172a',
  BORDER_HOVER_WEIGHT: 3.5,
};

export interface Proyecto {
  Codigo: string | number;
  'Nombre POA': string;
  'Nombre Ejecutor': string;
  'Nombre Sector': string;
  'Nombre Estado': 'ACTIVO' | 'CIERRE' | 'DESISTIMIENTO' | 'PROTOCOLIZACION' | 'SEGUIMIENTO' | 'SUSPENDIDO' | 'TEST' | string;
  Departamento: string;
  Municipio: string;
  Etnia: string;
  'Tipo Comunidad': 'INDÍGENA' | 'AFRODESCENDIENTE' | string;
  'Cantidad Pob Cert': number;
}

export const ESTADO_COLORS: Record<string, string> = {
  ACTIVO: '#84cc16',          // Verde lima
  CIERRE: '#831843',          // Vinotinto / Rojo oscuro
  DESISTIMIENTO: '#6b7280',   // Gris
  PROTOCOLIZACION: '#2563eb', // Azul
  SEGUIMIENTO: '#eab308',     // Amarillo
  SUSPENDIDO: '#ef4444',      // Rojo
  TEST: '#8b5cf6',            // Violeta
};

export const COMUNIDAD_COLORS: Record<string, string> = {
  INDÍGENA: '#059669',        // Verde esmeralda
  AFRODESCENDIENTE: '#d97706' // Ámbar
};

export const ESTADOS_DISPONIBLES = Object.keys(ESTADO_COLORS);
export const COMUNIDADES_DISPONIBLES = ['INDÍGENA', 'AFRODESCENDIENTE'];

interface Props {
  proyectos: Proyecto[];
  onSelectProyecto: (proyecto: Proyecto) => void;
}

export default function ColombiaMap({ proyectos, onSelectProyecto }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const geoJsonLayerRef = useRef<any>(null);
  const hoveredLayerRef = useRef<any>(null);
  const [geoData, setGeoData] = useState<any>(null);
  const [leafletModule, setLeafletModule] = useState<any>(null);

  // Departamento activo
  const [selectedDeptName, setSelectedDeptName] = useState<string | null>(null);

  // Filtros de mapa
  const [selectedEstados, setSelectedEstados] = useState<string[]>(ESTADOS_DISPONIBLES);
  const [selectedComunidades, setSelectedComunidades] = useState<string[]>(COMUNIDADES_DISPONIBLES);

  // Comprobar si falta seleccionar algún filtro
  const hayFiltroVacio = selectedEstados.length === 0 || selectedComunidades.length === 0;

  useEffect(() => {
    import('leaflet').then((L) => {
      setLeafletModule(L);
    });
  }, []);

  useEffect(() => {
    fetch('/colombia.geo.json')
      .then((res) => res.json())
      .then((data) => setGeoData(data))
      .catch((err) => console.error('Error cargando GeoJSON:', err));
  }, []);

  const proyectosFiltrados = useMemo(() => {
    return proyectos.filter((p) => {
      const matchEstado = selectedEstados.includes(p['Nombre Estado']);
      const matchComunidad = selectedComunidades.includes(p['Tipo Comunidad']);
      return matchEstado && matchComunidad;
    });
  }, [proyectos, selectedEstados, selectedComunidades]);

  const normalizeText = (text: string) =>
    (text || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const deptData = useMemo(() => {
    if (!selectedDeptName || hayFiltroVacio) return null;
    const norm = normalizeText(selectedDeptName);
    const dptProyectos = proyectosFiltrados.filter(
      (p) => normalizeText(p.Departamento) === norm
    );

    const total = dptProyectos.length;
    const estadoCounts: Record<string, number> = {};
    const comCounts: Record<string, number> = {};

    dptProyectos.forEach((p) => {
      estadoCounts[p['Nombre Estado']] = (estadoCounts[p['Nombre Estado']] || 0) + 1;
      comCounts[p['Tipo Comunidad']] = (comCounts[p['Tipo Comunidad']] || 0) + 1;
    });

    return {
      nombre: selectedDeptName,
      total,
      proyectos: dptProyectos,
      estadoCounts,
      comCounts,
    };
  }, [selectedDeptName, proyectosFiltrados, hayFiltroVacio]);

  const getFeatureStyle = useCallback((feature: any, isHover: boolean = false) => {
    if (hayFiltroVacio) {
      return {
        fillColor: '#f1f5f9',
        weight: isHover ? MAP_CONFIG.BORDER_HOVER_WEIGHT : MAP_CONFIG.BORDER_DEFAULT_WEIGHT,
        opacity: 1,
        color: isHover ? MAP_CONFIG.BORDER_HOVER_COLOR : MAP_CONFIG.BORDER_DEFAULT_COLOR,
        fillOpacity: 0.3,
      };
    }

    const dptName = normalizeText(feature?.properties?.NOMBRE_DPT || '');
    const dptProyectos = proyectosFiltrados.filter(
      (p: Proyecto) => normalizeText(p.Departamento) === dptName
    );

    let fillColor = '#e2e8f0';
    let fillOpacity = 0.45;

    if (dptProyectos.length > 0) {
      const counts: Record<string, number> = {};
      dptProyectos.forEach((p) => {
        const estado = p['Nombre Estado'];
        counts[estado] = (counts[estado] || 0) + 1;
      });

      let maxEstado = '';
      let maxCount = 0;
      Object.entries(counts).forEach(([estado, count]) => {
        if (count > maxCount) {
          maxCount = count;
          maxEstado = estado;
        }
      });

      fillColor = ESTADO_COLORS[maxEstado] || '#94a3b8';
      fillOpacity = isHover ? 0.95 : 0.8;
    }

    return {
      fillColor,
      weight: isHover ? MAP_CONFIG.BORDER_HOVER_WEIGHT : MAP_CONFIG.BORDER_DEFAULT_WEIGHT,
      opacity: 1,
      color: isHover ? MAP_CONFIG.BORDER_HOVER_COLOR : MAP_CONFIG.BORDER_DEFAULT_COLOR,
      fillOpacity,
    };
  }, [proyectosFiltrados, hayFiltroVacio]);

  useEffect(() => {
    if (!leafletModule || !mapContainerRef.current || mapInstanceRef.current) return;

    const L = leafletModule;
    const map = L.map(mapContainerRef.current, {
      center: [MAP_CONFIG.CENTER_LAT, MAP_CONFIG.CENTER_LNG],
      zoom: MAP_CONFIG.ZOOM_LEVEL,
      zoomSnap: 0,
      zoomDelta: 0.1,
      zoomControl: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: false,
      attributionControl: false,
    });

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [leafletModule]);

  useEffect(() => {
    if (!leafletModule || !mapInstanceRef.current || !geoData) return;

    const L = leafletModule;

    if (geoJsonLayerRef.current) {
      mapInstanceRef.current.removeLayer(geoJsonLayerRef.current);
    }

    const geoJsonLayer = L.geoJSON(geoData, {
      style: (feature: any) => getFeatureStyle(feature, false),
      onEachFeature: (feature: any, layer: any) => {
        layer.on({
          mouseover: () => {
            if (hoveredLayerRef.current && hoveredLayerRef.current !== layer) {
              hoveredLayerRef.current.setStyle(getFeatureStyle(hoveredLayerRef.current.feature, false));
            }
            hoveredLayerRef.current = layer;
            layer.feature = feature;
            layer.setStyle(getFeatureStyle(feature, true));
          },
          mouseout: () => {
            layer.setStyle(getFeatureStyle(feature, false));
            if (hoveredLayerRef.current === layer) {
              hoveredLayerRef.current = null;
            }
          },
          click: () => {
            if (!hayFiltroVacio) {
              setSelectedDeptName(feature.properties.NOMBRE_DPT);
            }
          },
        });
      },
    }).addTo(mapInstanceRef.current);

    if (MAP_CONFIG.USE_AUTO_FIT) {
      mapInstanceRef.current.fitBounds(geoJsonLayer.getBounds(), {
        padding: MAP_CONFIG.AUTO_FIT_PADDING,
      });
    } else {
      mapInstanceRef.current.setView([MAP_CONFIG.CENTER_LAT, MAP_CONFIG.CENTER_LNG], MAP_CONFIG.ZOOM_LEVEL);
    }

    geoJsonLayerRef.current = geoJsonLayer;
  }, [leafletModule, geoData, proyectosFiltrados, getFeatureStyle, hayFiltroVacio]);

  const toggleFilter = (list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>, item: string) => {
    setList(list.includes(item) ? list.filter((i) => i !== item) : [...list, item]);
  };

  return (
    <div 
      className="relative w-full h-full flex flex-col bg-slate-50 overflow-hidden select-none"
      onMouseLeave={() => {
        if (hoveredLayerRef.current) {
          hoveredLayerRef.current.setStyle(getFeatureStyle(hoveredLayerRef.current.feature, false));
          hoveredLayerRef.current = null;
        }
      }}
    >
      {/* 📌 FILTRO DE COMUNIDAD (ESQUINA SUPERIOR IZQUIERDA) */}
      <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur-md p-2 rounded-xl shadow-md border border-slate-200/80 w-36 flex flex-col gap-1.5">
        <div className="border-b border-slate-100 pb-1">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] font-bold text-slate-800 uppercase tracking-wide">Comunidad</span>
            <span className="text-[8px] text-slate-400 font-medium">({selectedComunidades.length})</span>
          </div>
          <div className="flex items-center justify-between text-[8px] font-bold">
            <button
              onClick={() => setSelectedComunidades(COMUNIDADES_DISPONIBLES)}
              className="text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
            >
              Todos
            </button>
            <button
              onClick={() => setSelectedComunidades([])}
              className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          {COMUNIDADES_DISPONIBLES.map((tc) => {
            const isSelected = selectedComunidades.includes(tc);
            return (
              <button
                key={tc}
                onClick={() => toggleFilter(selectedComunidades, setSelectedComunidades, tc)}
                className={`w-full flex items-center justify-between px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-all border text-left cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white border-transparent'
                    : 'bg-slate-50/60 text-slate-400 border-slate-200/50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isSelected ? 'opacity-100' : 'opacity-30'
                    }`}
                    style={{ backgroundColor: COMUNIDAD_COLORS[tc] }}
                  />
                  <span className="truncate">{tc}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 📌 FILTRO DE ESTADO (ESQUINA SUPERIOR DERECHA) */}
      <div className="absolute top-3 right-3 z-[1000] bg-white/95 backdrop-blur-md p-2 rounded-xl shadow-md border border-slate-200/80 w-36 flex flex-col gap-1.5 max-h-[85vh] overflow-y-auto">
        <div className="border-b border-slate-100 pb-1">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-[9px] font-bold text-slate-800 uppercase tracking-wide">Estado</span>
            <span className="text-[8px] text-slate-400 font-medium">({selectedEstados.length})</span>
          </div>
          <div className="flex items-center justify-between text-[8px] font-bold">
            <button
              onClick={() => setSelectedEstados(ESTADOS_DISPONIBLES)}
              className="text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
            >
              Todos
            </button>
            <button
              onClick={() => setSelectedEstados([])}
              className="text-slate-400 hover:text-slate-600 transition cursor-pointer"
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-0.5">
          {ESTADOS_DISPONIBLES.map((st) => {
            const isSelected = selectedEstados.includes(st);
            return (
              <button
                key={st}
                onClick={() => toggleFilter(selectedEstados, setSelectedEstados, st)}
                className={`w-full flex items-center justify-between px-1.5 py-0.5 rounded-md text-[9px] font-medium transition-all border text-left cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white border-transparent'
                    : 'bg-slate-50/60 text-slate-400 border-slate-200/50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isSelected ? 'opacity-100' : 'opacity-30'
                    }`}
                    style={{ backgroundColor: ESTADO_COLORS[st] }}
                  />
                  <span className="truncate">{st}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ⚠️ MENSAJE DE ADVERTENCIA CUANDO UN FILTRO ESTÁ SIN SELECCIÓN */}
      {hayFiltroVacio && (
  <div className="absolute inset-0 z-[800] flex items-center justify-center p-6 bg-slate-900/20 backdrop-blur-[2px] pointer-events-none">
    <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-amber-200 max-w-xs text-center flex flex-col items-center gap-2 pointer-events-auto animate-in fade-in zoom-in-95 duration-150">
      <AlertCircle className="w-7 h-7 text-amber-500 shrink-0" />
      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Sin filtros activos</h4>
      <p className="text-[11px] text-slate-600 leading-snug">
        No se mostrarán datos en el mapa debido a que debes seleccionar al menos <strong>un Tipo de Comunidad</strong> y <strong>un Estado del proyecto</strong>.
      </p>
    </div>
  </div>
)}

      {/* 📌 TARJETA DETALLADA DEL DEPARTAMENTO */}
      {deptData && !hayFiltroVacio && (
        <div className="absolute bottom-3 left-3 z-[1000] bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-2xl border border-slate-200/90 w-72 max-h-[70vh] flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">{deptData.nombre}</h3>
              <span className="text-[10px] text-slate-500 font-medium">Total: {deptData.total} proyectos</span>
            </div>
            <button
              onClick={() => setSelectedDeptName(null)}
              className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {deptData.total === 0 ? (
            <p className="text-[11px] text-slate-400 italic py-2 text-center">No hay proyectos con los filtros activos.</p>
          ) : (
            <div className="flex flex-col gap-2.5 overflow-y-auto pr-0.5">
              
              {/* Proporción por Estado */}
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Proporción por Estado
                </span>
                <div className="h-2 w-full flex rounded-full overflow-hidden bg-slate-100 mb-1.5">
                  {Object.entries(deptData.estadoCounts).map(([estado, count]) => {
                    const pct = ((count / deptData.total) * 100).toFixed(1);
                    return (
                      <div
                        key={estado}
                        style={{ width: `${pct}%`, backgroundColor: ESTADO_COLORS[estado] || '#94a3b8' }}
                        className="h-full"
                        title={`${estado}: ${count} (${pct}%)`}
                      />
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                  {Object.entries(deptData.estadoCounts).map(([estado, count]) => {
                    const pct = ((count / deptData.total) * 100).toFixed(1);
                    return (
                      <div key={estado} className="flex items-center justify-between text-[9px]">
                        <div className="flex items-center gap-1 truncate">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: ESTADO_COLORS[estado] || '#94a3b8' }} />
                          <span className="truncate text-slate-700 font-medium">{estado}</span>
                        </div>
                        <span className="text-slate-500 font-bold shrink-0 ml-1">{count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Proporción por Comunidad */}
              <div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Proporción por Comunidad
                </span>
                <div className="h-2 w-full flex rounded-full overflow-hidden bg-slate-100 mb-1.5">
                  {Object.entries(deptData.comCounts).map(([com, count]) => {
                    const pct = ((count / deptData.total) * 100).toFixed(1);
                    return (
                      <div
                        key={com}
                        style={{ width: `${pct}%`, backgroundColor: COMUNIDAD_COLORS[com] || '#94a3b8' }}
                        className="h-full"
                        title={`${com}: ${count} (${pct}%)`}
                      />
                    );
                  })}
                </div>
                <div className="flex flex-col gap-0.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                  {Object.entries(deptData.comCounts).map(([com, count]) => {
                    const pct = ((count / deptData.total) * 100).toFixed(1);
                    return (
                      <div key={com} className="flex items-center justify-between text-[9px]">
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: COMUNIDAD_COLORS[com] || '#94a3b8' }} />
                          <span className="text-slate-700 font-medium">{com}</span>
                        </div>
                        <span className="text-slate-500 font-bold">{count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Lista de Proyectos */}
              <div className="border-t border-slate-100 pt-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                  Proyectos ({deptData.proyectos.length})
                </span>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {deptData.proyectos.map((p, index) => (
                    <div key={`${p.Codigo}-${index}`} className="p-1.5 bg-slate-50 rounded-lg border border-slate-100 flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] text-slate-400 font-semibold">{p.Codigo}</span>
                        <span
                          className="px-1.5 py-0.2 rounded text-white text-[8px] font-semibold"
                          style={{ backgroundColor: ESTADO_COLORS[p['Nombre Estado']] || '#64748b' }}
                        >
                          {p['Nombre Estado']}
                        </span>
                      </div>
                      <span className="font-semibold text-slate-800 text-[10px] line-clamp-1">{p['Nombre POA']}</span>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="px-1.5 py-0.2 rounded bg-white text-slate-600 border border-slate-200 text-[8px]">
                          {p['Tipo Comunidad']}
                        </span>
                        <button
                          onClick={() => onSelectProyecto(p)}
                          className="flex items-center gap-0.5 text-[9px] bg-slate-900 hover:bg-slate-800 text-white font-medium px-2 py-0.5 rounded-md transition cursor-pointer"
                        >
                          <Eye className="w-3 h-3" /> Ver
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
        </div>
      )}

      {/* Contenedor del Mapa */}
      <div ref={mapContainerRef} className="w-full h-full bg-slate-50 cursor-default" />
    </div>
  );
}