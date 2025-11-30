import React, { useState, useEffect } from 'react';
import { setDoc, doc } from 'firebase/firestore';
import { CheckSquare } from 'lucide-react';
import { db, appId } from '../services/firebase';

const AttendanceManager = ({ cohorts, students, attendanceLogs }) => {
    const [selectedCohortId, setSelectedCohortId] = useState('');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [presentIds, setPresentIds] = useState([]);
    const [saved, setSaved] = useState(false);

    const existingLog = attendanceLogs.find(l => l.cohortId === selectedCohortId && l.date === date);
    const isNewLog = !existingLog;

    useEffect(() => {
        if (!selectedCohortId || !date) return;
        setPresentIds(existingLog ? (existingLog.presentIds || []) : []);
        setSaved(false);
    }, [selectedCohortId, date, attendanceLogs]);

    const selectedCohort = cohorts.find(c => c.id === selectedCohortId);
    const enrolledStudents = selectedCohort ? students.filter(s => selectedCohort.studentIds?.includes(s.id)) : [];

    const handleSave = async () => {
        if (!selectedCohortId) return;
        const logId = `${selectedCohortId}_${date}`;
        try {
            await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'attendance', logId), {
                cohortId: selectedCohortId, date, presentIds, timestamp: new Date().toISOString()
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) { alert("Error al guardar"); }
    };

    const togglePresent = (id) => {
        setPresentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
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
                    <input type="date" className="w-full bg-white text-slate-900 p-3 border rounded-lg bg-slate-50" value={date} onChange={e => setDate(e.target.value)} />
                </div>
            </div>
            {selectedCohortId ? (
                <>
                    <div className="mb-4 flex justify-between items-end">
                        <div>
                            <h3 className="font-bold text-lg">Alumnos ({enrolledStudents.length})</h3>
                            <span className="text-sm text-slate-500">Marque los presentes</span>
                        </div>
                        <button onClick={() => setPresentIds(enrolledStudents.map(s => s.id))} className="text-sm text-blue-600 font-bold hover:underline">Marcar Todos Presentes</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
                        {enrolledStudents.map(s => {
                            const isPresent = presentIds.includes(s.id);
                            let statusLabel = 'AUSENTE';
                            let statusColor = 'text-red-500';
                            let cardColor = 'bg-white border-slate-200 hover:bg-slate-50';

                            if (isPresent) {
                                statusLabel = 'PRESENTE';
                                statusColor = 'text-green-600';
                                cardColor = 'bg-green-50 border-green-200 shadow-sm';
                            } else if (isNewLog) {
                                statusLabel = 'SIN REGISTRAR';
                                statusColor = 'text-slate-400';
                                cardColor = 'bg-slate-50 border-slate-200';
                            }

                            return (
                                <label key={s.id} className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition ${cardColor}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-6 h-6 rounded border flex items-center justify-center transition ${isPresent ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 bg-white'}`}>
                                            {isPresent && <CheckSquare size={16} />}
                                        </div>
                                        <div>
                                            <div className={`font-bold ${isPresent ? 'text-green-900' : 'text-slate-700'}`}>{s.firstName} {s.lastName}</div>
                                            <div className={`text-xs font-bold ${statusColor}`}>{statusLabel}</div>
                                        </div>
                                    </div>
                                    <input type="checkbox" className="hidden" checked={isPresent} onChange={() => togglePresent(s.id)} />
                                </label>
                            );
                        })}
                    </div>
                    <button onClick={handleSave} className={`w-full py-3 rounded-lg font-bold text-lg transition ${saved ? 'bg-green-600 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>{saved ? '¡Guardado!' : 'Guardar Asistencia'}</button>
                </>
            ) : <div className="text-center py-10 text-slate-400 bg-slate-50 rounded-lg border border-dashed">Seleccione una cohorte.</div>}
        </div>
    );
};

export default AttendanceManager;
