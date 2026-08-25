import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RotateCw, Trash2, GripVertical, Maximize, Minimize, StretchHorizontal, Shrink } from "lucide-react";
import { Photo, ReportSettings, AnchorPosition } from "../types";
import { cn } from "../lib/utils";

const ANCHOR_POSITIONS: { value: AnchorPosition; label: string; row: number; col: number }[] = [
  { value: 'center', label: 'Centro', row: 1, col: 1 },
  { value: 'top left', label: 'Superior Esquerdo', row: 0, col: 0 },
  { value: 'top', label: 'Superior Central', row: 0, col: 1 },
  { value: 'top right', label: 'Superior Direito', row: 0, col: 2 },
  { value: 'right', label: 'Centro Direito', row: 1, col: 2 },
  { value: 'bottom right', label: 'Inferior Direito', row: 2, col: 2 },
  { value: 'bottom', label: 'Inferior Central', row: 2, col: 1 },
  { value: 'bottom left', label: 'Inferior Esquerdo', row: 2, col: 0 },
  { value: 'left', label: 'Centro Esquerdo', row: 1, col: 0 },
];

interface SortablePhotoProps {
  key?: string;
  photo: Photo;
  globalIndex: number;
  settings: ReportSettings;
  onUpdate: (id: string, updates: Partial<Photo>) => void;
  onDelete: (id: string) => void;
  onRotate: (id: string) => void;
}

export function SortablePhoto({ photo, globalIndex, settings, onUpdate, onDelete, onRotate }: SortablePhotoProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : 1,
  };

  const currentAnchor = ANCHOR_POSITIONS.find(p => p.value === (photo.objectPosition || 'center')) || ANCHOR_POSITIONS[0];

  const handleNextAnchor = () => {
    const currentIndex = ANCHOR_POSITIONS.findIndex(p => p.value === (photo.objectPosition || 'center'));
    const nextIndex = (currentIndex + 1) % ANCHOR_POSITIONS.length;
    onUpdate(photo.id, { objectPosition: ANCHOR_POSITIONS[nextIndex].value });
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "relative group flex flex-col h-full w-full min-h-0 select-none cursor-grab active:cursor-grabbing touch-none transition-shadow",
        photo.isFullWidth && "col-span-full",
        isDragging && "opacity-30 ring-2 ring-blue-500 rounded-lg shadow-xl"
      )}
    >
      {/* Overlay controls - Hidden when printing */}
      <div 
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 z-30 no-print transition-opacity cursor-default"
      >
        <button 
          onClick={() => onUpdate(photo.id, { isFullWidth: !photo.isFullWidth })} 
          className="p-1.5 bg-neutral-800/90 hover:bg-neutral-900 text-white rounded shadow-sm transition-colors" 
          title={photo.isFullWidth ? "Tamanho Normal" : "Ocupar Linha Inteira"}
        >
          {photo.isFullWidth ? <Shrink size={16} /> : <StretchHorizontal size={16} />}
        </button>
        <button 
          onClick={() => onUpdate(photo.id, { fit: photo.fit === 'contain' ? 'cover' : 'contain' })} 
          className="p-1.5 bg-neutral-800/90 hover:bg-neutral-900 text-white rounded shadow-sm transition-colors" 
          title={photo.fit === 'contain' ? "Preencher Espaço" : "Ajustar à Imagem"}
        >
          {photo.fit === 'contain' ? <Maximize size={16} /> : <Minimize size={16} />}
        </button>
        <button 
          onClick={handleNextAnchor} 
          className="p-1.5 bg-neutral-800/90 hover:bg-neutral-900 text-white rounded shadow-sm flex items-center justify-center transition-colors" 
          title={`Ponto de Ancoragem: ${currentAnchor.label} (Clique para alternar entre os 9 pontos)`}
        >
          <div className="grid grid-cols-3 gap-[2px] w-3.5 h-3.5 items-center justify-center pointer-events-none">
            {[0, 1, 2].map((r) =>
              [0, 1, 2].map((c) => {
                const isActive = currentAnchor.row === r && currentAnchor.col === c;
                return (
                  <div
                    key={`${r}-${c}`}
                    className={cn(
                      "w-1 h-1 rounded-full transition-colors",
                      isActive ? "bg-amber-400 ring-[1px] ring-amber-300" : "bg-neutral-500/70"
                    )}
                  />
                );
              })
            )}
          </div>
        </button>
        <button 
          onClick={() => onRotate(photo.id)} 
          className="p-1.5 bg-neutral-800/90 hover:bg-neutral-900 text-white rounded shadow-sm transition-colors" 
          title="Girar"
        >
          <RotateCw size={16} />
        </button>
        <button 
          onClick={() => onDelete(photo.id)} 
          className="p-1.5 bg-red-600/90 hover:bg-red-700 text-white rounded shadow-sm transition-colors" 
          title="Excluir"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Image Display */}
      <div className="flex-1 min-h-0 relative mb-3 flex items-center justify-center bg-transparent pointer-events-none">
        <img
          src={photo.url}
          alt={photo.filename}
          draggable={false}
          className="w-full h-full select-none pointer-events-none rounded-sm"
          style={{ 
            objectFit: photo.fit,
            objectPosition: photo.objectPosition || 'center'
          }}
        />
      </div>

      {/* Caption Editor */}
      <div 
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
        className="shrink-0 flex flex-row items-baseline justify-start gap-1 w-full px-2 text-black leading-snug cursor-text" 
        style={{ fontFamily: settings.fontFamily, fontSize: `${settings.captionFontSize}px` }}
      >
        {settings.numberImages && (
          <span className="whitespace-nowrap font-medium select-none">
            Imagem {globalIndex} {photo.description ? '-' : ''}
          </span>
        )}
        <textarea
          value={photo.description}
          onChange={(e) => onUpdate(photo.id, { description: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
          onKeyUp={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex-1 bg-transparent border-b border-transparent hover:border-neutral-300 focus:border-blue-500 outline-none resize-none min-h-[30px] print:border-none print:resize-none overflow-hidden p-0 m-0 leading-snug"
          style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
          placeholder="Adicionar legenda..."
          rows={Math.max(1, photo.description.split('\n').length)}
        />
      </div>
    </div>
  );
}
