export const ROLES = {
    ADMIN: 'Administrador',
    TEACHER: 'Docente',
    STAFF: 'Responsable Administrativo',
    STUDENT: 'Alumno'
};

export const COURSE_TYPES = ['CFP', 'ACCFP', 'AC'];
export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const MONTHS_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// 0=Domingo, 1=Lunes, ..., 6=Sábado
export const DAYS_OF_WEEK = [
    { value: 1, label: 'Lunes' },
    { value: 2, label: 'Martes' },
    { value: 3, label: 'Miércoles' },
    { value: 4, label: 'Jueves' },
    { value: 5, label: 'Viernes' },
    { value: 6, label: 'Sábado' },
];

/**
 * Converts an internal 'yyyy-MM-dd' date string to display format 'dd/MM/yyyy'.
 * Returns the original string if parsing fails, or a fallback if value is empty.
 */
export const fmtDate = (dateStr, fallback = '—') => {
    if (!dateStr) return fallback;
    try {
        const [y, m, d] = dateStr.split('-');
        if (!y || !m || !d) return fallback;
        return `${d}/${m}/${y}`;
    } catch {
        return fallback;
    }
};
