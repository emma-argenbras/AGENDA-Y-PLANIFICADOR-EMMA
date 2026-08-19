/** fechas.ts — Todo en hora local de Concordia, formato YYYY-MM-DD. */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function hoyISO(d: Date = new Date()): string {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function sumarDias(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return hoyISO(d);
}

/** Lunes de la semana de `iso`. */
export function inicioSemana(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return sumarDias(iso, -((d.getDay() + 6) % 7));
}

export function diasSemana(lunesISO: string): string[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunesISO, i));
}

export function fechaLarga(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

export function fechaCorta(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function diaCorto(iso: string): string {
  return (DIAS[new Date(iso + 'T12:00:00').getDay()] ?? '').slice(0, 3);
}

export function mesLargo(mes: string): string {
  const [a, m] = mes.split('-');
  return `${MESES[Number(m) - 1]} ${a}`;
}

export function esFinDeSemana(iso: string): boolean {
  const d = new Date(iso + 'T12:00:00').getDay();
  return d === 0 || d === 6;
}

export function diasEntre(desdeISO: string, hastaISO: string): number {
  return Math.round((Date.parse(hastaISO + 'T00:00:00') - Date.parse(desdeISO + 'T00:00:00')) / 86400000);
}
