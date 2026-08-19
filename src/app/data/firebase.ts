/**
 * firebase.ts — Conexión con Firebase: se carga sólo si hay configuración.
 *
 * La config de Firebase (apiKey, projectId…) NO es un secreto: viaja en
 * cualquier app web y lo que protege los datos son las reglas de Firestore, que
 * están en firestore.rules y atan cada documento a tu UID.
 *
 * Se puede poner de dos formas:
 *  1. En src/environments/environment.ts, versionada (queda en el build).
 *  2. Pegándola en Ajustes, que la guarda en este dispositivo.
 * La segunda gana, para poder probar sin recompilar.
 */

import { Injectable, computed, signal } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { environment } from '../../environments/environment';

export interface ConfigFirebase {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  vapidKey?: string;
}

const CLAVE_CONFIG = 'emma-planner:firebase';

export type EstadoNube = 'sin-config' | 'desconectado' | 'conectando' | 'conectado' | 'error';

@Injectable({ providedIn: 'root' })
export class Firebase {
  readonly estado = signal<EstadoNube>('sin-config');
  readonly usuario = signal<User | null>(null);
  readonly error = signal<string | null>(null);
  readonly config = signal<ConfigFirebase | null>(leerConfig());
  readonly hayConfig = computed(() => this.config() !== null);

  #app: FirebaseApp | null = null;
  #auth: Auth | null = null;
  #db: Firestore | null = null;
  #arranque: Promise<void> | null = null;

  constructor() {
    if (this.config()) { this.estado.set('desconectado'); void this.iniciar(); }
  }

  guardarConfig(texto: string): ConfigFirebase {
    const cfg = parsearConfig(texto);
    localStorage.setItem(CLAVE_CONFIG, JSON.stringify(cfg));
    this.config.set(cfg);
    location.reload();   // la SDK de Firebase se inicializa una sola vez por sesión
    return cfg;
  }

  olvidarConfig(): void {
    localStorage.removeItem(CLAVE_CONFIG);
    location.reload();
  }

  /** Carga la SDK y escucha la sesión. Se llama solo; es idempotente. */
  iniciar(): Promise<void> {
    this.#arranque ??= this.#iniciar();
    return this.#arranque;
  }

  async #iniciar(): Promise<void> {
    const cfg = this.config();
    if (!cfg) return;
    this.estado.set('conectando');
    try {
      const [{ initializeApp }, auth, firestore] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      this.#app = initializeApp(cfg);
      this.#auth = auth.getAuth(this.#app);
      // Caché offline con varias pestañas: la app tiene que seguir andando sin señal.
      this.#db = firestore.initializeFirestore(this.#app, {
        localCache: firestore.persistentLocalCache({
          tabManager: firestore.persistentMultipleTabManager(),
        }),
      });
      auth.onAuthStateChanged(this.#auth, u => {
        this.usuario.set(u);
        this.estado.set(u ? 'conectado' : 'desconectado');
      });
    } catch (e) {
      this.estado.set('error');
      this.error.set(mensaje(e));
    }
  }

  async entrar(): Promise<void> {
    await this.iniciar();
    const auth = await import('firebase/auth');
    if (!this.#auth) throw new Error('Firebase no está configurado.');
    const proveedor = new auth.GoogleAuthProvider();
    proveedor.setCustomParameters({ prompt: 'select_account' });
    try {
      await auth.signInWithPopup(this.#auth, proveedor);
    } catch (e) {
      // En iOS instalado como app el popup a veces no abre: redirección de respaldo.
      if (String(mensaje(e)).includes('popup')) await auth.signInWithRedirect(this.#auth, proveedor);
      else throw new Error(mensaje(e));
    }
  }

  async salir(): Promise<void> {
    const auth = await import('firebase/auth');
    if (this.#auth) await auth.signOut(this.#auth);
  }

  db(): Firestore | null { return this.#db; }
  app(): FirebaseApp | null { return this.#app; }
  uid(): string | null { return this.usuario()?.uid ?? null; }
}

function leerConfig(): ConfigFirebase | null {
  const guardada = localStorage.getItem(CLAVE_CONFIG);
  if (guardada) { try { return JSON.parse(guardada) as ConfigFirebase; } catch { /* rota */ } }
  const e = environment.firebase;
  return e && e.apiKey ? e : null;
}

/**
 * Acepta lo que Firebase muestra en la consola: el objeto JS del snippet, JSON
 * pelado, o con `const firebaseConfig =` adelante. Copiar y pegar tiene que
 * alcanzar; nadie va a andar limpiando comillas a mano en el celular.
 */
export function parsearConfig(texto: string): ConfigFirebase {
  const cuerpo = texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1);
  if (!cuerpo) throw new Error('No encontré el objeto de configuración.');
  const json = cuerpo
    .replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":')  // claves sin comillas
    .replace(/'/g, '"')
    .replace(/,(\s*[}\]])/g, '$1');                         // coma colgada
  let cfg: Partial<ConfigFirebase>;
  try { cfg = JSON.parse(json) as Partial<ConfigFirebase>; }
  catch { throw new Error('No pude leer esa configuración. Pegá el bloque tal cual te lo da Firebase.'); }
  for (const campo of ['apiKey', 'authDomain', 'projectId', 'appId'] as const) {
    if (!cfg[campo]) throw new Error(`Falta ${campo} en la configuración.`);
  }
  return cfg as ConfigFirebase;
}

function mensaje(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (m.includes('auth/unauthorized-domain')) {
    return 'Este dominio no está autorizado en Firebase. Agregalo en Authentication → Settings → Authorized domains.';
  }
  if (m.includes('popup-blocked')) return 'El navegador bloqueó la ventana de Google (popup).';
  if (m.includes('operation-not-allowed')) return 'Falta habilitar el acceso con Google en Firebase → Authentication.';
  return m;
}
