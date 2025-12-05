/**
 * Document Chunking Utilities
 *
 * Utilidades para dividir documentos largos en fragmentos manejables
 * para procesamiento con LLMs que tienen contexto limitado (4096 tokens ~ 3000 palabras)
 */

export interface ChunkOptions {
  maxChunkSize: number;       // Tamaño máximo del chunk en caracteres
  overlap: number;            // Caracteres de overlap entre chunks
  preserveSentences: boolean; // Intentar cortar en límites de oraciones
}

export interface DocumentChunk {
  content: string;
  index: number;
  startPosition: number;
  endPosition: number;
  wordCount: number;
}

export interface ChunkingResult {
  chunks: DocumentChunk[];
  totalChunks: number;
  originalLength: number;
  averageChunkSize: number;
}

const DEFAULT_OPTIONS: ChunkOptions = {
  maxChunkSize: 2500,
  overlap: 300,
  preserveSentences: true
};

/**
 * Divide un documento en chunks con overlap para mantener contexto
 */
export function chunkDocument(
  text: string,
  options: Partial<ChunkOptions> = {}
): ChunkingResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chunks: DocumentChunk[] = [];
  const cleanedText = text.trim();

  if (!cleanedText) {
    return {
      chunks: [],
      totalChunks: 0,
      originalLength: 0,
      averageChunkSize: 0
    };
  }

  // Si el texto es menor que el tamaño máximo, retornar un solo chunk
  if (cleanedText.length <= opts.maxChunkSize) {
    return {
      chunks: [{
        content: cleanedText,
        index: 0,
        startPosition: 0,
        endPosition: cleanedText.length,
        wordCount: countWords(cleanedText)
      }],
      totalChunks: 1,
      originalLength: cleanedText.length,
      averageChunkSize: cleanedText.length
    };
  }

  let start = 0;
  let index = 0;

  while (start < cleanedText.length) {
    let end = Math.min(start + opts.maxChunkSize, cleanedText.length);

    // Si no estamos al final y preservamos oraciones, buscar un buen punto de corte
    if (end < cleanedText.length && opts.preserveSentences) {
      const searchStart = start + Math.floor(opts.maxChunkSize / 2);
      const searchArea = cleanedText.slice(searchStart, end);

      // Buscar el último punto, signo de interrogación o exclamación
      const sentenceEnders = ['. ', '? ', '! ', '.\n', '?\n', '!\n'];
      let bestBreak = -1;

      for (const ender of sentenceEnders) {
        const lastIndex = searchArea.lastIndexOf(ender);
        if (lastIndex !== -1 && lastIndex > bestBreak) {
          bestBreak = lastIndex + ender.length;
        }
      }

      if (bestBreak !== -1) {
        end = searchStart + bestBreak;
      }
    }

    const chunkContent = cleanedText.slice(start, end).trim();

    if (chunkContent.length > 0) {
      chunks.push({
        content: chunkContent,
        index,
        startPosition: start,
        endPosition: end,
        wordCount: countWords(chunkContent)
      });
      index++;
    }

    // Mover el inicio considerando el overlap
    start = end - opts.overlap;

    // Asegurar que avanzamos al menos un carácter para evitar loops infinitos
    if (start <= chunks[chunks.length - 1]?.startPosition) {
      start = end;
    }
  }

  const totalSize = chunks.reduce((sum, c) => sum + c.content.length, 0);

  return {
    chunks,
    totalChunks: chunks.length,
    originalLength: cleanedText.length,
    averageChunkSize: chunks.length > 0 ? Math.round(totalSize / chunks.length) : 0
  };
}

/**
 * Cuenta palabras en un texto
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Estima tokens aproximados (regla general: 1 token ~ 4 caracteres en español)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Verifica si un documento cabe en el contexto del modelo
 */
export function fitsInContext(text: string, maxTokens: number = 4096): boolean {
  return estimateTokens(text) < maxTokens;
}

/**
 * Extrae metadatos básicos del documento
 */
export function extractDocumentMetadata(text: string): {
  wordCount: number;
  characterCount: number;
  estimatedTokens: number;
  paragraphCount: number;
  sentenceCount: number;
} {
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  return {
    wordCount: countWords(text),
    characterCount: text.length,
    estimatedTokens: estimateTokens(text),
    paragraphCount: paragraphs.length,
    sentenceCount: sentences.length
  };
}

/**
 * Limpia y normaliza texto de documento
 */
export function cleanDocumentText(text: string): string {
  return text
    // Normalizar saltos de línea
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remover múltiples espacios
    .replace(/[ \t]+/g, ' ')
    // Remover líneas vacías excesivas
    .replace(/\n{3,}/g, '\n\n')
    // Trim
    .trim();
}

/**
 * Combina resúmenes de múltiples chunks en un análisis coherente
 */
export function createSynthesisPrompt(summaries: string[], originalWordCount: number): string {
  const summaryList = summaries
    .map((s, i) => `--- Fragmento ${i + 1} ---\n${s}`)
    .join('\n\n');

  return `El siguiente documento de ${originalWordCount} palabras fue dividido en ${summaries.length} fragmentos para su análisis. A continuación se presentan los resúmenes de cada fragmento:

${summaryList}

Por favor, combina estos resúmenes en un análisis coherente y unificado del documento completo. Elimina redundancias, identifica temas transversales y presenta las conclusiones principales.`;
}
