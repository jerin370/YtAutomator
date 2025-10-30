export enum AppStep {
  GENERATE_SCRIPT = 1,
  CREATE_VIDEO = 2,
  UPLOAD_VIDEO = 3,
}

export interface VisualAsset {
  name: string;
  dataUrl: string;
}

export interface VideoDetails {
  title: string;
  description: string;
  tags: string[];
  visuals: VisualAsset[];
  voice: string;
  audioDataUrl: string | null;
  script: string;
  youtubeVideoId?: string;
}