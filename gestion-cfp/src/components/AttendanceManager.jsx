import React, { useState, useEffect } from 'react';
import { setDoc, doc } from 'firebase/firestore';
import { CheckSquare, AlertCircle } from 'lucide-react';
import { db, appId } from '../services/firebase';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import DatePicker, { registerLocale } from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

registerLocale('es', es);
const AttendanceManager = ({ cohorts, students, attendanceLogs, holidays }) => {
    const [selectedCohortId, setSelectedCohortId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [presentIds, setPresentIds] = useState([]);
    const [absentIds, setAbsentIds] = useState([]);
    const [saved, setSaved] = useState(false);

    const existingLog = attendanceLogs.find(l => l.cohortId === selectedCohortId && l.date === date);
    const isNewLog = !existingLog;

    useEffect(() => {
        if (!selectedCohortId || !date) return;
        setPresentIds(existingLog ? (existingLog.presentIds || []) : []);
        setAbsentIds(existingLog ? (existingLog.absentIds || []) : []);
        setSaved(false);
    }, [selectedCohortId, date, attendanceLogs]);

    const selectedCohort = cohorts.find(c => c.id === selectedCohortId);
    const enrolledStudents = selectedCohort ? students.filter(s => selectedCohort.studentIds?.includes(s.id)) : [];

    // Check if the selected date is a holiday
    const isHoliday = holidays?.some(h => {
        try {
            const start = h.startDate;
            const end = h.endDate || h.startDate;
            return date >= start && date <= end;
        } catch (e) { return false; }
    });
    const holidayInfo = isHoliday ? holidays.find(h => {
        const start = h.startDate;
        const end = h.endDate || h.startDate;
        return date >= start && date <= end;
    }) : null;

    const handleSave = async () => {
        if (!selectedCohortId) return;
        const logId = `${selectedCohortId}_${date}`;
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'attendance', logId), {
                cohortId: selectedCohortId, date, presentIds, absentIds, timestamp: new Date().toISOString()
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) { alert("Error al guardar"); }
    };

    const cycleStatus = (id) => {
        if (presentIds.includes(id)) {
            // Present -> Absent
            setPresentIds(prev => prev.filter(x => x !== id));
            setAbsentIds(prev => [...prev, id]);
        } else if (absentIds.includes(id)) {
            // Absent -> Unregistered
            setAbsentIds(prev => prev.filter(x => x !== id));
        } else {
            // Unregistered -> Present
            setPresentIds(prev => [...prev, id]);
        }
        setSaved(false);
    };

    const markAllPresent = () => {
        setPresentIds(enrolledStudents.map(s => s.id));
        setAbsentIds([]);
        setSaved(false);
    };

    return (
        <div className="w-full bg-white p-8 rounded-xl shadow-lg border border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Seleccionar Cohorte</label>
                    <select className="w-full bg-white text-slate-900 p-3 border rounded-lg bg-slate-50" value={selectedCohortId} onChange={e => setSelectedCohortId(e.target.value)}>
                        <option value="">-- Seleccionar Curso --</option>
                        {cohorts.map(c => <option key={c.id} value={c.id}>Cohorte #{c.id.substring(0, 4)}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Fecha de Clase</label>
                    <DatePicker 
                        selected={date ? parseISO(date) : null} 
                        onChange={d => setDate(d ? format(d, 'yyyy-MM-dd') : '')} 
                        dateFormat="dd/MM/yyyy" isClearable placeholderText="dd/mm/aaaa"
                        className="w-full bg-white text-slate-900 p-3 border rounded-lg bg-slate-50" 
                    />
                </div>
            </div>

            {isHoliday && (
                <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 animate-pulse">
                    <AlertCircle size={24} />
                    <div>
                        <p className="font-bold text-sm uppercase">Día No Lectivo: {holidayInfo?.name}</p>
                        <p className="text-xs">Esta fecha está marcada como {holidayInfo?.type === 'holiday' ? 'feriado' : holidayInfo?.type === 'recess' ? 'receso' : 'vacaciones'} en el sistema.</p>
                    </div>
                </div>
            )}

            {selectedCohortId ? (
                <>
                    <div className="mb-4 flex justify-between items-end">
                        <div>
                            <h3 className="font-bold text-lg">Alumnos ({enrolledStudents.length})</h3>
                            <span className="text-sm text-slate-500">Click para cambiar estado: Presente → Ausente → Sin Registrar</span>
                        </div>
                        <button onClick={markAllPresent} className="text-sm text-blue-600 font-bold hover:underline">Marcar Todos Presentes</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
                        {enrolledStudents.map(s => {
                            const isPresent = presentIds.includes(s.id);
                            const isAbsent = absentIds.includes(s.id);

                            let statusLabel = 'SIN REGISTRAR';
                            let statusColor = 'text-slate-400';
                            let cardColor = 'bg-slate-50 border-slate-200 hover:bg-slate-100';
                            let iconColor = 'border-slate-300 bg-white text-transparent';

                            if (isPresent) {
                                statusLabel = 'PRESENTE';
                                statusColor = 'text-green-600';
                                cardColor = 'bg-green-50 border-green-200 shadow-sm';
                                iconColor = 'bg-green-500 border-green-500 text-white';
                            } else if (isAbsent) {
                                statusLabel = 'AUSENTE';
                                statusColor = 'text-red-600';
                                cardColor = 'bg-red-50 border-red-200 shadow-sm';
                                iconColor = 'bg-red-500 border-red-500 text-white';
                            }

                            return (
                                <div key={s.id} onClick={() => cycleStatus(s.id)} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition select-none ${cardColor}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-6 h-6 rounded border flex items-center justify-center transition ${iconColor}`}>
                                            {isPresent && <CheckSquare size={16} />}
                                            {isAbsent && <span className="text-xs font-bold">X</span>}
                                        </div>
                                        <div>
                                            <div className={`font-bold ${isPresent ? 'text-green-900' : isAbsent ? 'text-red-900' : 'text-slate-700'}`}>{s.firstName} {s.lastName}</div>
                                            <div className={`text-xs font-bold ${statusColor}`}>{statusLabel}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <button 
                        onClick={handleSave} 
                        disabled={isHoliday && isNewLog}
                        className={`w-full py-3 rounded-lg font-bold text-lg transition ${isHoliday && isNewLog ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : saved ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                    >
                        {saved ? '¡Guardado!' : isHoliday && isNewLog ? 'No se puede registrar asistencia en feriados' : 'Guardar Asistencia'}
                    </button>
                </>
            ) : <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-lg border border-dashed">Seleccione una cohorte.</div>}
        </div>
    );
};

export default AttendanceManager;
