/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  DndContext, closestCenter, KeyboardSensor, PointerSensor, 
  useSensor, useSensors, DragEndEvent, DragOverEvent
} from '@dnd-kit/core';
import { Printer, UploadCloud, Settings2, Image as ImageIcon, Plus, Info } from 'lucide-react';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { loadPhoto, rotateImage } from './lib/image';
import { Photo, ReportSettings, PageData } from './types';
import { PageSheet } from './components/PageSheet';

export default function App() {
  const [pages, setPages] = useState<PageData[]>([{ id: crypto.randomUUID(), photos: [] }]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [settings, setSettings] = useState<ReportSettings>({
    paperSize: 'A4',
    orientation: 'portrait',
    columns: 2,
    fontFamily: 'Arial, sans-serif',
    titleFontSize: 24,
    captionFontSize: 14,
    startPageNum: 1,
    showPageNum: true,
    title: 'Relatório Fotográfico'
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Prevent default browser behavior for global drag and drop (opening file in new tab)
    const handleWindowDragOver = (e: DragEvent) => e.preventDefault();
    const handleWindowDrop = (e: DragEvent) => e.preventDefault();
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const findContainer = (id: string) => {
    const page = pages.find(p => p.id === id);
    if (page) return page.id;
    const containingPage = pages.find(p => p.photos.some(photo => photo.id === id));
    return containingPage?.id;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    const overId = over?.id;
    if (!overId) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(overId as string);

    if (!activeContainer || !overContainer || activeContainer === overContainer) {
      return;
    }

    setPages((prev) => {
      const activeItems = prev.find(p => p.id === activeContainer)!.photos;
      const overItems = prev.find(p => p.id === overContainer)!.photos;

      const activeIndex = activeItems.findIndex(p => p.id === active.id);
      const overIndex = overItems.findIndex(p => p.id === overId);

      let newIndex;
      if (overId in prev.map(p => p.id)) {
        newIndex = overItems.length + 1;
      } else {
        const isBelowOverItem =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;

        const modifier = isBelowOverItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length + 1;
      }

      const newPages = JSON.parse(JSON.stringify(prev)); 
      const activePageIdx = newPages.findIndex((p: PageData) => p.id === activeContainer);
      const overPageIdx = newPages.findIndex((p: PageData) => p.id === overContainer);

      const [item] = newPages[activePageIdx].photos.splice(activeIndex, 1);
      newPages[overPageIdx].photos.splice(newIndex, 0, item);

      return newPages;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);

    if (activeContainer && overContainer && activeContainer === overContainer) {
      const activeIndex = pages.find(p => p.id === activeContainer)!.photos.findIndex(p => p.id === active.id);
      const overIndex = pages.find(p => p.id === overContainer)!.photos.findIndex(p => p.id === over.id);

      if (activeIndex !== overIndex) {
        setPages((prev) => {
          const newPages = [...prev];
          const pageIdx = newPages.findIndex(p => p.id === activeContainer);
          newPages[pageIdx] = {
            ...newPages[pageIdx],
            photos: arrayMove(newPages[pageIdx].photos, activeIndex, overIndex),
          };
          return newPages;
        });
      }
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    setIsProcessing(true);
    const newPhotos: Photo[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const p = await loadPhoto(file);
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
    }
    setIsProcessing(false);
  };

  const handleDrop = (e: React.DragEvent) => {
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
      const newUrl = await rotateImage(photo.url, 90);
      updatePhoto(id, { url: newUrl });
    } catch (e) {
      console.error('Failed to rotate', e);
    }
  };

  const handlePrint = () => {
    try {
      const originalTitle = document.title;
      const date = new Date();
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      document.title = `relatoriofotografico_${yyyy}-${mm}-${dd}`;
      
      window.print();
      
      setTimeout(() => {
        document.title = originalTitle;
      }, 1000);
    } catch (e) {
      alert("Não foi possível gerar o PDF aqui. Por favor, abra o aplicativo em uma Nova Guia.");
    }
  };

  // Helper to calculate the global index of the first photo in each page
  const getGlobalStartIndices = () => {
    let current = 1;
    return pages.map(page => {
      const start = current;
      current += page.photos.length;
      return start;
    });
  };
  const startIndices = getGlobalStartIndices();

  return (
    <div className="min-h-screen bg-neutral-900 flex font-sans text-neutral-200" onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      {/* Sidebar - no-print */}
      <div className="w-80 bg-neutral-950 border-r border-neutral-800 h-screen sticky top-0 flex flex-col no-print shrink-0 shadow-2xl z-10">
        <div className="p-6 border-b border-neutral-800">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ImageIcon className="text-blue-500" />
            Gerador de Relatórios
          </h1>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
              <Settings2 size={14} /> Configurações do Documento
            </h2>
            
            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1">Título do Relatório</label>
              <input
                type="text"
                value={settings.title}
                onChange={e => setSettings({...settings, title: e.target.value})}
                className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-2 text-sm text-white focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Tamanho</label>
                <select
                  value={settings.paperSize}
                  onChange={e => setSettings({...settings, paperSize: e.target.value as any})}
                  className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-2 text-sm text-white"
                >
                  <option value="A4">A4</option>
                  <option value="letter">Letter</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Orientação</label>
                <select
                  value={settings.orientation}
                  onChange={e => setSettings({...settings, orientation: e.target.value as any})}
                  className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-2 text-sm text-white"
                >
                  <option value="portrait">Retrato</option>
                  <option value="landscape">Paisagem</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-neutral-300 mb-1">Fonte</label>
                <select
                  value={settings.fontFamily}
                  onChange={e => setSettings({...settings, fontFamily: e.target.value})}
                  className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-2 text-sm text-white"
                >
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="'Calibri', sans-serif">Calibri</option>
                  <option value="'Times New Roman', serif">Times New Roman</option>
                  <option value="'Courier New', monospace">Courier New</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-300 mb-1" title="Colunas por página">Colunas na Grade</label>
              <select
                value={settings.columns}
                onChange={e => setSettings({...settings, columns: Number(e.target.value)})}
                className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-2 text-sm text-white"
              >
                <option value={1}>1 Coluna</option>
                <option value={2}>2 Colunas</option>
                <option value={3}>3 Colunas</option>
                <option value={4}>4 Colunas</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1" title="Tamanho da fonte do Título">Tam. Título</label>
                <input
                  type="number"
                  value={settings.titleFontSize}
                  onChange={e => setSettings({...settings, titleFontSize: Number(e.target.value)})}
                  className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-2 text-sm text-white"
                  min="12" max="72"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1" title="Tamanho da fonte das legendas">Tam. Legendas</label>
                <input
                  type="number"
                  value={settings.captionFontSize}
                  onChange={e => setSettings({...settings, captionFontSize: Number(e.target.value)})}
                  className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-2 text-sm text-white"
                  min="8" max="36"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-1">Página Inicial</label>
                <input
                  type="number"
                  value={settings.startPageNum}
                  onChange={e => setSettings({...settings, startPageNum: Number(e.target.value)})}
                  className="w-full bg-neutral-800 border-neutral-700 rounded-md shadow-sm border p-2 text-sm text-white"
                  min="1"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showPageNum}
                    onChange={e => setSettings({...settings, showPageNum: e.target.checked})}
                    className="rounded bg-neutral-800 border-neutral-600 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-neutral-300">Numerar pág.</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-neutral-800 bg-neutral-950 space-y-3">
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
            Se o PDF não gerar, abra o aplicativo em uma Nova Guia (ícone no topo direito) devido ao bloqueio de segurança.
          </p>
        </div>
      </div>

      {/* Main Content (WYSIWYG Print Area) */}
      <div className="flex-1 p-8 h-screen overflow-y-auto main-print-area custom-scrollbar relative">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
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

