import { PageData, Photo, ReportSettings } from '../types';
import { optimizeImageBlob } from './image';

const DB_NAME = 'PhotoReportDB';
const DB_VERSION = 1;
const STORE_NAME = 'project_store';
const CURRENT_PROJECT_KEY = 'active_project';

interface StoredPhoto {
  id: string;
  blob: Blob;
  filename: string;
  description: string;
  fit: 'contain' | 'cover';
  objectPosition?: Photo['objectPosition'];
  isFullWidth: boolean;
}

interface StoredPageData {
  id: string;
  photos: StoredPhoto[];
}

interface StoredProject {
  id: string;
  settings: ReportSettings;
  pages: StoredPageData[];
  updatedAt: number;
}

interface ExportedPhoto {
  id: string;
  filename: string;
  description: string;
  fit: 'contain' | 'cover';
  objectPosition?: Photo['objectPosition'];
  isFullWidth: boolean;
  dataUrl: string;
}

interface ExportedPageData {
  id: string;
  photos: ExportedPhoto[];
}

export interface ExportedProjectFile {
  version: 1;
  app: 'PhotoReportGenerator';
  exportedAt: string;
  settings: ReportSettings;
  pages: ExportedPageData[];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function urlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  return await response.blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Salva o estado atual no IndexedDB local do navegador
 */
export async function saveActiveProjectToDB(settings: ReportSettings, pages: PageData[]): Promise<void> {
  try {
    const db = await openDB();

    // Converte todas as fotos para Blobs armazenáveis
    const storedPages: StoredPageData[] = await Promise.all(
      pages.map(async (page) => {
        const storedPhotos: StoredPhoto[] = await Promise.all(
          page.photos.map(async (photo) => {
            let blob: Blob;
            try {
              const rawBlob = await urlToBlob(photo.url);
              blob = await optimizeImageBlob(rawBlob, 2048, 0.88);
            } catch (e) {
              console.warn(`Não foi possível obter blob da foto ${photo.id}, criando blob vazio`, e);
              blob = new Blob([], { type: 'image/jpeg' });
            }
            return {
              id: photo.id,
              blob,
              filename: photo.filename,
              description: photo.description,
              fit: photo.fit,
              objectPosition: photo.objectPosition,
              isFullWidth: photo.isFullWidth
            };
          })
        );
        return { id: page.id, photos: storedPhotos };
      })
    );

    const projectData: StoredProject = {
      id: CURRENT_PROJECT_KEY,
      settings,
      pages: storedPages,
      updatedAt: Date.now()
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const putReq = store.put(projectData);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    });
  } catch (error) {
    console.error('Erro ao salvar no IndexedDB:', error);
  }
}

/**
 * Carrega o último projeto ativo salvo no IndexedDB
 */
export async function loadActiveProjectFromDB(): Promise<{ settings: ReportSettings; pages: PageData[] } | null> {
  try {
    const db = await openDB();

    const storedProject = await new Promise<StoredProject | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(CURRENT_PROJECT_KEY);
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    });

    if (!storedProject || !storedProject.pages || storedProject.pages.length === 0) {
      return null;
    }

    // Reconstroi os Object URLs a partir dos Blobs
    const pages: PageData[] = storedProject.pages.map((p) => ({
      id: p.id,
      photos: p.photos.map((sp) => ({
        id: sp.id,
        url: URL.createObjectURL(sp.blob),
        filename: sp.filename,
        description: sp.description,
        fit: sp.fit,
        objectPosition: sp.objectPosition || 'center',
        isFullWidth: sp.isFullWidth || false
      }))
    }));

    return {
      settings: storedProject.settings,
      pages
    };
  } catch (error) {
    console.error('Erro ao carregar do IndexedDB:', error);
    return null;
  }
}

/**
 * Limpa o rascunho atual do IndexedDB
 */
export async function clearActiveProjectFromDB(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const delReq = store.delete(CURRENT_PROJECT_KEY);
      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
    });
  } catch (error) {
    console.error('Erro ao limpar IndexedDB:', error);
  }
}

/**
 * Exporta o projeto completo para um arquivo local .json
 * Utiliza otimização de imagens e escrita em blocos (chunks) para evitar
 * estouro de memória do JavaScript ("RangeError: Invalid string length")
 * mesmo com dezenas de fotos de alta resolução.
 */
export async function exportProjectToFile(settings: ReportSettings, pages: PageData[]): Promise<string> {
  // Converte fotos em lotes com otimização prévia
  const exportedPages: ExportedPageData[] = [];

  for (const page of pages) {
    const exportedPhotos: ExportedPhoto[] = [];
    for (const photo of page.photos) {
      let dataUrl = '';
      try {
        const rawBlob = await urlToBlob(photo.url);
        // Garante que a imagem esteja otimizada para evitar arquivos de 200MB+
        const optimizedBlob = await optimizeImageBlob(rawBlob, 2048, 0.88);
        dataUrl = await blobToDataUrl(optimizedBlob);
      } catch (e) {
        console.error('Erro ao processar foto para exportação:', photo.id, e);
      }

      exportedPhotos.push({
        id: photo.id,
        filename: photo.filename,
        description: photo.description,
        fit: photo.fit,
        objectPosition: photo.objectPosition,
        isFullWidth: photo.isFullWidth,
        dataUrl
      });
    }
    exportedPages.push({ id: page.id, photos: exportedPhotos });
  }

  // Constrói o Blob do JSON diretamente por partes (chunks)
  // Isso evita alocar uma única string gigantesca de centenas de megabytes na heap do JS
  const chunks: string[] = [];
  chunks.push('{\n');
  chunks.push('  "version": 1,\n');
  chunks.push('  "app": "PhotoReportGenerator",\n');
  chunks.push(`  "exportedAt": ${JSON.stringify(new Date().toISOString())},\n`);
  chunks.push(`  "settings": ${JSON.stringify(settings, null, 2).replace(/\n/g, '\n  ')},\n`);
  chunks.push('  "pages": [\n');

  for (let pIdx = 0; pIdx < exportedPages.length; pIdx++) {
    const page = exportedPages[pIdx];
    chunks.push('    {\n');
    chunks.push(`      "id": ${JSON.stringify(page.id)},\n`);
    chunks.push('      "photos": [\n');

    for (let phIdx = 0; phIdx < page.photos.length; phIdx++) {
      const photo = page.photos[phIdx];
      const photoJson = JSON.stringify(photo, null, 2);
      const indented = photoJson.split('\n').map(line => '        ' + line).join('\n');
      chunks.push(indented);
      if (phIdx < page.photos.length - 1) {
        chunks.push(',\n');
      } else {
        chunks.push('\n');
      }
    }

    chunks.push('      ]\n');
    chunks.push('    }');
    if (pIdx < exportedPages.length - 1) {
      chunks.push(',\n');
    } else {
      chunks.push('\n');
    }
  }

  chunks.push('  ]\n');
  chunks.push('}\n');

  const blob = new Blob(chunks, { type: 'application/json' });
  const downloadUrl = URL.createObjectURL(blob);

  // Formata o timestamp solicitado: YYYY-MM-DD-HH-MM-SS
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

  // Sanitiza o título do usuário para nome de arquivo seguro
  const rawTitle = (settings.title || 'relatorio_fotografico').trim();
  const safeTitle = rawTitle
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos para compatibilidade ampla
    .replace(/[^a-zA-Z0-9_\- ]/g, '') // remove caracteres inválidos de arquivo
    .trim()
    .replace(/\s+/g, '_') || 'relatorio';

  const fileName = `${safeTitle}_${timestamp}.json`;

  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(downloadUrl), 8000);
  return fileName;
}

/**
 * Importa um arquivo de projeto .json e reconstroi fotos e configurações
 */
export async function importProjectFromFile(file: File): Promise<{ settings: ReportSettings; pages: PageData[] }> {
  const text = await file.text();
  const data = JSON.parse(text) as ExportedProjectFile;

  if (!data || !data.settings || !Array.isArray(data.pages)) {
    throw new Error('Arquivo de projeto inválido ou corrompido.');
  }

  const pages: PageData[] = await Promise.all(
    data.pages.map(async (page) => {
      const photos: Photo[] = await Promise.all(
        page.photos.map(async (p) => {
          let url = '';
          if (p.dataUrl) {
            try {
              const res = await fetch(p.dataUrl);
              const rawBlob = await res.blob();
              // Otimiza blob para liberar memória se o arquivo original era de 200MB+
              const optimizedBlob = await optimizeImageBlob(rawBlob, 2048, 0.88);
              url = URL.createObjectURL(optimizedBlob);
            } catch (err) {
              console.error('Erro ao reconstruir imagem:', p.filename, err);
            }
          }
          return {
            id: p.id || crypto.randomUUID(),
            url,
            filename: p.filename || 'imagem.jpg',
            description: p.description || '',
            fit: p.fit || 'contain',
            objectPosition: p.objectPosition || 'center',
            isFullWidth: Boolean(p.isFullWidth)
          };
        })
      );
      return { id: page.id || crypto.randomUUID(), photos };
    })
  );

  return {
    settings: data.settings,
    pages: pages.length > 0 ? pages : [{ id: crypto.randomUUID(), photos: [] }]
  };
}

