/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect, type DragEvent } from 'react';
import { 
  DndContext, closestCorners, pointerWithin, PointerSensor, 
  useSensor, useSensors, DragEndEvent, DragOverEvent, DragStartEvent, DragOverlay,
  CollisionDetection
} from '@dnd-kit/core';
import { 
  Printer, UploadCloud, Settings2, Image as ImageIcon, Plus, Info, 
  Save, FolderOpen, RotateCcw, Check, Loader2, FileText, Sparkles
} from 'lucide-react';
import { arrayMove } from '@dnd-kit/sortable';
import { loadPhoto, rotateImage, optimizePhotoUrl, getQualityConfig } from './lib/image';
import { Photo, ReportSettings, PageData, PrintQualityPreset } from './types';
import { PageSheet } from './components/PageSheet';
import { 
  saveActiveProjectToDB, 
  loadActiveProjectFromDB, 
  clearActiveProjectFromDB, 
  exportProjectToFile, 
  importProjectFromFile 
} from './lib/storage';

export default function App() {
  const [pages, setPages] = useState<PageData[]>([{ id: crypto.randomUUID(), photos: [] }]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState<{ current: number; total: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const [isInitialLoadDone, setIsInitialLoadDone] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  
  const [settings, setSettings] = useState<ReportSettings>({
    paperSize: 'A4',
    orientation: 'portrait',
    columns: 2,
    fontFamily: 'Arial, sans-serif',
    titleFontSize: 24,
    captionFontSize: 14,
    startPageNum: 1,
    showPageNum: true,
    title: 'Relatório Fotográfico',
    numberImages: true,
    startingImageNumber: 1,
    printQuality: '300dpi'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Carrega o projeto salvo no IndexedDB na inicialização
  useEffect(() => {
    async function loadSavedState() {
      try {
        const saved = await loadActiveProjectFromDB();
        if (saved && (saved.pages.some(p => p.photos.length > 0) || saved.settings.title !== 'Relatório Fotográfico')) {
          setSettings(saved.settings);
          setPages(saved.pages);
          showToast('Rascunho recuperado do navegador com sucesso!', 'info');
        }
      } catch (err) {
        console.error('Erro ao restaurar rascunho:', err);
      } finally {
        setIsInitialLoadDone(true);
      }
    }
    loadSavedState();
  }, []);

  // Salvamento automático contínuo no IndexedDB (debounced)
  useEffect(() => {
    if (!isInitialLoadDone) return;

    setSaveStatus('saving');

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveActiveProjectToDB(settings, pages);
        setSaveStatus('saved');
      } catch (e) {
        console.error('Falha no salvamento automático:', e);
        setSaveStatus('idle');
      }
    }, 800);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [pages, settings, isInitialLoadDone]);

  useEffect(() => {
    // Prevent default browser behavior for global drag and drop
    const handleWindowDragOver = (e: DragEvent) => e.preventDefault();
    const handleWindowDrop = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', handleWindowDragOver as any);
    window.addEventListener('drop', handleWindowDrop as any);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver as any);
      window.removeEventListener('drop', handleWindowDrop as any);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { 
      activationConstraint: { 
        distance: 4 
      } 
    })
  );

  const findContainer = useCallback((id: string, currentPages = pages) => {
    const page = currentPages.find(p => p.id === id);
    if (page) return page.id;
    const containingPage = currentPages.find(p => p.photos.some(photo => photo.id === id));
    return containingPage?.id;
  }, [pages]);

  const collisionDetectionStrategy: CollisionDetection = useCallback((args) => {
    // Check if pointer is over any target
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }
    return closestCorners(args);
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeItemId = String(active.id);
    const overItemId = String(over.id);

    const activeContainer = findContainer(activeItemId);
    const overContainer = findContainer(overItemId);

    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }

    setPages((prev) => {
      const activePage = prev.find(p => p.id === activeContainer);
      const overPage = prev.find(p => p.id === overContainer);

      if (!activePage || !overPage) return prev;

      const activeIndex = activePage.photos.findIndex(p => p.id === activeItemId);
      if (activeIndex === -1) return prev;

      const overIndex = overPage.photos.findIndex(p => p.id === overItemId);
      const newIndex = overIndex >= 0 ? overIndex : overPage.photos.length;

      const activePhotos = [...activePage.photos];
      const [movedPhoto] = activePhotos.splice(activeIndex, 1);

      const overPhotos = [...overPage.photos];
      overPhotos.splice(newIndex, 0, movedPhoto);

      return prev.map(p => {
        if (p.id === activeContainer) return { ...p, photos: activePhotos };
        if (p.id === overContainer) return { ...p, photos: overPhotos };
        return p;
      });
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeItemId = String(active.id);
    const overItemId = String(over.id);

    const activeContainer = findContainer(activeItemId);
    const overContainer = findContainer(overItemId);

    if (!activeContainer || !overContainer) return;

    if (activeContainer === overContainer) {
      const containerPage = pages.find(p => p.id === activeContainer);
      if (!containerPage) return;

      const activeIndex = containerPage.photos.findIndex(p => p.id === activeItemId);
      const overIndex = containerPage.photos.findIndex(p => p.id === overItemId);

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        setPages((prev) => {
          return prev.map(p => {
            if (p.id === activeContainer) {
              return {
                ...p,
                photos: arrayMove(p.photos, activeIndex, overIndex),
              };
            }
            return p;
          });
        });
      }
    } else {
      setPages((prev) => {
        const activePage = prev.find(p => p.id === activeContainer);
        const overPage = prev.find(p => p.id === overContainer);
        if (!activePage || !overPage) return prev;

        const activeIndex = activePage.photos.findIndex(p => p.id === activeItemId);
        if (activeIndex === -1) return prev;

        const overIndex = overPage.photos.findIndex(p => p.id === overItemId);
        const newIndex = overIndex >= 0 ? overIndex : overPage.photos.length;

        const activePhotos = [...activePage.photos];
        const [movedPhoto] = activePhotos.splice(activeIndex, 1);

        const overPhotos = [...overPage.photos];
        overPhotos.splice(newIndex, 0, movedPhoto);

        return prev.map(p => {
          if (p.id === activeContainer) return { ...p, photos: activePhotos };
          if (p.id === overContainer) return { ...p, photos: overPhotos };
          return p;
        });
      });
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    // Verifica se algum arquivo é um projeto .json
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.endsWith('.json') || file.type === 'application/json') {
        handleLoadProjectFile(file);
        return;
      }
    }

    setIsProcessing(true);
    const newPhotos: Photo[] = [];
    const qualityPreset = settings.printQuality || '300dpi';
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const p = await loadPhoto(file, qualityPreset);
        newPhotos.push(p);
      }
    }

    if (newPhotos.length > 0) {
      setPages(prev => {
        const newPages = [...prev];
        const lastPage = newPages[newPages.length - 1];
        newPages[newPages.length - 1] = {
          ...lastPage,
          photos: [...lastPage.photos, ...newPhotos]
        };
        return newPages;
      });
      showToast(`${newPhotos.length} foto(s) adicionada(s) e otimizada(s) a 300 DPI.`);
    }
    setIsProcessing(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const addPage = () => {
    setPages(prev => [...prev, { id: crypto.randomUUID(), photos: [] }]);
  };

  const removePage = (id: string) => {
    setPages(prev => {
      if (prev.length === 1) {
        return [{ id: crypto.randomUUID(), photos: [] }]; // Keep at least one page empty
      }
      return prev.filter(p => p.id !== id);
    });
  };

  const updatePhoto = (id: string, updates: Partial<Photo>) => {
    setPages(prev => prev.map(page => ({
      ...page,
      photos: page.photos.map(p => p.id === id ? { ...p, ...updates } : p)
    })));
  };

  const deletePhoto = (id: string) => {
    setPages(prev => prev.map(page => ({
      ...page,
      photos: page.photos.filter(p => {
        if (p.id === id) URL.revokeObjectURL(p.url);
        return p.id !== id;
      })
    })));
  };

  const handleRotate = async (id: string) => {
    const allPhotos = pages.flatMap(p => p.photos);
    const photo = allPhotos.find(p => p.id === id);
    if (!photo) return;
    try {
      const newUrl = await rotateImage(photo.url, 90, settings.printQuality || '300dpi');
      updatePhoto(id, { url: newUrl });
    } catch (e) {
      console.error('Failed to rotate', e);
    }
  };

  const optimizeProjectPhotos = async (qualityPreset: PrintQualityPreset = settings.printQuality || '300dpi') => {
    const totalPhotos = pages.reduce((acc, p) => acc + p.photos.length, 0);
    if (totalPhotos === 0) {
      showToast('Nenhuma foto no relatório para otimizar.', 'info');
      return;
    }

    setIsOptimizing(true);
    setOptimizationProgress({ current: 0, total: totalPhotos });

    const { maxDimension, quality, label } = getQualityConfig(qualityPreset);
    let processed = 0;

    try {
      const updatedPages = await Promise.all(
        pages.map(async (page) => {
          const updatedPhotos = await Promise.all(
            page.photos.map(async (photo) => {
              const newUrl = await optimizePhotoUrl(photo.url, maxDimension, quality);
              processed++;
              setOptimizationProgress({ current: processed, total: totalPhotos });
              return {
                ...photo,
                url: newUrl
              };
            })
          );
          return { ...page, photos: updatedPhotos };
        })
      );

      setPages(updatedPages);
      await saveActiveProjectToDB({ ...settings, printQuality: qualityPreset }, updatedPages);
      showToast(`${totalPhotos} fotos otimizadas para o padrão ${label}!`, 'success');
    } catch (err) {
      console.error('Erro na otimização de fotos:', err);
      showToast('Erro ao otimizar fotos.', 'error');
    } finally {
      setIsOptimizing(false);
      setOptimizationProgress(null);
    }
  };

  const handleExportProject = async () => {
    const totalPhotos = pages.reduce((acc, p) => acc + p.photos.length, 0);
    if (totalPhotos === 0 && !settings.title) {
      showToast('O relatório está vazio.', 'info');
      return;
    }

    try {
      setIsExporting(true);
      const savedFileName = await exportProjectToFile(settings, pages);
      showToast(`Projeto salvo com sucesso: ${savedFileName}`, 'success');
    } catch (error: any) {
      console.error('Erro ao exportar projeto:', error);
      const msg = error?.message ? `Erro ao exportar: ${error.message}` : 'Erro ao exportar o arquivo do projeto.';
      showToast(msg, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleLoadProjectFile = async (file: File) => {
    try {
      setIsImporting(true);
      const imported = await importProjectFromFile(file);
      
      // Limpa URLs antigas
      pages.forEach(p => p.photos.forEach(ph => URL.revokeObjectURL(ph.url)));
      
      setSettings(imported.settings);
      setPages(imported.pages);
      await saveActiveProjectToDB(imported.settings, imported.pages);
      const photoCount = imported.pages.reduce((acc, p) => acc + p.photos.length, 0);
      showToast(`Projeto carregado (${photoCount} fotos otimizadas para 300 DPI)!`, 'success');
    } catch (error: any) {
      console.error('Erro ao carregar projeto:', error);
      const msg = error?.message ? `Falha ao carregar: ${error.message}` : 'Arquivo de projeto inválido ou incompatível.';
      showToast(msg, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleNewProject = async () => {
    // Revoga URLs existentes
    pages.forEach(p => p.photos.forEach(ph => URL.revokeObjectURL(ph.url)));

    const defaultSettings: ReportSettings = {
      paperSize: 'A4',
      orientation: 'portrait',
      columns: 2,
      fontFamily: 'Arial, sans-serif',
      titleFontSize: 24,
      captionFontSize: 14,
      startPageNum: 1,
      showPageNum: true,
      title: 'Relatório Fotográfico',
      numberImages: true,
      startingImageNumber: 1,
      printQuality: '300dpi'
    };

    const emptyPages: PageData[] = [{ id: crypto.randomUUID(), photos: [] }];
    setSettings(defaultSettings);
    setPages(emptyPages);
    await clearActiveProjectFromDB();
    setShowNewProjectModal(false);
    showToast('Novo relatório iniciado.', 'info');
  };

  const handlePrint = async () => {
    const totalPhotos = pages.reduce((acc, p) => acc + p.photos.length, 0);
    
    // Otimiza todas as fotos para o padrão selecionado antes de abrir a caixa de diálogo de impressão
    if (totalPhotos > 0) {
      setIsProcessing(true);
      const { maxDimension, quality, label } = getQualityConfig(settings.printQuality || '300dpi');
      showToast(`Preparando ${totalPhotos} fotos em qualidade ${label} para o PDF...`, 'info');
      
      try {
        const updatedPages = await Promise.all(
          pages.map(async (page) => {
            const updatedPhotos = await Promise.all(
              page.photos.map(async (photo) => {
                const newUrl = await optimizePhotoUrl(photo.url, maxDimension, quality);
                return { ...photo, url: newUrl };
              })
            );
            return { ...page, photos: updatedPhotos };
          })
        );
        setPages(updatedPages);
        
        // Aguarda decodificação de imagens no navegador
        await new Promise((r) => setTimeout(r, 200));
      } catch (e) {
        console.warn('Otimização rápida antes da impressão falhou:', e);
      } finally {
        setIsProcessing(false);
      }
    }

    const originalTitle = document.title;
    const date = new Date();
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    const safeTitle = (settings.title || 'relatorio_fotografico')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_\- ]/g, '')
      .trim()
      .replace(/\s+/g, '_') || 'relatorio';

    document.title = `${safeTitle}_${yyyy}-${mm}-${dd}`;
    
    window.print();
    
    setTimeout(() => {
      document.title = originalTitle;
    }, 1500);
  };

  // Helper to calculate the global index of the first photo in each page
  const getGlobalStartIndices = () => {
    let current = settings.startingImageNumber;
    return pages.map(page => {
      const start = current;
      current += page.photos.length;
      return start;
    });
  };
  const startIndices = getGlobalStartIndices();
  const activePhoto = activeId ? pages.flatMap(p => p.photos).find(p => p.id === activeId) : null;

  return (
    <div className="min-h-screen bg-neutral-900 flex font-sans text-neutral-200" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      {/* Toast Notification */}
      {notification && (
        <div 
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2 border transition-all no-print ${
            notification.type === 'success' 
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-700/60' 
              : notification.type === 'error' 
                ? 'bg-rose-950/90 text-rose-200 border-rose-700/60'
                : 'bg-blue-950/90 text-blue-200 border-blue-700/60'
          }`}
        >
          {notification.type === 'success' && <Check size={16} className="text-emerald-400" />}
          {notification.type === 'error' && <Info size={16} className="text-rose-400" />}
          {notification.type === 'info' && <Info size={16} className="text-blue-400" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Confirmation Modal for New Project */}
      {showNewProjectModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 no-print">
          <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <RotateCcw size={18} className="text-amber-400" />
              Iniciar Novo Relatório?
            </h3>
            <p className="text-sm text-neutral-300 leading-relaxed">
              O rascunho atual será limpo. Se você não salvou o arquivo do projeto no seu computador, certifique-se de usar o botão <strong>"Salvar Projeto"</strong> antes de prosseguir.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleNewProject}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Sim, Limpar e Iniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar - no-print */}
      <div className="w-80 bg-neutral-950 border-r border-neutral-800 h-screen sticky top-0 flex flex-col no-print shrink-0 shadow-2xl z-10">
        <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <ImageIcon className="text-blue-500 shrink-0" size={20} />
            Gerador de Relatórios
          </h1>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-4 custom-scrollbar text-xs">
          {/* Project Management Section - Compact 3-box row */}
          <div className="space-y-2 bg-neutral-900/90 border border-neutral-800/90 rounded-lg p-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={13} className="text-blue-400" /> Projeto & Sessão
              </h2>
              <span className="text-[10px] text-neutral-400 flex items-center gap-1">
                {saveStatus === 'saving' ? (
                  <span className="flex items-center gap-1 text-amber-400">
                    <Loader2 size={10} className="animate-spin" /> Salvando...
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Check size={10} /> Auto-salvo
                  </span>
                )}
              </span>
            </div>

            <input 
              type="file" 
              ref={projectInputRef} 
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLoadProjectFile(file);
                e.target.value = '';
              }}
              accept=".json,application/json" 
              className="hidden" 
            />

            {/* 3 Caixas em uma única linha: Salvar, Abrir, Limpar */}
            <div className="grid grid-cols-3 gap-1.5 pt-0.5">
              <button
                onClick={handleExportProject}
                disabled={isExporting}
                className="py-1.5 px-2 bg-blue-600/90 hover:bg-blue-600 text-white rounded text-[11px] font-semibold flex items-center justify-center gap-1 shadow-sm transition-colors disabled:opacity-50"
                title="Salva um arquivo .json com fotos, legendas e configurações"
              >
                {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {isExporting ? 'Salvando' : 'Salvar'}
              </button>

              <button
                onClick={() => projectInputRef.current?.click()}
                disabled={isImporting}
                className="py-1.5 px-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded text-[11px] font-semibold flex items-center justify-center gap-1 shadow-sm transition-colors disabled:opacity-50"
                title="Abre um arquivo .json de projeto salvo"
              >
                {isImporting ? <Loader2 size={12} className="animate-spin" /> : <FolderOpen size={12} />}
                {isImporting ? 'Abrindo' : 'Abrir'}
              </button>

              <button
                onClick={() => setShowNewProjectModal(true)}
                className="py-1.5 px-2 bg-neutral-800/60 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-700/60 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors"
                title="Limpar projeto e iniciar novo relatório"
              >
                <RotateCcw size={12} /> Limpar
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
              <Settings2 size={13} /> Configurações do Documento
            </h2>
            
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Título do Relatório</label>
              <input
                type="text"
                value={settings.title}
                onChange={e => setSettings({...settings, title: e.target.value})}
                className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-1.5 text-xs text-white focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Tamanho</label>
                <select
                  value={settings.paperSize}
                  onChange={e => setSettings({...settings, paperSize: e.target.value as any})}
                  className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-1.5 text-xs text-white"
                >
                  <option value="A4">A4</option>
                  <option value="letter">Letter</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Orientação</label>
                <select
                  value={settings.orientation}
                  onChange={e => setSettings({...settings, orientation: e.target.value as any})}
                  className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-1.5 text-xs text-white"
                >
                  <option value="portrait">Retrato</option>
                  <option value="landscape">Paisagem</option>
                </select>
              </div>
            </div>

            {/* Fonte e Colunas na mesma linha */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Fonte</label>
                <select
                  value={settings.fontFamily}
                  onChange={e => setSettings({...settings, fontFamily: e.target.value})}
                  className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-1.5 text-xs text-white"
                >
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="'Calibri', sans-serif">Calibri</option>
                  <option value="'Times New Roman', serif">Times New Roman</option>
                  <option value="'Courier New', monospace">Courier New</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1" title="Colunas por página">Colunas na Grade</label>
                <select
                  value={settings.columns}
                  onChange={e => setSettings({...settings, columns: Number(e.target.value)})}
                  className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-1.5 text-xs text-white"
                >
                  <option value={1}>1 Coluna</option>
                  <option value={2}>2 Colunas</option>
                  <option value={3}>3 Colunas</option>
                  <option value={4}>4 Colunas</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1" title="Tamanho da fonte do Título">Tam. Título (pt)</label>
                <input
                  type="number"
                  value={settings.titleFontSize}
                  onChange={e => setSettings({...settings, titleFontSize: Number(e.target.value)})}
                  className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-1.5 text-xs text-white"
                  min="12" max="72"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1" title="Tamanho da fonte das legendas">Tam. Legendas (pt)</label>
                <input
                  type="number"
                  value={settings.captionFontSize}
                  onChange={e => setSettings({...settings, captionFontSize: Number(e.target.value)})}
                  className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-1.5 text-xs text-white"
                  min="8" max="36"
                />
              </div>
            </div>

            {/* Página Inicial e Imagem Inicial compactadas em linhas combinadas com checkbox antes do seletor */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-neutral-300 mb-1 flex items-center justify-between">
                  <span>Páginas</span>
                  <label className="flex items-center gap-1 cursor-pointer font-normal text-[11px] text-neutral-400">
                    <input
                      type="checkbox"
                      checked={settings.showPageNum}
                      onChange={e => setSettings({...settings, showPageNum: e.target.checked})}
                      className="rounded bg-neutral-800 border-neutral-600 text-blue-500 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                    <span>Numerar</span>
                  </label>
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-neutral-400 shrink-0">Inicial:</span>
                  <input
                    type="number"
                    value={settings.startPageNum}
                    onChange={e => setSettings({...settings, startPageNum: Number(e.target.value)})}
                    disabled={!settings.showPageNum}
                    className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-1.5 text-xs text-white disabled:opacity-40"
                    min="1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-300 mb-1 flex items-center justify-between">
                  <span>Imagens</span>
                  <label className="flex items-center gap-1 cursor-pointer font-normal text-[11px] text-neutral-400">
                    <input
                      type="checkbox"
                      checked={settings.numberImages}
                      onChange={e => setSettings({...settings, numberImages: e.target.checked})}
                      className="rounded bg-neutral-800 border-neutral-600 text-blue-500 focus:ring-blue-500 h-3.5 w-3.5"
                    />
                    <span>Numerar</span>
                  </label>
                </label>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-neutral-400 shrink-0">Inicial:</span>
                  <input
                    type="number"
                    value={settings.startingImageNumber}
                    onChange={e => setSettings({...settings, startingImageNumber: Number(e.target.value)})}
                    disabled={!settings.numberImages}
                    className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-1.5 text-xs text-white disabled:opacity-40"
                    min="1"
                  />
                </div>
              </div>
            </div>

            {/* Configuração de Qualidade de Impressão e PDF */}
            <div className="pt-2 border-t border-neutral-800/80 space-y-1.5">
              <label className="block text-xs font-medium text-neutral-300 mb-1 flex items-center justify-between">
                <span>Qualidade do PDF</span>
                <span className="text-[10px] font-semibold text-blue-400 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-800/40">
                  {getQualityConfig(settings.printQuality || '300dpi').label}
                </span>
              </label>
              <select
                value={settings.printQuality || '300dpi'}
                onChange={e => {
                  const newQuality = e.target.value as PrintQualityPreset;
                  setSettings({ ...settings, printQuality: newQuality });
                }}
                className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-1.5 text-xs text-white focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="300dpi">300 DPI - Padrão Gráfico (~20-35MB)</option>
                <option value="ultra">300+ DPI - Ultra Nitidez (~45-65MB)</option>
                <option value="compact">150 DPI - Compartilhamento (~10-16MB)</option>
                <option value="screen">100 DPI - Telas Digital (~4-7MB)</option>
                <option value="screen_72dpi">72 DPI - Ultracompacto Web (~2-4MB)</option>
              </select>

              <button
                onClick={() => optimizeProjectPhotos(settings.printQuality || '300dpi')}
                disabled={isOptimizing || pages.every(p => p.photos.length === 0)}
                className="w-full mt-1.5 py-1.5 px-2 bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 hover:border-blue-500/50 text-neutral-200 rounded text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 shadow-sm"
                title="Aplica a resolução e compressão selecionada a todas as fotos do documento"
              >
                {isOptimizing ? (
                  <>
                    <Loader2 size={12} className="animate-spin text-blue-400" />
                    <span>Otimizando {optimizationProgress ? `${optimizationProgress.current}/${optimizationProgress.total}` : '...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={12} className="text-amber-400" />
                    <span>Aplicar às Fotos ({pages.reduce((acc, p) => acc + p.photos.length, 0)})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-neutral-800 bg-neutral-950 space-y-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => e.target.files && processFiles(e.target.files)} 
            multiple 
            accept="image/*" 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="w-full py-2.5 px-4 bg-neutral-800 border border-neutral-700 text-white rounded-lg hover:bg-neutral-700 transition-colors font-medium flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
          >
            <UploadCloud size={18} />
            {isProcessing ? 'Carregando...' : 'Adicionar Fotos'}
          </button>
          
          <button 
            onClick={handlePrint}
            className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2 shadow-sm"
          >
            <Printer size={18} />
            Gerar PDF
          </button>

          <p className="text-xs flex items-start gap-1.5 text-neutral-400 mt-2">
            <Info size={14} className="shrink-0 mt-0.5" />
            Se as fotos tiverem a tag Descrição preenchida, as legendas serão extraídas automaticamente.
          </p>
        </div>
      </div>

      {/* Main Content (WYSIWYG Print Area) */}
      <div className="flex-1 p-8 h-screen overflow-y-auto main-print-area custom-scrollbar relative">
        <DndContext 
          sensors={sensors} 
          collisionDetection={collisionDetectionStrategy} 
          onDragStart={handleDragStart}
          onDragOver={handleDragOver} 
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {pages.map((page, index) => (
            <PageSheet
              key={page.id}
              page={page}
              pageIndex={index}
              globalStartIndex={startIndices[index]}
              settings={settings}
              onUpdatePhoto={updatePhoto}
              onDeletePhoto={deletePhoto}
              onRotatePhoto={handleRotate}
              onRemovePage={removePage}
              isLastPage={index === pages.length - 1}
            />
          ))}

          <DragOverlay dropAnimation={{ duration: 150, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
            {activePhoto ? (
              <div className="w-56 h-48 bg-white p-2 rounded-lg shadow-2xl border-2 border-blue-500 flex flex-col pointer-events-none opacity-95">
                <div className="flex-1 relative mb-1 flex items-center justify-center overflow-hidden">
                  <img
                    src={activePhoto.url}
                    alt={activePhoto.filename}
                    className="w-full h-full object-contain select-none"
                    draggable={false}
                  />
                </div>
                {activePhoto.description ? (
                  <p className="text-xs text-neutral-800 truncate font-medium">
                    {activePhoto.description}
                  </p>
                ) : null}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        <div className="max-w-4xl mx-auto flex justify-center mb-16 no-print">
          <button
            onClick={addPage}
            className="flex items-center gap-2 px-6 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-full font-medium transition-colors shadow-lg border border-neutral-700"
          >
            <Plus size={20} /> Adicionar Nova Página
          </button>
        </div>
      </div>
    </div>
  );
}


