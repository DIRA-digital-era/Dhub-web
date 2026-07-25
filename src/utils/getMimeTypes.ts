// utils/getMimeType.ts
export function getMimeType(filename: string): 'image/jpeg' | 'image/png' | 'video/mp4' | string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}
