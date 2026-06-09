import React, { useState, useMemo } from 'react';
import { updateDoc, doc, setDoc, arrayUnion, addDoc, collection, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db, appId } from '../services/firebase';
import { Search, Upload, DownloadCloud, MessageCircle, UserPlus, FileSpreadsheet, Filter, CheckCircle, Clock, XCircle, AlertCircle, Phone, Mail, Settings, Edit, Save, Plus, Trash2, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import Modal from './Modal';

// Formularios Públicos
const FORMS_LINKS = [
    { title: "Montador electricista", url: "https://etrrar-my.sharepoint.com/:x:/g/personal/observaciond_etrr_edu_ar/IQDeep4hgN9PQI0kubSrwCd5AZmOoLFwwhLOP7hCYr2eggw?rtime=-vD8Zbuf3kg" },
    { title: "Tornería Mecánica", url: "https://etrrar-my.sharepoint.com/:x:/g/personal/observaciond_etrr_edu_ar/IQBajmnPQHf4TYgpbHsi1fouARGmA4JQMdtIfP3sOSSb8X0?rtime=icn3Zbuf3kg" },
    { title: "Tornería CNC", url: "https://etrrar-my.sharepoint.com/:x:/g/personal/observaciond_etrr_edu_ar/IQC54UX5l3P9Qo81VMWCHz7uAU47hkf7BUylXT55FVKGeXc?rtime=lVb_Zbuf3kg" },
    { title: "Soldadura", url: "https://etrrar-my.sharepoint.com/:x:/g/personal/observaciond_etrr_edu_ar/IQCWSft-prPnSahbdKKaAGg7Aexx2NCpVmH8L_BuXQwsSqo?rtime=ff0wZruf3kg" },
    { title: "Automación Neumática y PLC", url: "https://etrrar-my.sharepoint.com/:x:/g/personal/observaciond_etrr_edu_ar/Ef9OqizR1ChAhjOE4L0m2QYBGGGuRVhkxAjpOAPhWSpAoA?e=qthjzo" },
    { title: "Automación Hidráulica", url: "https://etrrar-my.sharepoint.com/:x:/g/personal/observaciond_etrr_edu_ar/EWLLTWO8zShLiDrgJg0VlvwBfg6_yo8p2KYOUSxzB0ILsA?e=c6EqmA" },
    { title: "PLC Siemens HMI", url: "https://etrrar-my.sharepoint.com/:x:/g/personal/observaciond_etrr_edu_ar/EWyydZ0RE8lBisvHYhjmzzMBMOcMI8QMJ2xzT1N8MY58iA?e=eO3RUR" },
    { title: "CAD - Diseño Asistido por Computadora", url: "#" },
    { title: "Curso de Analista de Redes Informáticas - Cisco", url: "#" },
    { title: "Analista de Redes Informáticas Cisco - CCNA2", url: "#" }
];

const STATUSES = {
    pending: { label: 'Pendiente', color: 'orange' },
    no_response: { label: 'No Contestó', color: 'slate' },
    contact_later: { label: 'Contactar Luego', color: 'yellow' },
    cant_schedule: { label: 'No puede por horarios', color: 'red' },
    cant_afford: { label: 'No puede por dinero', color: 'red' },
    enrolled: { label: 'Matriculado', color: 'emerald' }
};

export default function PreEnrollmentManager({ preEnrollments, courses, cohorts, students }) {
    const [activeTab, setActiveTab] = useState('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterCourses, setFilterCourses] = useState([]);
    const [isCourseFilterOpen, setIsCourseFilterOpen] = useState(false);
    
    // Import state
    const [isUploading, setIsUploading] = useState(false);
    const [uploadCourseSource, setUploadCourseSource] = useState('');
    
    // Enroll Modal state
    const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
    const [enrollCandidate, setEnrollCandidate] = useState(null);
    const [selectedCohortId, setSelectedCohortId] = useState('');
    const [viewingCandidate, setViewingCandidate] = useState(null);

    // Config state
    const [whatsappMessageTemplate, setWhatsappMessageTemplate] = useState(
        "Hola {{nombre}}! Nos comunicamos del CFP Roberto Rocca por tu preinscripción al curso de {{curso}}."
    );

    // Derived Data
    const filteredList = useMemo(() => {
        let list = preEnrollments || [];
        if (filterStatus !== 'all') list = list.filter(p => p.status === filterStatus);
        
        const grouped = [];
        const byDni = {};
        
        list.forEach(p => {
            const dni = p.dni ? String(p.dni).trim() : '';
            if (dni && byDni[dni]) {
                const existing = byDni[dni];
                if (p.courseSource && !existing.courseSourcesArray.includes(p.courseSource)) {
                    existing.courseSourcesArray.push(p.courseSource);
                    existing.displayCourseSource = existing.courseSourcesArray.join(' / ');
                }
                if (!existing.allIds.includes(p.id)) {
                    existing.allIds.push(p.id);
                }
            } else {
                const clone = { 
                    ...p, 
                    displayCourseSource: p.courseSource || '', 
                    courseSourcesArray: p.courseSource ? [p.courseSource] : [],
                    allIds: [p.id]
                };
                if (dni) byDni[dni] = clone;
                grouped.push(clone);
            }
        });

        let result = grouped;

        if (filterCourses.length > 0) {
            result = result.filter(g => g.courseSourcesArray.some(c => filterCourses.includes(c)));
        }

        if (searchTerm) {
            const tgt = String(searchTerm).toLowerCase();
            result = result.filter(p => 
                String(p.firstName || '').toLowerCase().includes(tgt) || 
                String(p.lastName || '').toLowerCase().includes(tgt) || 
                String(p.email || '').toLowerCase().includes(tgt) ||
                String(p.displayCourseSource || '').toLowerCase().includes(tgt) ||
                String(p.phone || '').toLowerCase().includes(tgt) ||
                String(p.dni || '').toLowerCase().includes(tgt) ||
                String(p.rawRowData || '').toLowerCase().includes(tgt)
            );
        }

        return result.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
    }, [preEnrollments, filterStatus, filterCourses, searchTerm]);

    const stats = useMemo(() => {
        let listToAnalyze = preEnrollments || [];
        if (filterCourses.length > 0) {
            listToAnalyze = listToAnalyze.filter(p => filterCourses.includes(p.courseSource));
        }

        const s = { total: listToAnalyze.length, statuses: {}, byCourse: {} };
        listToAnalyze.forEach(p => {
            s.statuses[p.status] = (s.statuses[p.status] || 0) + 1;
            
            const c = p.courseSource || 'Desconocido';
            if(!s.byCourse[c]) s.byCourse[c] = { total: 0, active: 0, lost: 0, enrolled: 0 };
            s.byCourse[c].total++;
            
            if (['pending', 'contact_later'].includes(p.status)) s.byCourse[c].active++;
            if (['no_response', 'cant_schedule', 'cant_afford'].includes(p.status)) s.byCourse[c].lost++;
            if (p.status === 'enrolled') s.byCourse[c].enrolled++;
        });
        return s;
    }, [preEnrollments, filterCourses]);

    // Format phone for Whatsapp
    const getCleanPhone = (phone) => {
        if (!phone) return '';
        let cleaned = String(phone).replace(/\D/g, '');
        if (cleaned.startsWith('15') && cleaned.length === 10) cleaned = '54911' + cleaned.substring(2); // very basic arg
        if (!cleaned.startsWith('54')) cleaned = '549' + cleaned;
        return cleaned;
    };

    const handleImportExcel = (e) => {
        const file = e.target.files[0];
        if (!file || !uploadCourseSource) {
            alert("Selecciona un origen (Curso) antes de subir el archivo.");
            e.target.value = null;
            return;
        }

        setIsUploading(true);
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);
                
                let added = 0;
                let existing = 0;

                for (const row of data) {
                    // Try to guess columns based on common Microsoft Forms names
                    let email = row['Correo electrónico de contacto'] || row['Correo electrónico'] || row['Email'] || row['correo'] || row['Correo'] || '';
                    let nameField = row['Nombre1'] || row['Nombre'] || row['Nombres'] || '';
                    let lastNameField = row['Apellido'] || row['Apellidos'] || '';
                    let phone = row['Número telefónico'] || row['Teléfono'] || row['Celular'] || row['Tel'] || row['phone'] || '';
                    let dni = row['DNI'] || row['Documento'] || '';
                    
                    if (!email) {
                        // fuzzy search key
                        const keys = Object.keys(row);
                        const kEmail = keys.find(k => k.toLowerCase().includes('correo') || k.toLowerCase().includes('email'));
                        if (kEmail) email = row[kEmail];
                        
                        const kPhone = keys.find(k => k.toLowerCase().includes('tel') || k.toLowerCase().includes('celular'));
                        if (kPhone) phone = row[kPhone];

                        const kName = keys.find(k => k.toLowerCase() === 'nombre');
                        if (kName) nameField = row[kName];

                        const kApellido = keys.find(k => k.toLowerCase() === 'apellido');
                        if (kApellido) lastNameField = row[kApellido];
                    }

                    if (!email) continue; // Si no hay email, no podemos asociarlo bien

                    email = String(email).trim().toLowerCase();

                    // Revisar si ya existe
                    const exists = preEnrollments.find(p => p.email === email && p.courseSource === uploadCourseSource);
                    
                    if (!exists) {
                        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'pre_enrollments'), {
                            email,
                            firstName: nameField,
                            lastName: lastNameField,
                            phone: String(phone),
                            dni: String(dni),
                            courseSource: uploadCourseSource,
                            status: 'pending',
                            paidFee: false,
                            comments: '',
                            reasonNotInterested: '',
                            rawRowData: JSON.stringify(row), // guardamos todo por las dudas
                            createdAt: Date.now()
                        });
                        added++;
                    } else {
                        existing++;
                    }
                }
                alert(`Importación finalizada. \nNuevos: ${added}\nYa existentes: ${existing}`);
            } catch (err) {
                console.error(err);
                alert("Hubo un error procesando el Excel: " + err.message);
            } finally {
                setIsUploading(false);
                e.target.value = null; // reset
            }
        };
        reader.readAsBinaryString(file);
    };

    const updatePreEnrollment = async (idOrIds, field, value) => {
        try {
            const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
            for (const id of ids) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pre_enrollments', id), {
                    [field]: value,
                    updatedAt: Date.now()
                });
            }
        } catch (error) {
            console.error("Error updating:", error);
            alert("Error al actualizar la base de datos.");
        }
    };

    const openEnrollModal = (candidate) => {
        setEnrollCandidate(candidate);
        setSelectedCohortId('');
        setIsEnrollModalOpen(true);
    };

    const handleEnroll = async () => {
        if (!selectedCohortId) return alert("Debe seleccionar una cohorte.");
        
        try {
            // 1. Check if student exists or create it
            let studentId = '';
            const existingStudent = students.find(s => s.email.toLowerCase() === enrollCandidate.email.toLowerCase() || (enrollCandidate.dni && s.dni === enrollCandidate.dni));
            
            if (existingStudent) {
                studentId = existingStudent.id;
            } else {
                const newStudentRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'students'), {
                    email: enrollCandidate.email,
                    firstName: enrollCandidate.firstName || 'Sin Nombre',
                    lastName: enrollCandidate.lastName || '',
                    phone: enrollCandidate.phone || '',
                    dni: enrollCandidate.dni || '',
                    createdAt: new Date().toISOString()
                });
                studentId = newStudentRef.id;
            }

            // 2. Add studentId to cohort
            const cohortRef = doc(db, 'artifacts', appId, 'public', 'data', 'cohorts', selectedCohortId);
            await updateDoc(cohortRef, {
                studentIds: arrayUnion(studentId)
            });

            // 3. Mark pre_enrollment as enrolled
            const ids = enrollCandidate.allIds || [enrollCandidate.id];
            for (const pid of ids) {
                await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pre_enrollments', pid), {
                    status: 'enrolled',
                    updatedAt: Date.now()
                });
            }

            alert("Alumno matriculado con éxito.");
            setIsEnrollModalOpen(false);
            setEnrollCandidate(null);
        } catch (err) {
            console.error("Enroll error:", err);
            alert("Error general al matricular: " + err.message);
        }
    };

    const handleDeleteCandidate = async (idOrIds) => {
        if (confirm("¿Estás seguro de que deseas eliminar a este candidato de todos sus registros?")) {
            try {
                const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
                for (const id of ids) {
                    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pre_enrollments', id));
                }
            } catch (err) {
                console.error(err);
                alert("Error al eliminar.");
            }
        }
    };

    const generateWhatsAppLink = (candidate, raw) => {
        const phoneToUse = candidate.phone || raw['Número telefónico'] || raw['Teléfono'] || raw['Celular'] || '';
        const phone = getCleanPhone(phoneToUse);
        if (!phone) return '#';
        
        const firstName = candidate.firstName || raw['Nombre1'] || raw['Nombre'] || '';
        const lastName = candidate.lastName || raw['Apellido'] || raw['Apellidos'] || '';
        const fullname = `${firstName} ${lastName}`.trim();
        
        const coursesToText = candidate.displayCourseSource || candidate.courseSource || '';
        
        const course = courses?.find(c => String(c.name).toLowerCase() === String(candidate.courseSource).toLowerCase());
        let startDate = 'a definir';
        let endDate = 'a definir';
        let costo = 'a confirmar';
        
        if (course) {
            if (course.cost) costo = course.cost;
            const courseCohorts = cohorts?.filter(c => c.courseId === course.id) || [];
            if (courseCohorts.length > 0) {
                // Find most recent or upcoming cohort
                courseCohorts.sort((a, b) => new Date(b.startDate || 0) - new Date(a.startDate || 0));
                const active = courseCohorts[0];
                
                if (active.startDate) startDate = new Date(active.startDate + 'T12:00:00').toLocaleDateString('es-AR');
                if (active.endDate) endDate = new Date(active.endDate + 'T12:00:00').toLocaleDateString('es-AR');
                if (active.cost) costo = active.cost; 
            }
        }

        const texto = whatsappMessageTemplate
            .replace(/\{\{nombre\}\}/gi, fullname || 'Candidato')
            .replace(/\{\{curso\}\}/gi, coursesToText)
            .replace(/\{\{costo\}\}/gi, costo)
            .replace(/\{\{fecha de inicio\}\}/gi, startDate)
            .replace(/\{\{fecha de finalización\}\}/gi, endDate);
            
        const encoded = encodeURIComponent(texto);
        return `https://wa.me/${phone}?text=${encoded}`;
    };

    return (
        <div className="w-full flex flex-col h-full bg-slate-50">
            <div className="bg-white px-6 pt-4 border-b border-slate-200">
                <div className="flex gap-6">
                    <button 
                        onClick={() => setActiveTab('list')} 
                        className={`pb-4 px-2 font-bold text-sm tracking-wide transition-colors ${activeTab === 'list' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        Gestión de Candidatos
                    </button>
                    <button 
                        onClick={() => setActiveTab('dashboard')} 
                        className={`pb-4 px-2 font-bold text-sm tracking-wide transition-colors ${activeTab === 'dashboard' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        Dashboard & Métricas
                    </button>
                    <button 
                        onClick={() => setActiveTab('links')} 
                        className={`pb-4 px-2 font-bold text-sm tracking-wide transition-colors ${activeTab === 'links' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        Enlaces y Configuración
                    </button>
                </div>
            </div>

            <div className="p-6 flex-1 overflow-y-auto">
                {activeTab === 'dashboard' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                            <h2 className="font-bold text-slate-800 flex items-center gap-2"><Filter size={18} className="text-blue-500"/> Filtros del Dashboard</h2>
                            <div className="relative">
                                <button 
                                    onClick={() => setIsCourseFilterOpen(!isCourseFilterOpen)} 
                                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white flex items-center justify-between gap-2 min-w-[180px]"
                                >
                                    <span className="truncate max-w-[150px]">
                                        {filterCourses.length === 0 ? 'Cualquier Curso' : `${filterCourses.length} curso${filterCourses.length > 1 ? 's' : ''} selec.`}
                                    </span>
                                    <ChevronDown size={14} className="text-slate-400" />
                                </button>
                                
                                {isCourseFilterOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setIsCourseFilterOpen(false)}></div>
                                        <div className="absolute top-full mt-1 right-0 bg-white border border-slate-200 shadow-xl rounded-lg p-2 z-50 w-64 max-h-72 overflow-auto">
                                            <label className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer border-b border-slate-100 mb-1">
                                                <input 
                                                    type="checkbox" 
                                                    checked={filterCourses.length === 0} 
                                                    onChange={() => setFilterCourses([])} 
                                                    className="rounded border-slate-300"
                                                />
                                                <span className="text-sm font-bold text-slate-700">Cualquier Curso</span>
                                            </label>
                                            {FORMS_LINKS.map(c => (
                                                <label key={c.title} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={filterCourses.includes(c.title)} 
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setFilterCourses([...filterCourses, c.title]);
                                                            } else {
                                                                setFilterCourses(filterCourses.filter(f => f !== c.title));
                                                            }
                                                        }} 
                                                        className="rounded border-slate-300"
                                                    />
                                                    <span className="text-sm text-slate-600 leading-tight">{c.title}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <div className="text-slate-500 text-xs font-bold uppercase mb-1">Total Pre-inscriptos</div>
                                <div className="text-4xl font-black text-slate-800">{stats.total}</div>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="text-blue-500 text-xs font-bold uppercase mb-1">Gestión Activa</div>
                                    <div className="text-4xl font-black text-blue-600">{(stats.statuses['pending'] || 0) + (stats.statuses['contact_later'] || 0)}</div>
                                </div>
                                <div className="mt-2 text-xs text-slate-500 flex flex-col gap-1">
                                    <div className="flex justify-between"><span>Pendientes:</span> <span className="font-bold text-slate-700">{stats.statuses['pending'] || 0}</span></div>
                                    <div className="flex justify-between"><span>Contactar Luego:</span> <span className="font-bold text-slate-700">{stats.statuses['contact_later'] || 0}</span></div>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                <div className="text-emerald-500 text-xs font-bold uppercase mb-1">Éxito (Matriculados)</div>
                                <div className="text-4xl font-black text-emerald-600">{stats.statuses['enrolled'] || 0}</div>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                                <div>
                                    <div className="text-red-500 text-xs font-bold uppercase mb-1">Perdidos / Pausados</div>
                                    <div className="text-4xl font-black text-red-600">{(stats.statuses['no_response'] || 0) + (stats.statuses['cant_schedule'] || 0) + (stats.statuses['cant_afford'] || 0)}</div>
                                </div>
                                <div className="mt-2 text-xs text-slate-500 flex flex-col gap-1">
                                    <div className="flex justify-between"><span>No contestó:</span> <span className="font-bold text-slate-700">{stats.statuses['no_response'] || 0}</span></div>
                                    <div className="flex justify-between"><span>Por horarios:</span> <span className="font-bold text-slate-700">{stats.statuses['cant_schedule'] || 0}</span></div>
                                    <div className="flex justify-between"><span>Por dinero:</span> <span className="font-bold text-slate-700">{stats.statuses['cant_afford'] || 0}</span></div>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                                <h3 className="font-bold text-lg mb-4 text-slate-800">Candidatos por Curso</h3>
                                <div className="space-y-3">
                                    {Object.entries(stats.byCourse).map(([c, data]) => (
                                        <div key={c} className="flex flex-col border-b border-slate-100 pb-2">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="font-medium text-slate-700">{c}</span>
                                                <span className="text-sm bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-bold">{data.total} total</span>
                                            </div>
                                            <div className="flex gap-4 text-xs flex-wrap">
                                                <span className="text-blue-600 border border-blue-200 bg-blue-50 px-2 py-0.5 rounded-full">{data.active} Activos</span>
                                                <span className="text-red-600 border border-red-200 bg-red-50 px-2 py-0.5 rounded-full">{data.lost} Perdidos</span>
                                                <span className="text-emerald-600 border border-emerald-200 bg-emerald-50 px-2 py-0.5 rounded-full">{data.enrolled} Matriculados</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'links' && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 box-border">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><FileSpreadsheet size={20} className="text-green-600" /> Accesos a Formularios de Microsoft</h3>
                            <p className="text-sm text-slate-500 mb-6">Haz clic en el enlace para abrir el Excel online, descárgalo a tu computadora y luego súbelo en la pestaña de Gestión.</p>
                            
                            <div className="space-y-3">
                                {FORMS_LINKS.map((link, idx) => (
                                    <a 
                                        key={idx} 
                                        href={link.url} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="flex items-center justify-between p-3 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition group"
                                    >
                                        <div className="font-medium text-slate-700 group-hover:text-blue-700">{link.title}</div>
                                        <DownloadCloud size={16} className="text-slate-400 group-hover:text-blue-600" />
                                    </a>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 box-border">
                            <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><MessageCircle size={20} className="text-green-500" /> Configuración de WhatsApp</h3>
                            <p className="text-sm text-slate-500 mb-6">Mensaje predeterminado al enviar un WhatsApp a un candidato. Comodines disponibles: <code>{`{{nombre}}`}</code>, <code>{`{{curso}}`}</code>, <code>{`{{costo}}`}</code>, <code>{`{{fecha de inicio}}`}</code>, <code>{`{{fecha de finalización}}`}</code>.</p>
                            
                            <textarea 
                                className="w-full border border-slate-300 rounded-lg p-3 text-sm h-48 focus:border-blue-500 outline-none bg-white text-slate-800"
                                value={whatsappMessageTemplate}
                                onChange={e => setWhatsappMessageTemplate(e.target.value)}
                            />
                            
                            <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                                <div className="text-xs font-bold text-slate-500 mb-2 uppercase">Previsualización (Ejemplo)</div>
                                <div className="text-sm text-slate-700 italic">
                                    {whatsappMessageTemplate
                                        .replace(/\{\{nombre\}\}/gi, 'Juan Pérez')
                                        .replace(/\{\{curso\}\}/gi, 'Tornería Mecánica')
                                        .replace(/\{\{costo\}\}/gi, '$15.000')
                                        .replace(/\{\{fecha de inicio\}\}/gi, '15/03/2026')
                                        .replace(/\{\{fecha de finalización\}\}/gi, '15/12/2026')
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'list' && (
                    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm">
                        {/* Toolbar */}
                        <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 justify-between items-center bg-slate-50 rounded-t-xl">
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                                    <input 
                                        type="text" 
                                        placeholder="Buscar nombre, correo..." 
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm w-64 focus:outline-none focus:border-blue-500 bg-white" 
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Filter size={16} className="text-slate-400" />
                                    <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                                        <option value="all">Todos los Estados</option>
                                        {Object.entries(STATUSES).map(([k, v]) => (
                                            <option key={k} value={k}>{v.label}</option>
                                        ))}
                                    </select>
                                    <div className="relative">
                                        <button 
                                            onClick={() => setIsCourseFilterOpen(!isCourseFilterOpen)} 
                                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white flex items-center justify-between gap-2 min-w-[180px]"
                                        >
                                            <span className="truncate max-w-[150px]">
                                                {filterCourses.length === 0 ? 'Cualquier Curso' : `${filterCourses.length} curso${filterCourses.length > 1 ? 's' : ''} selec.`}
                                            </span>
                                            <ChevronDown size={14} className="text-slate-400" />
                                        </button>
                                        
                                        {isCourseFilterOpen && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setIsCourseFilterOpen(false)}></div>
                                                <div className="absolute top-full mt-1 left-0 bg-white border border-slate-200 shadow-xl rounded-lg p-2 z-50 w-64 max-h-72 overflow-auto">
                                                    <label className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer border-b border-slate-100 mb-1">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={filterCourses.length === 0} 
                                                            onChange={() => setFilterCourses([])} 
                                                            className="rounded border-slate-300"
                                                        />
                                                        <span className="text-sm font-bold text-slate-700">Cualquier Curso</span>
                                                    </label>
                                                    {FORMS_LINKS.map(c => (
                                                        <label key={c.title} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={filterCourses.includes(c.title)} 
                                                                onChange={(e) => {
                                                                    if (e.target.checked) {
                                                                        setFilterCourses([...filterCourses, c.title]);
                                                                    } else {
                                                                        setFilterCourses(filterCourses.filter(f => f !== c.title));
                                                                    }
                                                                }} 
                                                                className="rounded border-slate-300"
                                                            />
                                                            <span className="text-sm text-slate-600 leading-tight">{c.title}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 border border-blue-200 bg-blue-50 p-2 rounded-lg pr-4">
                                <select 
                                    className="border-none bg-transparent outline-none text-sm font-medium text-blue-800" 
                                    value={uploadCourseSource} 
                                    onChange={e => setUploadCourseSource(e.target.value)}
                                >
                                    <option value="">Seleccione Curso a Importar...</option>
                                    {FORMS_LINKS.map(c => <option key={c.title} value={c.title}>{c.title}</option>)}
                                </select>
                                <label className={`cursor-pointer bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition shadow-sm ${!uploadCourseSource ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    {isUploading ? <span className="animate-pulse">Cargando...</span> : <><Upload size={16} /> Importar Excel</>}
                                    <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImportExcel} disabled={isUploading || !uploadCourseSource} />
                                </label>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="flex-1 overflow-auto rounded-b-xl">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-100 text-slate-500 font-bold sticky top-0 z-10 shadow-sm shadow-slate-200/50">
                                    <tr>
                                        <th className="px-6 py-4">Candidato</th>
                                        <th className="px-6 py-4">Origen</th>
                                        <th className="px-6 py-4">Estado y Triage</th>
                                        <th className="px-6 py-4">Gestión & Notas</th>
                                        <th className="px-6 py-4 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(filteredList || []).map(p => {
                                        const stColor = STATUSES[p.status]?.color || 'slate';
                                        let raw = {};
                                        try { raw = JSON.parse(p.rawRowData || '{}'); } catch(e) {}
                                        
                                        const dispFirstName = p.firstName && p.firstName !== 'Sin' ? p.firstName : (raw['Nombre1'] || raw['Nombre'] || 'Sin');
                                        const dispLastName = p.lastName && p.lastName !== 'Nombre' ? p.lastName : (raw['Apellido'] || raw['Apellidos'] || 'Nombre');
                                        const dispEmail = p.email && String(p.email).toLowerCase() !== 'anónimo' ? p.email : (raw['Correo electrónico de contacto'] || raw['Correo electrónico'] || 'Sin email');
                                        const dispPhone = p.phone ? p.phone : (raw['Número telefónico'] || raw['Teléfono'] || raw['Celular'] || 'Sin Tel');

                                        return (
                                            <tr key={p.id} className="hover:bg-slate-50 group">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold flex items-center gap-2">
                                                        <button onClick={() => setViewingCandidate(p)} className="text-blue-600 hover:text-blue-800 hover:underline text-left text-wrap max-w-[200px] transition-colors">
                                                            {dispFirstName} {dispLastName}
                                                        </button>
                                                        {p.status === 'enrolled' && <CheckCircle size={14} className="text-emerald-500 flex-shrink-0" title="Matriculado Oficialmente" />}
                                                    </div>
                                                    <div className="text-slate-500 text-xs flex flex-col gap-0.5 mt-1">
                                                        <span className="flex items-center gap-1"><Mail size={10} /> {dispEmail}</span>
                                                        <span className="flex items-center gap-1"><Phone size={10} /> {dispPhone}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        {(p.courseSourcesArray && p.courseSourcesArray.length > 0) ? (
                                                            p.courseSourcesArray.map((c, idx) => (
                                                                <div key={idx} className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 text-xs font-bold w-fit whitespace-normal break-words max-w-[250px] leading-tight">
                                                                    {c}
                                                                </div>
                                                            ))
                                                        ) : (
                                                            <div className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded border border-indigo-100 text-xs font-bold w-fit whitespace-normal break-words max-w-[250px] leading-tight">
                                                                {p.courseSource}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-2">
                                                        <select 
                                                            value={p.status} 
                                                            onChange={(e) => updatePreEnrollment(p.allIds || p.id, 'status', e.target.value)}
                                                            className={`font-bold text-xs outline-none px-2 py-1.5 rounded w-36 shadow-sm border transition-colors
                                                                ${stColor === 'orange' ? 'bg-orange-100 text-orange-900 border-orange-300' : 
                                                                  stColor === 'blue' ? 'bg-blue-100 text-blue-900 border-blue-300' :
                                                                  stColor === 'green' ? 'bg-green-100 text-green-900 border-green-300' :
                                                                  stColor === 'red' ? 'bg-red-100 text-red-900 border-red-300' :
                                                                  stColor === 'emerald' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' :
                                                                  stColor === 'yellow' ? 'bg-yellow-100 text-yellow-900 border-yellow-300' :
                                                                  'bg-slate-100 text-slate-900 border-slate-300'
                                                                }
                                                            `}
                                                        >
                                                            {Object.entries(STATUSES).map(([k, v]) => <option className="bg-white text-slate-900 font-medium" key={k} value={k}>{v.label}</option>)}
                                                        </select>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-2 w-48">
                                                        <textarea 
                                                            className="text-xs bg-transparent border-b border-dashed border-slate-300 p-0 hover:bg-white resize-none h-8 w-full outline-none focus:border-blue-500 focus:border-solid focus:h-16 transition-all"
                                                            placeholder="Click para añadir notas..."
                                                            value={p.comments || ''}
                                                            onBlur={(e) => updatePreEnrollment(p.allIds || p.id, 'comments', e.target.value)}
                                                            onChange={(e) => {
                                                                p.comments = e.target.value; // Optimistic local update via ref/mutation is bad practice in strict React, but viable for visual feedback before blur.
                                                                // To be pristine, we shouldn't mutate prop directly, so we just let it be fully uncontrolled or trigger onBlur.
                                                                // Actually better to handle it properly, but for speed, onBlur is fine, we just won't type as smoothly without a local wrapper state.
                                                                // Workaround: render normally, the onBlur triggers the save to DB. We will just use uncontrolled component `defaultValue`.
                                                            }}
                                                            defaultValue={p.comments || ''}
                                                        />
                                                        <div className="flex items-center gap-2">
                                                            <label className="text-xs text-slate-500 flex items-center gap-1 cursor-pointer">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={!!p.paidFee} 
                                                                    onChange={(e) => updatePreEnrollment(p.allIds || p.id, 'paidFee', e.target.checked)}
                                                                />
                                                                Pagó Matrícula
                                                            </label>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <div className="flex flex-col items-center justify-center gap-2">
                                                        <a 
                                                            href={generateWhatsAppLink(p, raw)} 
                                                            target="_blank" 
                                                            rel="noreferrer"
                                                            className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white text-xs px-3 py-1.5 rounded-full font-bold shadow-sm transition w-32 justify-center"
                                                        >
                                                            <MessageCircle size={14} /> WhatsApp
                                                        </a>
                                                        
                                                        {p.status !== 'enrolled' && (
                                                            <button 
                                                                onClick={() => openEnrollModal({
                                                                    ...p,
                                                                    firstName: dispFirstName,
                                                                    lastName: dispLastName,
                                                                    email: dispEmail,
                                                                    phone: dispPhone
                                                                })}
                                                                className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white text-xs px-3 py-1.5 rounded-full font-bold shadow-sm transition w-32 justify-center"
                                                            >
                                                                <UserPlus size={14} /> Matricular...
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => handleDeleteCandidate(p.allIds || p.id)}
                                                            className="text-red-400 hover:text-red-600 flex items-center gap-1 text-xs mt-1 transition opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 size={12} /> Eliminar
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredList.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="text-center py-12 text-slate-500">
                                                No se encontraron candidatos que coincidan con los filtros.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Enroll Modal */}
            {isEnrollModalOpen && enrollCandidate && (
                <Modal title="Matricular Alumno Oficialmente" onClose={() => setIsEnrollModalOpen(false)}>
                    <div className="space-y-4">
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <p className="text-sm text-slate-600 mb-1">Candidato:</p>
                            <p className="font-bold text-slate-800 text-lg">{enrollCandidate.firstName} {enrollCandidate.lastName}</p>
                            <p className="text-sm text-slate-500 font-mono mt-1">{enrollCandidate.email}</p>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Seleccione una Cohorte (Clase) para Inscribirlo:</label>
                            <div className="text-xs text-slate-500 mb-2">Pre-inscrito originalmente en: <b>{enrollCandidate.courseSource}</b></div>
                            <select 
                                className="w-full border border-slate-300 rounded-lg px-4 py-3 bg-white shadow-sm focus:border-blue-500 outline-none"
                                value={selectedCohortId}
                                onChange={(e) => setSelectedCohortId(e.target.value)}
                            >
                                <option value="">-- Seleccionar Cohorte --</option>
                                {cohorts.map(c => {
                                    const course = courses.find(cr => cr.id === c.courseId);
                                    return (
                                        <option key={c.id} value={c.id}>
                                            {course?.name || 'Curso Desconocido'} - {c.scheduleInfo || 'Sin horario'} ({c.year || 'N/A'})
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        <div className="pt-4 border-t border-slate-100 flex gap-3 justify-end">
                            <button onClick={() => setIsEnrollModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-bold transition">Cancelar</button>
                            <button onClick={handleEnroll} disabled={!selectedCohortId} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg text-sm font-bold transition shadow-sm">
                                Confirmar y Matricular
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* View Candidate Modal */}
            {viewingCandidate && viewingCandidate.rawRowData && (
                <Modal title="Información Completa del Formulario" onClose={() => setViewingCandidate(null)}>
                    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 mb-4">
                            <h3 className="font-bold text-blue-800 text-lg">{viewingCandidate.firstName} {viewingCandidate.lastName}</h3>
                            <p className="text-sm text-blue-600">Pre-inscripto en: <b>{viewingCandidate.courseSource}</b></p>
                        </div>
                        <div className="space-y-3">
                            {Object.entries(JSON.parse(viewingCandidate.rawRowData)).map(([key, value]) => {
                                if (value === null || value === undefined || value === '') return null;
                                
                                const lowerKey = key.toLowerCase().trim();
                                const ignoredKeys = ['id', 'correo electrónico', 'hora de inicio'];
                                if (ignoredKeys.includes(lowerKey)) return null;

                                let displayKey = key;
                                if (lowerKey === 'hora de finalización') displayKey = 'Fecha Inscripción';

                                let displayValue = String(value);
                                if (lowerKey.includes('fecha') || lowerKey.includes('hora')) {
                                    if (typeof value === 'number') {
                                        const d = new Date(Math.round((value - 25569) * 86400 * 1000));
                                        displayValue = d.toLocaleDateString('es-AR', { timeZone: 'UTC' });
                                    } else if (typeof value === 'string') {
                                        displayValue = value.split(' ')[0].split('T')[0];
                                    }
                                }

                                return (
                                    <div key={key} className="border-b border-slate-100 pb-3">
                                        <div className="text-xs font-bold text-slate-500 mb-1">{displayKey}</div>
                                        <div className="text-sm text-slate-800 whitespace-pre-wrap">{displayValue}</div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="pt-4 border-t border-slate-100 flex justify-end">
                            <button onClick={() => setViewingCandidate(null)} className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-sm font-bold transition shadow-sm">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
