import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'hoy' },
  { path: 'hoy', title: 'Hoy', loadComponent: () => import('./vistas/hoy/hoy').then(m => m.Hoy) },
  { path: 'pendientes', title: 'Pendientes', loadComponent: () => import('./vistas/pendientes/pendientes').then(m => m.Pendientes) },
  { path: 'semana', title: 'Semana', loadComponent: () => import('./vistas/semana/semana').then(m => m.Semana) },
  { path: 'prueba', title: 'Prueba Luciana', loadComponent: () => import('./vistas/prueba/prueba').then(m => m.Prueba) },
  { path: 'actas', title: 'Actas', loadComponent: () => import('./vistas/actas/actas').then(m => m.Actas) },
  { path: 'docs', title: 'Documentos', loadComponent: () => import('./vistas/docs/docs').then(m => m.Docs) },
  { path: 'delegar', title: 'Para delegar', loadComponent: () => import('./vistas/delegar/delegar').then(m => m.Delegar) },
  { path: 'reglas', title: 'Ficha de Rol', loadComponent: () => import('./vistas/reglas/reglas').then(m => m.Reglas) },
  { path: 'indicadores', title: 'Indicadores', loadComponent: () => import('./vistas/indicadores/indicadores').then(m => m.Indicadores) },
  { path: 'ayuda', title: 'Cómo se usa', loadComponent: () => import('./vistas/ayuda/ayuda').then(m => m.Ayuda) },
  { path: 'ajustes', title: 'Ajustes', loadComponent: () => import('./vistas/ajustes/ajustes').then(m => m.Ajustes) },
  { path: '**', redirectTo: 'hoy' },
];
