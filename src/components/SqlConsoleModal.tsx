import React, { useState } from 'react';
import { 
  X, 
  Play, 
  Database, 
  Download, 
  Code2, 
  RotateCcw, 
  Sparkles, 
  Table as TableIcon,
  AlertTriangle
} from 'lucide-react';
import { SqlQueryResult } from '../types/fits';
import { SqlStorage } from '../utils/sqlStorage';

interface SqlConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SqlConsoleModal: React.FC<SqlConsoleModalProps> = ({
  isOpen,
  onClose
}) => {
  const [query, setQuery] = useState<string>(
    `SELECT \n  object_name as 'Objecte',\n  filter_name as 'Filtre',\n  COUNT(*) as 'Total Subs',\n  ROUND(SUM(exposure_time) / 60.0, 1) as 'Minuts',\n  ROUND(AVG(sensor_temp), 1) as 'Temp Mitjana (°C)',\n  ROUND(AVG(rotation_angle), 1) as 'Angle (°)'\nFROM fits_images \nGROUP BY object_name, filter_name \nORDER BY SUM(exposure_time) DESC;`
  );
  const [result, setResult] = useState<SqlQueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  if (!isOpen) return null;

  const presets = [
    {
      title: "Resum d'Integració per Objecte & Filtre",
      sql: `SELECT \n  object_name as 'Objecte',\n  filter_name as 'Filtre',\n  COUNT(*) as 'Total Subs',\n  ROUND(SUM(exposure_time) / 60.0, 1) as 'Minuts',\n  ROUND(AVG(sensor_temp), 1) as 'Temp Mitjana (°C)'\nFROM fits_images \nGROUP BY object_name, filter_name \nORDER BY SUM(exposure_time) DESC;`
    },
    {
      title: "Comprovació de Temperatura Darks vs Lights",
      sql: `SELECT \n  image_type as 'Tipus',\n  ROUND(sensor_temp, 0) as 'Temp (°C)',\n  COUNT(*) as 'Quantitat',\n  ROUND(SUM(exposure_time), 0) as 'Exp Total (s)'\nFROM fits_images \nGROUP BY image_type, ROUND(sensor_temp, 0)\nORDER BY image_type, sensor_temp;`
    },
    {
      title: "Distribució d'Angles de Rotació (Framing Angle)",
      sql: `SELECT \n  object_name as 'Objecte',\n  ROUND(rotation_angle, 1) as 'Angle Rotació (°)',\n  COUNT(*) as 'Subs',\n  filter_name as 'Filtre'\nFROM fits_images \nWHERE image_type = 'LIGHT'\nGROUP BY object_name, ROUND(rotation_angle, 1), filter_name\nORDER BY object_name, rotation_angle;`
    },
    {
      title: "Resum per Nit de Captura (Date-Obs)",
      sql: `SELECT \n  SUBSTR(date_obs, 1, 10) as 'Data',\n  COUNT(*) as 'Fitxers',\n  ROUND(SUM(exposure_time)/3600.0, 2) as 'Hores Integració',\n  COUNT(DISTINCT object_name) as 'Objectes'\nFROM fits_images\nGROUP BY SUBSTR(date_obs, 1, 10)\nORDER BY Data DESC;`
    },
    {
      title: "Subs amb Alta Massa d'Aire (Airmass > 1.3)",
      sql: `SELECT \n  file_name as 'Fitxer',\n  object_name as 'Objecte',\n  airmass as 'Massa Aire',\n  date_obs as 'Data'\nFROM fits_images\nWHERE airmass > 1.3\nORDER BY airmass DESC;`
    },
    {
      title: "Tots els Lights Ordenats per Exposició",
      sql: `SELECT \n  file_name, object_name, exposure_time, sensor_temp, rotation_angle, filter_name, telescope, camera\nFROM fits_images\nWHERE image_type = 'LIGHT'\nORDER BY exposure_time DESC\nLIMIT 50;`
    }
  ];

  const handleExecute = async () => {
    if (!query.trim()) return;
    setIsExecuting(true);
    const res = await SqlStorage.executeSqlQuery(query);
    setResult(res);
    setIsExecuting(false);
  };

  const handleExportCsv = () => {
    if (!result || result.rows.length === 0) return;
    const cols = result.columns;
    const csvRows = [cols.join(',')];
    result.rows.forEach(r => {
      const vals = cols.map(c => {
        const val = r[c];
        if (val === null || val === undefined) return '';
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvRows.push(vals.join(','));
    });
    const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_result_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-[#0B0F19]/85 backdrop-blur-md animate-fadeIn">
      <div 
        id="sql-console-modal"
        className="bg-[#161B22] border border-slate-700/60 rounded-xl w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50 bg-[#0D1117]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2 font-sans">
                Consola SQL d'Astrofotografia
                <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30 font-mono font-normal">
                  SQLite Engine
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Executa consultes relacionals sobre la taula <code className="text-blue-400 font-mono">fits_images</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left Panel: Query Presets */}
          <div className="w-full md:w-72 bg-[#0D1117] border-b md:border-b-0 md:border-r border-slate-700/50 p-3.5 overflow-y-auto space-y-2.5">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Plantilles SQL</span>
            </span>

            <div className="space-y-1.5">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => setQuery(p.sql)}
                  className="w-full text-left p-2 rounded border border-slate-700/60 hover:border-blue-500/50 bg-[#161B22] hover:bg-slate-800 text-xs text-slate-300 hover:text-white transition space-y-0.5"
                >
                  <div className="font-medium truncate font-sans text-xs">{p.title}</div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">SELECT ... FROM fits_images</div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Panel: SQL Editor & Result Grid */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#161B22]">
            
            {/* SQL Editor Area */}
            <div className="p-3.5 border-b border-slate-700/50 bg-[#0D1117] space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-blue-400" />
                  <span>Editor SQL</span>
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setQuery('SELECT * FROM fits_images LIMIT 20;')}
                    className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Netejar</span>
                  </button>
                  <button
                    id="btn-execute-sql"
                    onClick={handleExecute}
                    disabled={isExecuting}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>{isExecuting ? 'Executant...' : 'Executar SQL'}</span>
                  </button>
                </div>
              </div>

              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                rows={5}
                className="w-full bg-[#0B0F19] border border-slate-700 focus:border-blue-500 rounded p-2.5 font-mono text-xs text-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Escriu la teva consulta SQL aquí..."
              />
            </div>

            {/* Results Grid Header */}
            <div className="px-4 py-2 bg-[#0D1117] border-b border-slate-700/50 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-3 text-slate-400">
                <TableIcon className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[11px] font-mono">
                  Resultats:{' '}
                  <strong className="text-white font-mono">
                    {result ? result.rowCount : 0}
                  </strong>{' '}
                  files
                </span>
                {result?.executionTimeMs !== undefined && (
                  <span className="text-slate-500 font-mono text-[10px]">
                    ({result.executionTimeMs} ms)
                  </span>
                )}
              </div>

              {result && result.rows.length > 0 && (
                <button
                  onClick={handleExportCsv}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded border border-slate-700 transition flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-green-400" />
                  <span>Descarrega CSV</span>
                </button>
              )}
            </div>

            {/* Query Results Table or Error */}
            <div className="flex-1 overflow-auto p-3 font-mono text-xs bg-[#0B0F19]">
              {result?.error ? (
                <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded text-rose-300 flex items-start space-x-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <strong className="font-semibold block">Error SQL:</strong>
                    <span>{result.error}</span>
                  </div>
                </div>
              ) : result && result.columns.length > 0 ? (
                <div className="border border-slate-700/50 rounded overflow-hidden bg-[#161B22]">
                  <table className="w-full text-left divide-y divide-slate-700/50">
                    <thead className="bg-[#0D1117] text-slate-400 sticky top-0 uppercase tracking-wider text-[10px]">
                      <tr>
                        {result.columns.map((col) => (
                          <th key={col} className="p-2.5 font-semibold text-slate-300 whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 text-slate-300 text-xs">
                      {result.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-800/40 transition">
                          {result.columns.map((col) => (
                            <td key={col} className="p-2.5 whitespace-nowrap text-slate-200">
                              {row[col] === null ? (
                                <span className="text-slate-600">NULL</span>
                              ) : (
                                String(row[col])
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2 text-center p-8">
                  <Code2 className="w-8 h-8 text-slate-600" />
                  <p className="text-xs">Prem "Executar SQL" per visualitzar els resultats de la consulta relacional.</p>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-2.5 border-t border-slate-700/50 bg-[#0D1117]">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition"
          >
            Tancar Consola
          </button>
        </div>
      </div>
    </div>
  );
};
