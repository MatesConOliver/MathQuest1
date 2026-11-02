import { db } from '@/lib/firebase';
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

/**
 * GM assets stored as compact data URLs in Firestore (same approach as system icons).
 * Works on read-only serverless hosts and needs no Storage bucket/CORS setup.
 * Stored in the `locations` collection, which production rules already allow (signed-in read / GM write);
 * `system_settings` is not covered by the deployed rules. Location queries use orderBy('order'),
 * so these docs (no `order` field) never show up in location lists.
 */
const COLLECTION = 'locations';
const KIND = 'gm_asset';
// Firestore documents are capped at 1 MiB; keep headroom for the other fields.
const MAX_DATA_URL_CHARS = 900_000;

export interface CloudAssetFile {
  name: string;
  path: string;
  size: number;
  sizeFormatted: string;
  modifiedAt: string;
  isImage: boolean;
  extension: string;
  source: 'cloud';
}

export function formatAssetBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const docId = (folder: string, name: string) => `gmasset__${folder}__${name}`.replace(/\//g, '~');

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });

/** Downscales/recompresses an image until its data URL fits in a Firestore document. */
export async function imageToCompactDataUrl(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  if (original.length <= MAX_DATA_URL_CHARS && (file.type === 'image/svg+xml' || file.type === 'image/gif')) {
    return original;
  }
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    throw new Error('This SVG/GIF is too large to store (max ~650 KB). Use a PNG/JPG instead.');
  }

  const img = await loadImage(original);
  const isPhoto = file.type === 'image/jpeg';

  for (const maxDim of [1024, 768, 512, 384, 256]) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Untouched small files keep their original encoding.
    if (scale === 1 && original.length <= MAX_DATA_URL_CHARS) return original;

    const candidates = isPhoto
      ? [canvas.toDataURL('image/jpeg', 0.85)]
      : [canvas.toDataURL('image/png'), canvas.toDataURL('image/webp', 0.85)];
    const fit = candidates.find((c) => c.length <= MAX_DATA_URL_CHARS);
    if (fit) return fit;
  }
  throw new Error('Image is too large to store even after downscaling.');
}

export async function saveCloudAsset(folder: string, name: string, file: File): Promise<CloudAssetFile> {
  const dataUrl = await imageToCompactDataUrl(file);
  const size = Math.round((dataUrl.length * 3) / 4);
  await setDoc(doc(db, COLLECTION, docId(folder, name)), {
    kind: KIND,
    folder,
    name,
    dataUrl,
    size,
    updatedAt: serverTimestamp(),
  });
  return toAsset(name, dataUrl, size, new Date().toISOString());
}

function toAsset(name: string, dataUrl: string, size: number, modifiedAt: string): CloudAssetFile {
  const dot = name.lastIndexOf('.');
  return {
    name,
    path: dataUrl,
    size,
    sizeFormatted: formatAssetBytes(size),
    modifiedAt,
    isImage: true,
    extension: dot >= 0 ? name.slice(dot).toLowerCase() : '',
    source: 'cloud',
  };
}

export async function listCloudAssets(folder: string): Promise<CloudAssetFile[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where('kind', '==', KIND), where('folder', '==', folder))
  );
  return snap.docs
    .map((d) => {
      const data = d.data();
      const ts = data.updatedAt?.toDate?.();
      return toAsset(data.name, data.dataUrl, data.size || 0, ts ? ts.toISOString() : new Date(0).toISOString());
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

export async function deleteCloudAsset(folder: string, name: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, docId(folder, name)));
}

export async function countCloudAssets(folders: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    folders.map(async (folder) => {
      try {
        const snap = await getCountFromServer(
          query(collection(db, COLLECTION), where('kind', '==', KIND), where('folder', '==', folder))
        );
        return [folder, snap.data().count] as const;
      } catch {
        return [folder, 0] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}

/** Merges cloud assets over local ones; cloud wins on name clashes. */
export function mergeAssets<T extends { name: string }>(local: T[], cloud: T[]): T[] {
  const cloudNames = new Set(cloud.map((c) => c.name));
  return [...cloud, ...local.filter((l) => !cloudNames.has(l.name))];
}
