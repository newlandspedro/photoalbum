export type AnchorPosition =
  | 'center'
  | 'top left'
  | 'top'
  | 'top right'
  | 'right'
  | 'bottom right'
  | 'bottom'
  | 'bottom left'
  | 'left';

export interface Photo {
  id: string;
  url: string;
  filename: string;
  description: string;
  fit: 'contain' | 'cover';
  objectPosition?: AnchorPosition;
  isFullWidth: boolean;
}

export interface PageData {
  id: string;
  photos: Photo[];
}

export interface ReportSettings {
  paperSize: 'A4' | 'letter';
  orientation: 'portrait' | 'landscape';
  columns: number;
  fontFamily: string;
  titleFontSize: number;
  captionFontSize: number;
  startPageNum: number;
  showPageNum: boolean;
  title: string;
  numberImages: boolean;
  startingImageNumber: number;
}
