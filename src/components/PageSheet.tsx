import { useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { Trash2 } from 'lucide-react';
import { SortablePhoto } from './SortablePhoto';
import { PageData, ReportSettings, Photo } from '../types';

interface PageSheetProps {
  page: PageData;
  pageIndex: number;
  globalStartIndex: number;
  settings: ReportSettings;
  onUpdatePhoto: (id: string, updates: Partial<Photo>) => void;
  onDeletePhoto: (id: string) => void;
  onRotatePhoto: (id: string) => void;
  onRemovePage: (id: string) => void;
}

export function PageSheet({ 
  page, pageIndex, globalStartIndex, settings, 
  onUpdatePhoto, onDeletePhoto, onRotatePhoto, onRemovePage 
}: PageSheetProps) {
  const { setNodeRef, isOver } = useDroppable({ id: page.id });

  const gridColsClass = settings.columns === 1 ? 'grid-cols-1' :
                        settings.columns === 2 ? 'grid-cols-2' :
                        settings.columns === 3 ? 'grid-cols-3' : 'grid-cols-4';

  return (
    <div
      ref={setNodeRef}
      className={`page-sheet bg-white text-black mx-auto mb-12 shadow-2xl relative flex flex-col ${isOver && page.photos.length === 0 ? 'ring-2 ring-indigo-500' : ''}`}
      style={{
         width: '100%',
         maxWidth: settings.orientation === 'portrait' ? '800px' : '1131px',
         aspectRatio: settings.paperSize === 'A4'
           ? (settings.orientation === 'portrait' ? '210/297' : '297/210')
           : (settings.orientation === 'portrait' ? '8.5/11' : '11/8.5'),
         padding: '1.5cm'
      }}
    >
      <button 
        onClick={() => onRemovePage(page.id)} 
        className="absolute top-4 right-4 no-print text-red-500 hover:text-red-700 hover:bg-red-50 bg-white p-2 rounded-full shadow-md z-50 transition-colors"
        title="Remover Página"
      >
        <Trash2 size={20} />
      </button>

      {/* Page Title (Only on the first page, if configured) */}
      {pageIndex === 0 && settings.title && (
        <h1 
          className="font-bold mb-6 text-left shrink-0 w-full"
          style={{ fontFamily: settings.fontFamily, fontSize: `${settings.titleFontSize}px` }}
        >
          {settings.title}
        </h1>
      )}

      {/* Empty State visual hint */}
      {page.photos.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center no-print pointer-events-none">
          <p className="text-neutral-400 font-medium text-lg border-2 border-dashed border-neutral-200 rounded-xl p-8">
            Página Vazia. Arraste fotos para cá.
          </p>
        </div>
      )}

      <SortableContext id={page.id} items={page.photos.map(p => p.id)} strategy={rectSortingStrategy}>
         <div className={`grid gap-6 flex-1 h-full w-full ${gridColsClass} auto-rows-fr`}>
           {page.photos.map((photo, i) => (
             <SortablePhoto
                key={photo.id}
                photo={photo}
                globalIndex={globalStartIndex + i}
                settings={settings}
                onUpdate={onUpdatePhoto}
                onDelete={onDeletePhoto}
                onRotate={onRotatePhoto}
             />
           ))}
         </div>
      </SortableContext>

      {/* Page Numbering */}
      {settings.showPageNum && (
        <div className="absolute bottom-4 right-8 text-sm" style={{ fontFamily: settings.fontFamily }}>
          Página {settings.startPageNum + pageIndex}
        </div>
      )}
    </div>
  );
}
