'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabaseClient';
import { Proyecto, ESTADO_COLORS, COMUNIDAD_COLORS } from '@/components/ColombiaMap';
import { 
  Filter, 
  X, 
  Eye, 
  Layers, 
  Users, 
  FileText, 
  Upload, 
  AlertTriangle, 
  Loader2 
} from 'lucide-react';

const ColombiaMap = dynamic(() => import('../components/ColombiaMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-slate-100 flex items-center justify-center">Cargando mapa...</div>,
});

const REQUIRED_HEADERS = [
  'Codigo',
  'Nombre POA',
  'Nombre Ejecutor',
  'Nombre Sector',
  'Nombre Estado',
  'Departamento',
  'Municipio',
  'Etnia',
  'Tipo Comunidad',
  'Cantidad Pob Cert',
];

export default function Dashboard() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProyecto, setSelectedProyecto] = useState<Proyecto | null>(null);

  // Estados para Carga de CSV y Confirmación
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessingCsv, setIsProcessingCsv] = useState(false);
  const [pendingCsvData, setPendingCsvData] = useState<any[] | null>(null);
  const [csvFileName, setCsvFileName] = useState<string>('');
  const [csvError, setCsvError] = useState<string | null>(null);
  const [excludedCount, setExcludedCount] = useState<number>(0);
  const [showConfirmCsvModal, setShowConfirmCsvModal] = useState(false);

  // Filtros de estadísticas
  const [filtroGrafica1Estado, setFiltroGrafica1Estado] = useState<string>('TODOS');
  const [filtroGrafica2Comunidad, setFiltroGrafica2Comunidad] = useState<string>('TODOS');

  // Filtros de tabla
  const [filtroTablaEstado, setFiltroTablaEstado] = useState<string[]>([]);
  const [filtroTablaComunidad, setFiltroTablaComunidad] = useState<string[]>([]);
  const [busquedaPOA, setBusquedaPOA] = useState<string>('');
  const [dropdownOpen, setDropdownOpen] = useState<'estado' | 'comunidad' | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('Proyectos').select('*');

    if (error) {
      console.error('Detalles del error:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
    } else if (data) {
      setProyectos(data as Proyecto[]);
      const estados = Array.from(new Set(data.map((d: Proyecto) => d['Nombre Estado'])));
      const comunidades = Array.from(new Set(data.map((d: Proyecto) => d['Tipo Comunidad'])));
      setFiltroTablaEstado(estados);
      setFiltroTablaComunidad(comunidades);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const uniqueEstados = useMemo(() => Array.from(new Set(proyectos.map((p) => p['Nombre Estado']))), [proyectos]);
  const uniqueComunidades = useMemo(() => Array.from(new Set(proyectos.map((p) => p['Tipo Comunidad']))), [proyectos]);

  // ==========================================
  // PARSER Y FILTRADO CSV (Solo HIDROCARBUROS)
  // ==========================================
  const parseCSV = (text: string) => {
    const firstLine = text.split(/\r\n|\n/)[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        currentLine += char;
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (currentLine.trim()) lines.push(currentLine);
        currentLine = '';
        if (char === '\r' && text[i + 1] === '\n') i++;
      } else {
        currentLine += char;
      }
    }
    if (currentLine.trim()) lines.push(currentLine);

    if (lines.length < 2) throw new Error('El archivo CSV está vacío o no contiene filas.');

    const parseRow = (rowStr: string) => {
      const values: string[] = [];
      let val = '';
      let quotes = false;
      for (let i = 0; i < rowStr.length; i++) {
        const c = rowStr[i];
        if (c === '"') {
          quotes = !quotes;
        } else if (c === delimiter && !quotes) {
          values.push(val.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
          val = '';
        } else {
          val += c;
        }
      }
      values.push(val.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
      return values;
    };

    const headers = parseRow(lines[0]).map((h) => h.trim());

    const missingHeaders = REQUIRED_HEADERS.filter(
      (req) => !headers.some((h) => h.toLowerCase() === req.toLowerCase())
    );

    if (missingHeaders.length > 0) {
      throw new Error(
        `El CSV no tiene los encabezados correctos. Faltan: ${missingHeaders.join(', ')}`
      );
    }

    let totalRawRows = 0;
    const validRows: any[] = [];

    lines.slice(1).forEach((line) => {
      const values = parseRow(line);
      const obj: any = {};
      headers.forEach((header, index) => {
        const matchedKey = REQUIRED_HEADERS.find((k) => k.toLowerCase() === header.toLowerCase()) || header;
        let value: any = values[index] ?? '';

        if (matchedKey === 'Cantidad Pob Cert') {
          value = Number(value) || 0;
        } else if (matchedKey === 'Departamento') {
          value = (value || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        }
        obj[matchedKey] = value;
      });

      if (obj.Codigo && obj['Nombre POA']) {
        totalRawRows++;
        // 🚀 FILTRO CONDICIONAL: Solo acepta Nombre Sector === 'HIDROCARBUROS'
        const sector = (obj['Nombre Sector'] || '').toString().trim().toUpperCase();
        if (sector === 'HIDROCARBUROS') {
          validRows.push(obj);
        }
      }
    });

    setExcludedCount(totalRawRows - validRows.length);
    return validRows;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    setCsvFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCSV(text);
        if (parsed.length === 0) {
          throw new Error('No se encontraron registros válidos con sector HIDROCARBUROS para importar.');
        }
        setPendingCsvData(parsed);
        setShowConfirmCsvModal(true);
      } catch (err: any) {
        setCsvError(err.message || 'Error al procesar el archivo CSV.');
      }
    };
    reader.onerror = () => setCsvError('Error al leer el archivo.');
    reader.readAsText(file, 'utf-8');

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const executeDatabaseReplace = async () => {
    if (!pendingCsvData || pendingCsvData.length === 0) return;

    setIsProcessingCsv(true);
    setCsvError(null);

    try {
      const { error: deleteError } = await supabase
        .from('Proyectos')
        .delete()
        .not('Codigo', 'is', null);

      if (deleteError) {
        throw new Error(`Error al vaciar la base de datos: ${deleteError.message}`);
      }

      const BATCH_SIZE = 500;
      for (let i = 0; i < pendingCsvData.length; i += BATCH_SIZE) {
        const batch = pendingCsvData.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await supabase
          .from('Proyectos')
          .insert(batch);

        if (insertError) {
          throw new Error(`Error al insertar lote ${i / BATCH_SIZE + 1}: ${insertError.message}`);
        }
      }

      await fetchData();
      setShowConfirmCsvModal(false);
      setPendingCsvData(null);
    } catch (err: any) {
      setCsvError(err.message || 'Ocurrió un error al actualizar la base de datos.');
    } finally {
      setIsProcessingCsv(false);
    }
  };

  // Gráficas
  const dataGrafica1 = useMemo(() => {
    const list = filtroGrafica1Estado === 'TODOS'
      ? proyectos
      : proyectos.filter((p) => p['Nombre Estado'] === filtroGrafica1Estado);
    const counts: Record<string, number> = { INDÍGENA: 0, AFRODESCENDIENTE: 0 };
    list.forEach((p) => {
      if (counts[p['Tipo Comunidad']] !== undefined) {
        counts[p['Tipo Comunidad']] += 1;
      }
    });
    return counts;
  }, [proyectos, filtroGrafica1Estado]);

  const dataGrafica2 = useMemo(() => {
    const list = filtroGrafica2Comunidad === 'TODOS'
      ? proyectos
      : proyectos.filter((p) => p['Tipo Comunidad'] === filtroGrafica2Comunidad);
    const counts: Record<string, number> = {};
    uniqueEstados.forEach((st) => (counts[st] = 0));
    list.forEach((p) => {
      counts[p['Nombre Estado']] = (counts[p['Nombre Estado']] || 0) + 1;
    });
    return counts;
  }, [proyectos, filtroGrafica2Comunidad, uniqueEstados]);

  // Tabla
const proyectosTabla = useMemo(() => {
  const search = busquedaPOA.toLowerCase().trim();
  return proyectos.filter((p) => {
    const matchPOA = p['Nombre POA']?.toLowerCase().includes(search);
    const matchCodigo = String(p.Codigo ?? '').toLowerCase().includes(search);
    const matchSearch = !search || matchPOA || matchCodigo;

    const matchEstado = filtroTablaEstado.includes(p['Nombre Estado']);
    const matchComunidad = filtroTablaComunidad.includes(p['Tipo Comunidad']);
    return matchSearch && matchEstado && matchComunidad;
  });
}, [proyectos, busquedaPOA, filtroTablaEstado, filtroTablaComunidad]);
  const toggleTablaFilter = (item: string, current: string[], setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(current.includes(item) ? current.filter((i) => i !== item) : [...current, item]);
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-900 text-white">
        <p className="animate-pulse text-lg font-semibold tracking-wide">Cargando SiCoPre...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-100 overflow-hidden font-sans">
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* SECCIÓN IZQUIERDA (3/5 ANCHO) */}
      <div className="w-3/5 h-full flex flex-col border-r border-slate-200 bg-white shadow-xl z-10 overflow-y-auto relative">

 <div className="absolute top-0 bottom-0 left-0 w-2 flex flex-col z-20 pointer-events-none">
          <div className="h-1/2 w-full bg-[#FCD116]" title="Amarillo" />
          <div className="h-1/4 w-full bg-[#003893]" title="Azul" />
          <div className="h-1/4 w-full bg-[#CE1126]" title="Rojo" />
        </div>

        {/* 🇨🇴 2. BARRA VERTICAL BORDE DERECHO */}
        <div className="absolute top-0 bottom-0 right-0 w-2 flex flex-col z-20 pointer-events-none">
          <div className="h-1/2 w-full bg-[#FCD116]" title="Amarillo" />
          <div className="h-1/4 w-full bg-[#003893]" title="Azul" />
          <div className="h-1/4 w-full bg-[#CE1126]" title="Rojo" />
        </div>

{/* 🇨🇴 FRANJA DECORATIVA SUTIL BANDERA DE COLOMBIA */}
<div className="h-2 w-full flex shrink-0 shadow-xs">
  <div className="h-full w-1/2 bg-[#FCD116]" title="Colombia - Amarillo" />
  <div className="h-full w-1/4 bg-[#003893]" title="Colombia - Azul" />
  <div className="h-full w-1/4 bg-[#CE1126]" title="Colombia - Rojo" />
</div>

{/* 📌 HEADER CON LOGOS AGRUPADOS A LA IZQUIERDA Y BOTÓN SOLO A LA DERECHA */}
<div className="px-4 py-2.5 border-b border-slate-200 bg-white flex items-center justify-between shadow-xs">
  {/* Sección Izquierda: Logos + Título + Contador */}
  <div className="flex items-center gap-3.5">
    {/* Logos 1 y 2 juntos */}
    <div className="flex items-center gap-2">
      <img 
        src="/LOGO 2.png" 
        alt="Logo 2" 
        className="h-12 md:h-14 w-auto max-w-[90px] object-contain drop-shadow-xs"
        onError={(e) => (e.currentTarget.style.display = 'none')}
      />
      <img 
        src="/LOGO 1.png" 
        alt="Logo 1" 
        className="h-12 md:h-14 w-auto max-w-[90px] object-contain drop-shadow-xs"
        onError={(e) => (e.currentTarget.style.display = 'none')}
      />
      
    </div>

    {/* Divisor sutil */}
    <div className="h-8 w-px bg-slate-200 hidden sm:block" />

    {/* Nombre SiCoPre y Contador */}
    <div>
      <h1 className="text-xl font-black tracking-tight text-slate-900 leading-none">
        SiCoPre
      </h1>
      <p className="text-[11px] text-slate-500 font-semibold mt-1">
        Total Proyectos: <span className="text-indigo-600 font-bold">{proyectos.length}</span>
      </p>
    </div>
  </div>
  
  {/* Sección Derecha: Botón Cargar CSV solo */}
  <button
    onClick={() => fileInputRef.current?.click()}
    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-sm transition-all hover:shadow cursor-pointer shrink-0"
    title="Cargar CSV para reemplazar la base de datos"
  >
    <Upload className="w-4 h-4" />
    <span>Cargar CSV</span>
  </button>
</div>

        {/* Mensaje de Error de Validación CSV */}
        {csvError && !showConfirmCsvModal && (
          <div className="mx-4 mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <p>{csvError}</p>
            </div>
            <button onClick={() => setCsvError(null)} className="text-rose-400 hover:text-rose-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* SECCIÓN ESTADÍSTICAS BÁSICAS */}
        <div className="p-4 grid grid-cols-2 gap-4 bg-slate-50/50 border-b border-slate-200">
          {/* Gráfica 1 */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-500" /> Por Tipo Comunidad
              </span>
              <select
                value={filtroGrafica1Estado}
                onChange={(e) => setFiltroGrafica1Estado(e.target.value)}
                className="text-[11px] bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 outline-none text-slate-600 font-medium"
              >
                <option value="TODOS">Todos los Estados</option>
                {uniqueEstados.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2 mt-3">
              {Object.entries(dataGrafica1).map(([com, count]) => {
                const total = Object.values(dataGrafica1).reduce((a, b) => a + b, 0) || 1;
                const pct = ((count / total) * 100).toFixed(1);
                return (
                  <div key={com}>
                    <div className="flex justify-between text-xs font-semibold mb-1 text-slate-700">
                      <span>{com}</span>
                      <span>{count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: COMUNIDAD_COLORS[com] || '#64748b',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gráfica 2 */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700 uppercase flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" /> Por Nombre Estado
              </span>
              <select
                value={filtroGrafica2Comunidad}
                onChange={(e) => setFiltroGrafica2Comunidad(e.target.value)}
                className="text-[11px] bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 outline-none text-slate-600 font-medium"
              >
                <option value="TODOS">Todas las Comunidades</option>
                {uniqueComunidades.map((tc) => (
                  <option key={tc} value={tc}>{tc}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 mt-3 max-h-36 overflow-y-auto pr-1">
              {Object.entries(dataGrafica2).map(([estado, count]) => {
                const total = Object.values(dataGrafica2).reduce((a, b) => a + b, 0) || 1;
                const pct = ((count / total) * 100).toFixed(1);
                return (
                  <div key={estado} className="text-[11px]">
                    <div className="flex justify-between font-medium text-slate-600 mb-0.5">
                      <span className="truncate">{estado}</span>
                      <span>{count} ({pct}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: ESTADO_COLORS[estado] || '#64748b',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* SECCIÓN TABLA CON FILTROS TIPO EXCEL */}
        <div className="flex-1 p-4 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Listado de Proyectos</h3>
            <span className="text-[11px] bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-md">
              {proyectosTabla.length} resultados
            </span>
          </div>

          {/* Buscador POA */}
          <input
            type="text"
            placeholder="Buscar por Codigo o Nombre POA..."
            value={busquedaPOA}
            onChange={(e) => setBusquedaPOA(e.target.value)}
            className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-3 outline-none focus:border-indigo-500 transition focus:bg-white transition shadow-xs"
          />

          {/* Tabla con Columna de Código */}
          <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-white relative">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="p-2.5 w-24">Código</th>
                  <th className="p-2.5">Nombre POA</th>
                  <th className="p-2.5 relative">
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => setDropdownOpen(dropdownOpen === 'estado' ? null : 'estado')}>
                      <span>Estado</span>
                      <Filter className="w-3 h-3 text-slate-400" />
                    </div>
                    {dropdownOpen === 'estado' && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl p-2 z-50 w-44 font-normal text-slate-700">
                        <div className="flex justify-between border-b pb-1 mb-1 text-[10px] text-indigo-600 font-semibold cursor-pointer">
                          <span onClick={() => setFiltroTablaEstado(uniqueEstados)}>Todos</span>
                          <span onClick={() => setFiltroTablaEstado([])}>Limpiar</span>
                        </div>
                        {uniqueEstados.map((st) => (
                          <label key={st} className="flex items-center gap-1.5 py-1 text-[11px] hover:bg-slate-50 cursor-pointer px-1 rounded">
                            <input
                              type="checkbox"
                              checked={filtroTablaEstado.includes(st)}
                              onChange={() => toggleTablaFilter(st, filtroTablaEstado, setFiltroTablaEstado)}
                              className="rounded text-indigo-600 text-xs"
                            />
                            <span className="truncate">{st}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </th>
                  <th className="p-2.5 relative">
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => setDropdownOpen(dropdownOpen === 'comunidad' ? null : 'comunidad')}>
                      <span>Comunidad</span>
                      <Filter className="w-3 h-3 text-slate-400" />
                    </div>
                    {dropdownOpen === 'comunidad' && (
                      <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl p-2 z-50 w-44 font-normal text-slate-700">
                        <div className="flex justify-between border-b pb-1 mb-1 text-[10px] text-indigo-600 font-semibold cursor-pointer">
                          <span onClick={() => setFiltroTablaComunidad(uniqueComunidades)}>Todos</span>
                          <span onClick={() => setFiltroTablaComunidad([])}>Limpiar</span>
                        </div>
                        {uniqueComunidades.map((tc) => (
                          <label key={tc} className="flex items-center gap-1.5 py-1 text-[11px] hover:bg-slate-50 cursor-pointer px-1 rounded">
                            <input
                              type="checkbox"
                              checked={filtroTablaComunidad.includes(tc)}
                              onChange={() => toggleTablaFilter(tc, filtroTablaComunidad, setFiltroTablaComunidad)}
                              className="rounded text-indigo-600 text-xs"
                            />
                            <span className="truncate">{tc}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </th>
                  <th className="p-2.5 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {proyectosTabla.map((p) => (
                  <tr key={p.Codigo} className="hover:bg-slate-50/80 transition">
                    {/* Código del Proyecto */}
                    <td className="p-2.5 font-mono text-[10px] text-slate-500 font-semibold align-top whitespace-nowrap">
                      {p.Codigo}
                    </td>
                    
                    {/* Nombre POA */}
                    <td className="p-2.5 font-medium text-slate-800 text-[11px] leading-relaxed break-words whitespace-normal align-top max-w-[200px]">
                      {p['Nombre POA']}
                    </td>

                    {/* Estado */}
                    <td className="p-2.5 whitespace-nowrap align-top">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-white text-[10px] font-semibold tracking-tight shadow-sm"
                        style={{ backgroundColor: ESTADO_COLORS[p['Nombre Estado']] || '#64748b' }}
                      >
                        {p['Nombre Estado']}
                      </span>
                    </td>

                    {/* Comunidad */}
                    <td className="p-2.5 whitespace-nowrap text-[11px] text-slate-600 align-top">
                      {p['Tipo Comunidad']}
                    </td>

                    {/* Acción */}
                    <td className="p-2.5 text-center align-top">
                      <button
                        onClick={() => setSelectedProyecto(p)}
                        className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition cursor-pointer"
                        title="Ver detalle"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SECCIÓN DERECHA: MAPA (2/5 ANCHO) */}
      <div className="w-2/5 h-full relative">
        <ColombiaMap proyectos={proyectos} onSelectProyecto={(p) => setSelectedProyecto(p)} />
      </div>

      {/* MODAL DE CONFIRMACIÓN CSV */}
      {showConfirmCsvModal && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-rose-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-white" />
                <h3 className="font-bold text-sm">¿Reemplazar Base de Datos?</h3>
              </div>
              {!isProcessingCsv && (
                <button
                  onClick={() => {
                    setShowConfirmCsvModal(false);
                    setPendingCsvData(null);
                  }}
                  className="text-rose-200 hover:text-white transition"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="p-5 text-xs text-slate-600 space-y-3">
              <p className="font-semibold text-slate-800 text-sm">
                Esta acción es destructiva e irreversible.
              </p>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <p>
                  <span className="font-bold text-slate-700">Archivo:</span> {csvFileName}
                </p>
                <p>
                  <span className="font-bold text-slate-700">Proyectos HIDROCARBUROS a cargar:</span>{' '}
                  <span className="text-indigo-600 font-bold">{pendingCsvData?.length}</span>
                </p>
                {excludedCount > 0 && (
                  <p className="text-amber-600 font-semibold">
                    ⚠️ Se excluyeron {excludedCount} registros cuyo sector no es HIDROCARBUROS.
                  </p>
                )}
                <p>
                  <span className="font-bold text-slate-700">Registros actuales a borrar:</span>{' '}
                  <span className="text-rose-600 font-bold">{proyectos.length} proyectos</span>
                </p>
              </div>

              {csvError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-[11px]">
                  {csvError}
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                disabled={isProcessingCsv}
                onClick={() => {
                  setShowConfirmCsvModal(false);
                  setPendingCsvData(null);
                }}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-xl border border-slate-200 transition disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                disabled={isProcessingCsv}
                onClick={executeDatabaseReplace}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl shadow-md transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isProcessingCsv ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Reemplazando datos...</span>
                  </>
                ) : (
                  <span>Sí, borrar y reemplazar</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE DETALLE DEL PROYECTO */}
      {selectedProyecto && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-start">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                  Código: {selectedProyecto.Codigo}
                </span>
                <h2 className="text-sm font-bold mt-1 leading-snug">{selectedProyecto['Nombre POA']}</h2>
              </div>
              <button
                onClick={() => setSelectedProyecto(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 grid grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Ejecutor</span>
                <p className="font-semibold text-slate-800 mt-0.5">{selectedProyecto['Nombre Ejecutor'] || 'N/A'}</p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Sector</span>
                <p className="font-semibold text-slate-800 mt-0.5">{selectedProyecto['Nombre Sector']}</p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Estado</span>
                <span
                  className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-white font-semibold text-[10px]"
                  style={{ backgroundColor: ESTADO_COLORS[selectedProyecto['Nombre Estado']] || '#64748b' }}
                >
                  {selectedProyecto['Nombre Estado']}
                </span>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Ubicación</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {selectedProyecto.Municipio}, {selectedProyecto.Departamento}
                </p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Tipo Comunidad</span>
                <p className="font-semibold text-slate-800 mt-0.5">{selectedProyecto['Tipo Comunidad']}</p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Etnia</span>
                <p className="font-semibold text-slate-800 mt-0.5">{selectedProyecto.Etnia || 'N/A'}</p>
              </div>

              <div className="col-span-2 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 flex justify-between items-center">
                <span className="text-xs font-bold text-indigo-900">Cantidad Poblaciones Certificadas</span>
                <span className="text-base font-bold text-indigo-600 bg-white px-3 py-1 rounded-lg border border-indigo-200">
                  {selectedProyecto['Cantidad Pob Cert'] ?? 0}
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 text-right">
              <button
                onClick={() => setSelectedProyecto(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}