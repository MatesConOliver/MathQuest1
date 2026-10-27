import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Root directory for public assets
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const ASSETS_ROOT = path.join(PUBLIC_DIR, 'Assets');

// Helper to sanitize and validate folder path to prevent path traversal
function getSafeFolderPath(subPath: string): string {
  // Normalize and remove leading slashes
  const cleanSubPath = subPath.replace(/^(\/|\\)+/, '').replace(/(\.\.[\/\\])+/g, '');
  const resolved = path.join(PUBLIC_DIR, cleanSubPath);

  // Security check: must reside inside ASSETS_ROOT
  if (!resolved.startsWith(ASSETS_ROOT)) {
    throw new Error('Access denied: target path must be inside /public/Assets');
  }

  return resolved;
}

// Allowed image extensions
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.bmp', '.ico']);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    // Action 1: Get counts for all known folders
    if (action === 'summary') {
      const summary: Record<string, number> = {};

      // Check Location 1 through 16
      for (let i = 1; i <= 16; i++) {
        const folderKey = `Assets/Location specific/location ${i}`;
        const folderPath = path.join(PUBLIC_DIR, folderKey);
        try {
          const files = await fs.readdir(folderPath);
          summary[folderKey] = files.filter((f) => !f.startsWith('.')).length;
        } catch {
          summary[folderKey] = 0;
        }
      }

      // Check General folders
      const generals = ['gear', 'consumables', 'others'];
      for (const g of generals) {
        const folderKey = `Assets/General/${g}`;
        const folderPath = path.join(PUBLIC_DIR, folderKey);
        try {
          const files = await fs.readdir(folderPath);
          summary[folderKey] = files.filter((f) => !f.startsWith('.')).length;
        } catch {
          summary[folderKey] = 0;
        }
      }

      return NextResponse.json({ success: true, summary });
    }

    // Action 2: List files in a specified folder
    const targetFolder = searchParams.get('folder') || 'Assets/Location specific/location 2';
    const folderPath = getSafeFolderPath(targetFolder);

    // Ensure directory exists
    await fs.mkdir(folderPath, { recursive: true });

    const dirEntries = await fs.readdir(folderPath, { withFileTypes: true });

    const files = await Promise.all(
      dirEntries
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map(async (entry) => {
          const filePath = path.join(folderPath, entry.name);
          const stat = await fs.stat(filePath);
          const ext = path.extname(entry.name).toLowerCase();
          const relativeWebPath = `/${path.relative(PUBLIC_DIR, filePath).replace(/\\/g, '/')}`;

          return {
            name: entry.name,
            path: relativeWebPath,
            size: stat.size,
            sizeFormatted: formatBytes(stat.size),
            modifiedAt: stat.mtime.toISOString(),
            isImage: IMAGE_EXTENSIONS.has(ext),
            extension: ext,
          };
        })
    );

    return NextResponse.json({
      success: true,
      folder: targetFolder,
      files,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const targetFolder = (formData.get('folder') as string) || 'Assets/Location specific/location 2';
    const customName = formData.get('customName') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const folderPath = getSafeFolderPath(targetFolder);
    await fs.mkdir(folderPath, { recursive: true });

    // Determine filename
    const originalExt = path.extname(file.name).toLowerCase();
    let safeBaseName = (customName && customName.trim() !== '') ? customName.trim() : path.basename(file.name, originalExt);

    // Sanitize base name (alphanumeric, dashes, underscores, spaces)
    safeBaseName = safeBaseName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
    if (!safeBaseName) safeBaseName = 'asset';

    // If customName doesn't already end with extension, append original extension
    const finalExt = path.extname(safeBaseName).toLowerCase() ? '' : originalExt;
    const finalFilename = `${safeBaseName}${finalExt}`;

    const filePath = path.join(folderPath, finalFilename);
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    await fs.writeFile(filePath, buffer);

    const relativeWebPath = `/${path.relative(PUBLIC_DIR, filePath).replace(/\\/g, '/')}`;

    return NextResponse.json({
      success: true,
      file: {
        name: finalFilename,
        path: relativeWebPath,
        size: buffer.length,
        sizeFormatted: formatBytes(buffer.length),
      },
    });
  } catch (err: unknown) {
    const isErofs =
      err &&
      typeof err === 'object' &&
      ('code' in err && (err as { code: string }).code === 'EROFS' ||
       'message' in err && typeof (err as { message: string }).message === 'string' &&
       (err as { message: string }).message.includes('read-only file system'));

    if (isErofs) {
      return NextResponse.json(
        {
          success: false,
          isReadOnly: true,
          error:
            'Serverless environment has a read-only filesystem (/var/task). Please upload directly to Firebase Storage using the Cloud storage option in the panel.',
        },
        { status: 403 }
      );
    }

    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const folder = searchParams.get('folder');
    const filename = searchParams.get('filename');

    if (!folder || !filename) {
      return NextResponse.json({ success: false, error: 'Missing folder or filename' }, { status: 400 });
    }

    // Do not allow deleting .gitkeep
    if (filename.startsWith('.')) {
      return NextResponse.json({ success: false, error: 'System files cannot be deleted' }, { status: 400 });
    }

    const folderPath = getSafeFolderPath(folder);
    const filePath = path.join(folderPath, filename);

    await fs.unlink(filePath);

    return NextResponse.json({ success: true, message: `Deleted ${filename}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}

function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
