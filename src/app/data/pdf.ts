/**
 * pdf.ts — Sacarle el texto a un PDF, en el navegador.
 *
 * La librería pesa, así que se carga recién cuando aparece el primer PDF: si
 * tu carpeta no tiene ninguno, este código nunca se descarga.
 *
 * Un PDF escaneado no tiene texto adentro, sólo una foto de cada hoja. Eso no
 * se puede leer sin OCR, y la app lo dice en vez de fingir que lo indexó.
 */

const MAX_PAGINAS = 80;

let workerListo = false;

export interface TextoPdf {
  texto: string;
  paginas: number;
  /** Verdadero cuando el archivo es imagen pura y no hay nada que indexar. */
  escaneado: boolean;
}

export async function textoDePdf(datos: ArrayBuffer): Promise<TextoPdf> {
  const pdfjs = await import('pdfjs-dist');

  // El worker es un archivo suelto al lado del index.
  if (!workerListo) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', document.baseURI).toString();
    workerListo = true;
  }

  // Nada de fuentes ni recursos externos: acá sólo se quiere el texto.
  const tarea = pdfjs.getDocument({ data: new Uint8Array(datos), disableFontFace: true });
  const doc = await tarea.promise;

  const paginas = Math.min(doc.numPages, MAX_PAGINAS);
  const partes: string[] = [];

  for (let i = 1; i <= paginas; i++) {
    const pagina = await doc.getPage(i);
    const contenido = await pagina.getTextContent();
    const linea = contenido.items
      .map(it => ('str' in it ? it.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (linea) partes.push(linea);
    pagina.cleanup();
  }
  const total = doc.numPages;
  await tarea.destroy();

  const texto = partes.join('\n\n');
  return {
    texto,
    paginas: total,
    escaneado: texto.replace(/\s/g, '').length < 40,
  };
}
