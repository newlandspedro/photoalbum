import exifr from 'exifr';
import { Photo } from '../types';

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

  const url = URL.createObjectURL(file);
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

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(URL.createObjectURL(blob));
        } else {
          reject(new Error('Blob creation failed'));
        }
      }, 'image/jpeg', 0.95);
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}
