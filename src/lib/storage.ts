import { PageData, Photo, ReportSettings } from '../types';

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
              blob = await urlToBlob(photo.url);
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
 * Nome do arquivo: <titulo>_YYYY-MM-DD-HH-MM-SS.json
 */
export async function exportProjectToFile(settings: ReportSettings, pages: PageData[]): Promise<string> {
  // Converte todas as fotos para base64/dataUrl
  const exportedPages: ExportedPageData[] = await Promise.all(
    pages.map(async (page) => {
      const exportedPhotos: ExportedPhoto[] = await Promise.all(
        page.photos.map(async (photo) => {
          let dataUrl = '';
          try {
            const blob = await urlToBlob(photo.url);
            dataUrl = await blobToDataUrl(blob);
          } catch (e) {
            console.error('Erro ao converter foto para base64:', photo.id, e);
          }
          return {
            id: photo.id,
            filename: photo.filename,
            description: photo.description,
            fit: photo.fit,
            objectPosition: photo.objectPosition,
            isFullWidth: photo.isFullWidth,
            dataUrl
          };
        })
      );
      return { id: page.id, photos: exportedPhotos };
    })
  );

  const exportData: ExportedProjectFile = {
    version: 1,
    app: 'PhotoReportGenerator',
    exportedAt: new Date().toISOString(),
    settings,
    pages: exportedPages
  };

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
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

  setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
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
            const res = await fetch(p.dataUrl);
            const blob = await res.blob();
            url = URL.createObjectURL(blob);
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
