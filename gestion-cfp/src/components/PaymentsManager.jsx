import React, { useState } from 'react';
import { updateDoc, setDoc, doc } from 'firebase/firestore';
import { DollarSign, FileSpreadsheet, Printer, Search } from 'lucide-react';
import { db, appId } from '../services/firebase';
import { MONTHS } from '../constants';

const exportToCSV = (filename, rows) => {
    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const handlePrint = () => {
    window.print();
};

const PaymentsManager = ({ cohorts, students, payments, courses }) => {
    const [activeView, setActiveView] = useState('cohort');
    const [selectedCohortId, setSelectedCohortId] = useState('');
    const [studentSearch, setStudentSearch] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState(null);

    const selectedCohort = cohorts.find(c => c.id === selectedCohortId);
    const enrolledStudents = selectedCohort ? students.filter(s => selectedCohort.studentIds?.includes(s.id)) : [];

    const togglePayment = async (studentId, cohortId, month) => {
        if (!cohortId) return;
        const year = new Date().getFullYear();
        const docId = `${cohortId}_${studentId}_${month}_${year}`;
        const existing = payments.find(p => p.studentId === studentId && p.cohortId === cohortId && p.month === month);
        if (existing) { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', existing.id), { status: existing.status === 'paid' ? 'pending' : 'paid' }); }
        else { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', docId), { studentId, cohortId, month, year, status: 'paid' }); }
    };

    const getStatus = (studentId, cohortId, month) => {
        const p = payments.find(x => x.studentId === studentId && x.cohortId === cohortId && x.month === month);
        return p ? p.status : 'none';
    };

    const handleExportDebt = () => {
        const rows = [["Alumno", ...MONTHS.slice(0, 6)]];
        enrolledStudents.forEach(s => {
            const row = [s.firstName + ' ' + s.lastName];
            MONTHS.slice(0, 6).forEach(m => {
                row.push(getStatus(s.id, selectedCohortId, m) === 'paid' ? 'PAGO' : 'DEUDA');
            });
            rows.push(row);
        });
        exportToCSV("Estado_Pagos.csv", rows);
    };

    const filteredStudents = students.filter(s => (s.firstName + ' ' + s.lastName).toLowerCase().includes(studentSearch.toLowerCase()) || s.dni.includes(studentSearch));
    const selectedStudent = students.find(s => s.id === selectedStudentId);
    const studentCohorts = selectedStudent ? cohorts.filter(c => c.studentIds?.includes(selectedStudent.id)) : [];

    return (
        <div className="space-y-6 w-full">
            <div className="flex gap-4 border-b border-slate-200 pb-4 no-print">
                <button onClick={() => setActiveView('cohort')} className={`px-4 py-2 rounded-lg text-sm font-bold ${activeView === 'cohort' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Ver por Cohorte</button>
                <button onClick={() => setActiveView('student')} className={`px-4 py-2 rounded-lg text-sm font-bold ${activeView === 'student' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>Ver por Alumno</button>
            </div>

            {activeView === 'cohort' ? (
                <div className="space-y-6">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4 no-print"><DollarSign className="text-green-600" size={24} /><select className="flex-1 p-2 bg-transparent font-bold text-lg outline-none" value={selectedCohortId} onChange={e => setSelectedCohortId(e.target.value)}><option value="">Seleccione Cohorte...</option>{cohorts.map(c => <option key={c.id} value={c.id}>{courses.find(x => x.id === c.courseId)?.name} (Inicia: {c.startDate})</option>)}</select>{selectedCohortId && (<div className="flex gap-2"><button onClick={handleExportDebt} className="p-2 text-green-700 bg-green-50 rounded hover:bg-green-100"><FileSpreadsheet size={20} /></button><button onClick={handlePrint} className="p-2 text-slate-700 bg-slate-100 rounded hover:bg-slate-200"><Printer size={20} /></button></div>)}</div>
                    {selectedCohortId && (<div className="bg-white rounded-xl shadow border border-slate-200 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-500"><th className="p-4 text-left w-48 sticky left-0 bg-slate-50 z-10">Alumno</th>{MONTHS.slice(0, 6).map(m => <th key={m} className="p-4 text-center w-24">{m.substring(0, 3)}</th>)}</tr></thead><tbody>{enrolledStudents.map(s => (<tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="p-4 font-medium text-slate-800 sticky left-0 bg-white z-10">{s.firstName} {s.lastName}</td>{MONTHS.slice(0, 6).map(m => { const status = getStatus(s.id, selectedCohortId, m); return (<td key={m} className="p-2 text-center"><button onClick={() => togglePayment(s.id, selectedCohortId, m)} className={`w-full py-1.5 rounded text-xs font-bold transition-all ${status === 'paid' ? 'bg-green-500 text-white' : status === 'pending' ? 'bg-red-500 text-white' : 'bg-slate-50 text-slate-300'}`}>{status === 'paid' ? 'PAGO' : status === 'pending' ? 'DEUDA' : '-'}</button></td>); })}</tr>))}</tbody></table></div>)}
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm no-print"><div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={18} /><input type="text" placeholder="Buscar alumno..." className="pl-10 pr-4 py-2 border rounded-lg text-sm w-full focus:outline-none focus:border-blue-500" value={studentSearch} onChange={(e) => { setStudentSearch(e.target.value); if (selectedStudentId) setSelectedStudentId(null); }} />{studentSearch && !selectedStudentId && (<div className="absolute z-10 mt-1 w-full bg-white border shadow-lg rounded-lg max-h-60 overflow-y-auto">{filteredStudents.map(s => (<div key={s.id} onClick={() => { setSelectedStudentId(s.id); setStudentSearch(s.firstName + ' ' + s.lastName); }} className="p-3 hover:bg-slate-50 cursor-pointer border-b last:border-0"><div className="font-bold text-slate-800">{s.firstName} {s.lastName}</div><div className="text-xs text-slate-500">DNI: {s.dni}</div></div>))}</div>)}</div></div>
                    {selectedStudent && (<div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6"><div className="flex justify-between items-start mb-6 pb-6 border-b border-slate-100"><div><h3 className="text-2xl font-bold text-slate-800">{selectedStudent.firstName} {selectedStudent.lastName}</h3><p className="text-slate-500">DNI: {selectedStudent.dni}</p></div><button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 no-print"><Printer size={18} /> Imprimir Informe</button></div><h4 className="font-bold text-lg text-slate-700 mb-4">Historial</h4>{studentCohorts.length > 0 ? (<div className="space-y-8">{studentCohorts.map(cohort => { const course = courses.find(c => c.id === cohort.courseId); return (<div key={cohort.id} className="border rounded-lg overflow-hidden"><div className="bg-slate-50 p-3 font-bold text-slate-700 border-b">{course?.name} <span className="font-normal text-slate-500 text-xs ml-2">({cohort.startDate})</span></div><div className="grid grid-cols-6 divide-x divide-slate-100">{MONTHS.slice(0, 6).map(m => { const status = getStatus(selectedStudent.id, cohort.id, m); return (<div key={m} className="p-3 text-center"><div className="text-xs text-slate-400 mb-1 uppercase font-bold">{m.substring(0, 3)}</div><div className={`text-xs font-bold px-2 py-1 rounded ${status === 'paid' ? 'bg-green-100 text-green-700' : status === 'pending' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-400'}`}>{status === 'paid' ? 'PAGO' : status === 'pending' ? 'DEUDA' : '-'}</div></div>); })}</div></div>); })}</div>) : <p className="text-slate-400 italic">Este alumno no está inscripto en ninguna cohorte.</p>}</div>)}
                </div>
            )}
        </div>
    );
};

export default PaymentsManager;
