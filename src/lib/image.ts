import exifr from 'exifr';
import { Photo } from '../types';

/**
 * Reduz e otimiza imagens muito grandes para relatório (máx 2048px, JPEG 0.88),
 * evitando estouro de memória no navegador e arquivos JSON gigantescos (200MB+).
 */
export async function optimizeImageBlob(blob: Blob, maxDimension: number = 2048, quality: number = 0.88): Promise<Blob> {
  // Se for SVG ou já for muito pequeno (< 350KB), não precisa reprocessar
  if (blob.type === 'image/svg+xml' || blob.size < 350 * 1024) {
    return blob;
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // Se a imagem já for menor que a dimensão máxima e tiver tamanho razoável (< 700KB)
      if (width <= maxDimension && height <= maxDimension && blob.size < 700 * 1024) {
        resolve(blob);
        return;
      }

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

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((resizedBlob) => {
        if (resizedBlob && resizedBlob.size < blob.size) {
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

export async function loadPhoto(file: File): Promise<Photo> {
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

  // Otimiza o blob da imagem para manter o uso de memória leve e exportações rápidas
  let finalBlob: Blob;
  try {
    finalBlob = await optimizeImageBlob(file, 2048, 0.88);
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

export function rotateImage(imageUrl: string, degrees: number = 90): Promise<string> {
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
      }, 'image/jpeg', 0.90);
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

