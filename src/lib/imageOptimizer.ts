/**
 * Client-side image optimizer for game icons and UI assets.
 * Automatically downscales large images to max dimensions (default 128x128px)
 * while preserving aspect ratio, alpha transparency, and sharp edge rendering.
 */
export async function optimizeIconImage(
  file: File,
  maxDimension: number = 128
): Promise<{ file: File; width: number; height: number; originalSize: number; optimizedSize: number }> {
  // If SVG, keep original format as it is already vector and lightweight
  if (file.type === 'image/svg+xml') {
    return {
      file,
      width: maxDimension,
      height: maxDimension,
      originalSize: file.size,
      optimizedSize: file.size,
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // If image is already within max dimensions, keep original dimensions or downscale
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
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context for image optimization'));
        }

        // Enable high-quality image smoothing for downscaled icons
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw image onto transparent canvas
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to PNG with alpha transparency
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('Canvas image optimization failed to generate blob'));
            }

            const optimizedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".png", {
              type: 'image/png',
              lastModified: Date.now(),
            });

            resolve({
              file: optimizedFile,
              width,
              height,
              originalSize: file.size,
              optimizedSize: optimizedFile.size,
            });
          },
          'image/png'
        );
      };

      img.onerror = () => reject(new Error('Could not load image for optimization'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });
}
