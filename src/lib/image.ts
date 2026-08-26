import exifr from 'exifr';
import { Photo, PrintQualityPreset } from '../types';

export function getQualityConfig(qualityPreset: PrintQualityPreset = '300dpi'): { maxDimension: number; quality: number; label: string } {
  switch (qualityPreset) {
    case 'ultra':
      // 2400px, JPEG 0.92 (~600-800KB/foto -> ~45-65MB PDF para 62 fotos)
      return { maxDimension: 2400, quality: 0.92, label: '300+ DPI' };
    case 'compact':
      // 1200px, JPEG 0.75 (~150-220KB/foto -> ~10-16MB PDF para 62 fotos)
      return { maxDimension: 1200, quality: 0.75, label: '150 DPI' };
    case 'screen':
      // 900px, JPEG 0.65 (~50-80KB/foto -> ~4-6MB PDF para 62 fotos)
      // Ideal para visualização em telas de computadores, tablets e smartphones (100 DPI)
      return { maxDimension: 900, quality: 0.65, label: '100 DPI' };
    case 'screen_72dpi':
      // 640px, JPEG 0.52 (~25-45KB/foto -> ~2-3.5MB PDF para 62 fotos)
      // Padrão 72 DPI ultracompacto para envio instantâneo e web leve
      return { maxDimension: 640, quality: 0.52, label: '72 DPI' };
    case '300dpi':
    default:
      // 1800px, JPEG 0.85 (~300-450KB/foto -> ~20-35MB PDF para 62 fotos)
      // Ideal para impressão gráfica em papel A4 a 300 DPI nítidos
      return { maxDimension: 1800, quality: 0.85, label: '300 DPI' };
  }
}

/**
 * Normaliza e comprime a imagem para padrão JPEG 300 DPI de alta fidelidade.
 * Converte qualquer formato (PNG, WEBP, TIFF, HEIC/JPEG pesado) para JPEG limpo
 * renderizado com fundo branco e antialiasing, garantindo que o driver de PDF
 * incorpore streams JPEG nativos leves em vez de bitmaps descompactados de 1GB.
 */
export async function optimizeImageBlob(
  blob: Blob, 
  maxDimension: number = 1800, 
  quality: number = 0.85
): Promise<Blob> {
  // SVG pequeno pode ser mantido se for vetor puro
  if (blob.type === 'image/svg+xml' && blob.size < 100 * 1024) {
    return blob;
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(blob);
        return;
      }

      // Fundo branco limpo para remover canais alpha pesados que inflam o PDF
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((resizedBlob) => {
        if (resizedBlob) {
          resolve(resizedBlob);
        } else {
          resolve(blob);
        }
      }, 'image/jpeg', quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };

    img.src = url;
  });
}

/**
 * Otimiza uma foto a partir de sua URL (Object URL ou Data URL)
 */
export async function optimizePhotoUrl(
  imageUrl: string, 
  maxDimension: number = 1800, 
  quality: number = 0.85
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageUrl);
        return;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          resolve(imageUrl);
        }
      }, 'image/jpeg', quality);
    };

    img.onerror = () => {
      resolve(imageUrl);
    };

    img.src = imageUrl;
  });
}

export async function loadPhoto(file: File, qualityPreset: PrintQualityPreset = '300dpi'): Promise<Photo> {
  let description = '';
  
  try {
    const exif = await exifr.parse(file, { tiff: true, xmp: true, iptc: true });
    if (exif) {
      // Try to find the most relevant description field
      description = exif.ImageDescription || exif.Description || exif.XPTitle || exif.Title || exif.ObjectName || '';
      
      // Sometimes it's an array or object
      if (typeof description !== 'string') {
        description = String(description);
      }
    }
  } catch (e) {
    console.error('Failed to parse EXIF for', file.name, e);
  }

  // Otimiza o blob da imagem para padrão 300 DPI gráfico
  const { maxDimension, quality } = getQualityConfig(qualityPreset);
  let finalBlob: Blob;
  try {
    finalBlob = await optimizeImageBlob(file, maxDimension, quality);
  } catch (err) {
    console.warn('Não foi possível otimizar imagem ao carregar, usando original:', err);
    finalBlob = file;
  }

  const url = URL.createObjectURL(finalBlob);
  return {
    id: crypto.randomUUID(),
    url,
    filename: file.name,
    description: description.trim(),
    fit: 'contain',
    objectPosition: 'center',
    isFullWidth: false
  };
}

export function rotateImage(imageUrl: string, degrees: number = 90, qualityPreset: PrintQualityPreset = '300dpi'): Promise<string> {
  const { quality } = getQualityConfig(qualityPreset);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('No canvas context'));

      if (degrees === 90 || degrees === 270) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          reject(new Error('Blob creation failed'));
        }
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

