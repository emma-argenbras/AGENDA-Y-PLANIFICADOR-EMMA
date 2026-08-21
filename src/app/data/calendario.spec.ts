/**
 * calendario.spec.ts — Google contesta 403 por dos motivos muy distintos.
 *
 * Uno se arregla en la consola de Google (la API apagada) y el otro desde el
 * teléfono (el permiso sin tildar). Con el mismo número y sin explicación, el
 * usuario queda adivinando entre las dos.
 */

import { describe, expect, it } from 'vitest';
import { explicar } from './calendario';

const API_APAGADA = JSON.stringify({
  error: {
    code: 403,
    message: 'Google Calendar API has not been used in project 162261027097 before or it is disabled.',
    errors: [{ reason: 'accessNotConfigured' }],
    status: 'PERMISSION_DENIED',
  },
});

const SIN_PERMISO = JSON.stringify({
  error: {
    code: 403,
    message: 'Request had insufficient authentication scopes.',
    details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }],
  },
});

describe('qué hacer con cada respuesta de Calendar', () => {
  it('la API apagada manda a la consola de Google', () => {
    const t = explicar(403, API_APAGADA);
    expect(t).toContain('Habilitar');
    expect(t).toContain('Google Calendar API');
    expect(t).not.toContain('Desconectar');
  });

  it('el permiso sin tildar manda a Ajustes, no a la consola', () => {
    const t = explicar(403, SIN_PERMISO);
    expect(t).toContain('Desconectar');
    expect(t).not.toContain('console.cloud');
  });

  it('un 403 sin pistas no inventa una causa, pero sugiere la barata primero', () => {
    const t = explicar(403, '');
    expect(t).toContain('Ajustes');
  });

  it('401 es el permiso vencido: se vuelve a conectar y listo', () => {
    expect(explicar(401, '')).toContain('venció');
  });

  it('un problema de Google no se disfraza de problema tuyo', () => {
    expect(explicar(503, '')).toContain('Google está con problemas');
  });

  it('lo que no se reconoce se dice tal cual, sin adivinar', () => {
    expect(explicar(418, 'raro')).toBe('Calendar respondió 418.');
  });
});
