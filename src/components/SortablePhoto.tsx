import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RotateCw, Trash2, GripVertical, Maximize, Minimize, StretchHorizontal, Shrink } from "lucide-react";
import { Photo, ReportSettings } from "../types";
import { cn } from "../lib/utils";

interface SortablePhotoProps {
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
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative group flex flex-col h-full w-full min-h-0",
        photo.isFullWidth && "col-span-full",
        isDragging && "opacity-50 ring-2 ring-indigo-500 rounded-lg shadow-xl"
      )}
    >
      {/* Overlay controls - Hidden when printing */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 z-10 no-print transition-opacity">
        <div {...attributes} {...listeners} className="p-1.5 bg-neutral-800/80 hover:bg-neutral-900 text-white rounded cursor-grab shadow-sm">
          <GripVertical size={16} />
        </div>
        <button 
          onClick={() => onUpdate(photo.id, { isFullWidth: !photo.isFullWidth })} 
          className="p-1.5 bg-neutral-800/80 hover:bg-neutral-900 text-white rounded shadow-sm" 
          title={photo.isFullWidth ? "Tamanho Normal" : "Ocupar Linha Inteira"}
        >
          {photo.isFullWidth ? <Shrink size={16} /> : <StretchHorizontal size={16} />}
        </button>
        <button 
          onClick={() => onUpdate(photo.id, { fit: photo.fit === 'contain' ? 'cover' : 'contain' })} 
          className="p-1.5 bg-neutral-800/80 hover:bg-neutral-900 text-white rounded shadow-sm" 
          title={photo.fit === 'contain' ? "Preencher Espaço" : "Ajustar à Imagem"}
        >
          {photo.fit === 'contain' ? <Maximize size={16} /> : <Minimize size={16} />}
        </button>
        <button onClick={() => onRotate(photo.id)} className="p-1.5 bg-neutral-800/80 hover:bg-neutral-900 text-white rounded shadow-sm" title="Girar">
          <RotateCw size={16} />
        </button>
        <button onClick={() => onDelete(photo.id)} className="p-1.5 bg-red-600/90 hover:bg-red-700 text-white rounded shadow-sm" title="Excluir">
          <Trash2 size={16} />
        </button>
      </div>

      {/* Image Display */}
      <div className="flex-1 min-h-0 relative mb-3 flex items-center justify-center bg-transparent">
        <img
          src={photo.url}
          alt={photo.filename}
          className="w-full h-full select-none pointer-events-none"
          style={{ objectFit: photo.fit }}
        />
      </div>

      {/* Caption Editor */}
      <div className="shrink-0 flex flex-row items-baseline justify-start gap-1 w-full px-2 text-black leading-snug" style={{ fontFamily: settings.fontFamily, fontSize: `${settings.captionFontSize}px` }}>
        {settings.numberImages && (
          <span className="whitespace-nowrap font-medium">
            Imagem {globalIndex} {photo.description ? '-' : ''}
          </span>
        )}
        <textarea
          value={photo.description}
          onChange={(e) => onUpdate(photo.id, { description: e.target.value })}
          className="flex-1 bg-transparent border-b border-transparent hover:border-neutral-300 focus:border-blue-500 outline-none resize-none min-h-[30px] print:border-none print:resize-none overflow-hidden p-0 m-0 leading-snug"
          style={{ fontFamily: 'inherit', fontSize: 'inherit' }}
          placeholder="Adicionar legenda..."
          rows={Math.max(1, photo.description.split('\n').length)}
        />
      </div>
    </div>
  );
}
