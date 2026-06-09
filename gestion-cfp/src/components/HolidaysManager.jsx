import React, { useState } from 'react';
import { addDoc, deleteDoc, doc, collection, updateDoc } from 'firebase/firestore';
import { 
    Calendar, Plus, Trash2, Info, AlertCircle, CheckSquare,
    CalendarRange, ChevronRight, Moon, Sun, Umbrella, CloudDownload,
    Edit
} from 'lucide-react';
import { format, addDays, isAfter, isBefore, parseISO, eachDayOfInterval } from 'date-fns';
import { db, appId } from '../services/firebase';

const HOLIDAY_TYPES = [
    { id: 'holiday', label: 'Feriado', icon: <Sun size={14} />, color: 'bg-rose-100 text-rose-600' },
    { id: 'recess', label: 'Receso', icon: <Moon size={14} />, color: 'bg-blue-100 text-blue-600' },
    { id: 'vacation', label: 'Vacaciones', icon: <Umbrella size={14} />, color: 'bg-emerald-100 text-emerald-600' },
    { id: 'other', label: 'Otro', icon: <Info size={14} />, color: 'bg-slate-100 text-slate-600' },
];

const HolidaysManager = ({ holidays }) => {
    const [name, setName] = useState('');
    const [type, setType] = useState('holiday');
    const [isRange, setIsRange] = useState(false);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!name || !startDate || (isRange && !endDate)) return;
        
        setLoading(true);
        try {
            const holidayData = {
                name,
                type,
                startDate,
                endDate: isRange ? endDate : startDate,
                isRange,
                updatedAt: new Date().toISOString()
            };

            if (editingId) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'holidays', editingId), holidayData);
                setEditingId(null);
            } else {
                holidayData.createdAt = new Date().toISOString();
                await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'holidays'), holidayData);
            }

            setName('');
            setStartDate('');
            setEndDate('');
            setIsRange(false);
        } catch (err) {
            console.error(err);
            alert("Error al guardar el feriado");
        } finally {
            setLoading(false);
        }
    };

    const startEdit = (h) => {
        setEditingId(h.id);
        setName(h.name);
        setType(h.type);
        setIsRange(h.isRange);
        setStartDate(h.startDate);
        setEndDate(h.endDate || '');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setName('');
        setStartDate('');
        setEndDate('');
        setIsRange(false);
    };

    const handleDelete = async (id) => {
        if (!window.confirm("¿Estás seguro de eliminar este registro?")) return;
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'holidays', id));
        } catch (err) {
            console.error(err);
        }
    };

    const handleImportAPI = async () => {
        const year = new Date().getFullYear();
        if (!window.confirm(`¿Importar todos los feriados nacionales de Argentina para el año ${year}?`)) return;
        
        setLoading(true);
        try {
            const resp = await fetch(`https://api.argentinadatos.com/v1/feriados/${year}`);
            if (!resp.ok) throw new Error("API Error");
            const data = await resp.json();
            
            // Get existing holiday dates to avoid duplicates
            // We flat them out in case someone added a range that includes a holiday
            const flatExisting = new Set();
            holidays.forEach(h => {
                const start = parseISO(h.startDate);
                const end = parseISO(h.endDate || h.startDate);
                eachDayOfInterval({ start, end }).forEach(d => flatExisting.add(format(d, 'yyyy-MM-dd')));
            });
            
            let count = 0;
            for (const f of data) {
                if (!flatExisting.has(f.fecha)) {
                    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'holidays'), {
                        name: f.nombre,
                        type: 'holiday',
                        startDate: f.fecha,
                        endDate: f.fecha,
                        isRange: false,
                        apiSource: 'argentinadatos',
                        createdAt: new Date().toISOString()
                    });
                    count++;
                }
            }
            alert(`¡Éxito! Se importaron ${count} feriados nuevos.`);
        } catch (err) {
            console.error(err);
            alert("Ocurrió un error al conectar con la API de feriados (ArgentinaDatos).");
        } finally {
            setLoading(false);
        }
    };

    // Sort holidays by date
    const sortedHolidays = [...holidays].sort((a, b) => a.startDate.localeCompare(b.startDate));

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-800 p-6">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                            <Calendar className="text-blue-400" size={24} />
                        </div>
                        <h2 className="text-xl font-bold text-white">Configuración del Calendario Escolar</h2>
                    </div>
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <p className="text-slate-400 text-sm max-w-xl">
                            Agregá feriados, recesos y vacaciones. Estos días serán saltados automáticamente 
                            en el cálculo de duración de cursos y bloqueados en la asistencia.
                        </p>
                        <button 
                            type="button"
                            onClick={handleImportAPI}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl text-xs font-bold transition whitespace-nowrap"
                        >
                            <CloudDownload size={16} />
                            Importar Feriados {new Date().getFullYear()}
                        </button>
                    </div>
                </div>
                
                {editingId && (
                    <div className="bg-blue-600 px-6 py-2 flex justify-between items-center">
                        <span className="text-white text-xs font-bold uppercase tracking-wider">Modificando registro...</span>
                        <button onClick={cancelEdit} className="text-white hover:underline text-xs font-bold">Cancelar edición</button>
                    </div>
                )}

                <form onSubmit={handleSave} className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 ml-1">Descripción / Motivo</label>
                            <input 
                                type="text" 
                                value={name} 
                                onChange={e => setName(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition text-sm bg-white text-slate-900"
                                placeholder="Ej: Día del Maestro, Receso Invernal..."
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 ml-1">Tipo de Día</label>
                            <select 
                                value={type} 
                                onChange={e => setType(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition text-sm bg-white"
                            >
                                {HOLIDAY_TYPES.map(t => (
                                    <option key={t.id} value={t.id}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 py-3">
                            <button 
                                type="button"
                                onClick={() => setIsRange(!isRange)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition ${isRange ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 text-slate-600'}`}
                            >
                                {isRange ? <CalendarRange size={14} /> : <Calendar size={14} />}
                                {isRange ? 'Rango de fechas' : 'Día único'}
                            </button>
                        </div>

                        <div className={isRange ? 'md:col-span-1' : 'md:col-span-2'}>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 ml-1">
                                {isRange ? 'Fecha Inicio' : 'Fecha'}
                            </label>
                            <input 
                                type="date" 
                                value={startDate} 
                                onChange={e => setStartDate(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition text-sm bg-white text-slate-900"
                                required
                            />
                        </div>

                        {isRange && (
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 ml-1">Fecha Fin</label>
                                <input 
                                    type="date" 
                                    value={endDate} 
                                    onChange={e => setEndDate(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none transition text-sm bg-white text-slate-900"
                                    required={isRange}
                                />
                            </div>
                        )}

                        <div className="lg:col-span-full xl:col-span-1">
                            <button 
                                type="submit" 
                                disabled={loading}
                                className={`w-full text-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 ${editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                {loading ? <Plus className="animate-spin" size={18} /> : (editingId ? <CheckSquare size={18} /> : <Plus size={18} />)}
                                {editingId ? 'Guardar Cambios' : 'Agregar al Calendario'}
                            </button>
                        </div>
                    </div>
                </form>

                <div className="p-0">
                    <div className="max-h-[500px] overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-3 font-bold uppercase text-[10px]">Fecha / Período</th>
                                    <th className="px-6 py-3 font-bold uppercase text-[10px]">Descripción</th>
                                    <th className="px-6 py-3 font-bold uppercase text-[10px]">Tipo</th>
                                    <th className="px-6 py-3 font-bold uppercase text-[10px] text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {sortedHolidays.map(h => {
                                    const typeInfo = HOLIDAY_TYPES.find(t => t.id === h.type) || HOLIDAY_TYPES[3];
                                    const isPast = isBefore(parseISO(h.endDate || h.startDate), new Date());
                                    
                                    return (
                                        <tr key={h.id} className={`hover:bg-slate-50 transition group ${isPast ? 'opacity-60' : ''}`}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 font-medium text-slate-700">
                                                    {h.isRange ? (
                                                        <span className="flex items-center gap-1">
                                                            {format(parseISO(h.startDate), 'dd/MM/yy')} 
                                                            <ChevronRight size={12} className="text-slate-400" /> 
                                                            {format(parseISO(h.endDate), 'dd/MM/yy')}
                                                        </span>
                                                    ) : (
                                                        format(parseISO(h.startDate), 'dd/MM/yyyy')
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-900">{h.name}</td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${typeInfo.color}`}>
                                                    {typeInfo.icon}
                                                    {typeInfo.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button 
                                                        onClick={() => startEdit(h)}
                                                        className="text-slate-300 hover:text-blue-500 transition p-1.5"
                                                        title="Editar"
                                                    >
                                                        <Edit size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDelete(h.id)}
                                                        className="text-slate-300 hover:text-red-500 transition p-1.5"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {holidays.length === 0 && (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-12 text-center">
                                            <div className="bg-slate-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                                <Calendar className="text-slate-300" size={24} />
                                            </div>
                                            <p className="text-slate-400 font-medium">No hay feriados o recesos cargados.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <AlertCircle className="text-amber-600 shrink-0" size={20} />
                <div className="text-xs text-amber-800 space-y-1">
                    <p className="font-bold uppercase">Recordatorio</p>
                    <p>Cualquier fecha cargada aquí afectará **inmediatamente** el cálculo de la fecha de fin de todas las cohortes y la disponibilidad en el registro de asistencia.</p>
                </div>
            </div>
        </div>
    );
};

export default HolidaysManager;
