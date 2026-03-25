const MAX_EXPORT_W = 1750;
const MAX_EXPORT_H = 1340;

/** Scales a PNG data URL down to fit within MAX_EXPORT_W × MAX_EXPORT_H, preserving aspect ratio. */
export async function resizeIfNeeded(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= MAX_EXPORT_W && img.height <= MAX_EXPORT_H) {
        resolve(url);
        return;
      }
      const scale = Math.min(MAX_EXPORT_W / img.width, MAX_EXPORT_H / img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = url;
  });
}
