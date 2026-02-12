import { useState, type RefObject } from 'react';
import { Check, Copy } from 'lucide-react';
import { toPng } from 'html-to-image';
import { Button } from './Button';

type CopyVisualButtonProps = {
  targetRef: RefObject<HTMLElement>;
  label: string;
};

const COPY_CONTROL_CLASS = 'copy-visual-control';

async function appendUrlFooter(dataUrl: string, sourceUrl: string): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load captured image'));
    img.src = dataUrl;
  });

  const footerHeight = 36;
  const paddingX = 14;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height + footerHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas context unavailable');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0);

  context.fillStyle = '#f9fafb';
  context.fillRect(0, image.height, canvas.width, footerHeight);
  context.strokeStyle = '#e5e7eb';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, image.height + 0.5);
  context.lineTo(canvas.width, image.height + 0.5);
  context.stroke();

  context.fillStyle = '#6b7280';
  context.font = '12px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  context.textBaseline = 'middle';
  const textY = image.height + footerHeight / 2;
  context.fillText(sourceUrl, paddingX, textY);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new Error('Failed to build image blob');
  }
  return blob;
}

export function CopyVisualButton({ targetRef, label }: CopyVisualButtonProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [isCopying, setIsCopying] = useState(false);

  const handleCopy = async () => {
    const target = targetRef.current;
    if (!target || isCopying) return;

    setIsCopying(true);
    setStatus('idle');

    try {
      const dataUrl = await toPng(target, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        filter: (node) => {
          if (!(node instanceof Element)) return true;
          return !node.classList.contains(COPY_CONTROL_CLASS);
        },
      });
      const blob = await appendUrlFooter(dataUrl, window.location.href);

      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
        throw new Error('Clipboard image copy is not supported in this browser');
      }

      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob,
        }),
      ]);

      setStatus('copied');
      window.setTimeout(() => setStatus('idle'), 1800);
    } catch {
      setStatus('error');
      window.setTimeout(() => setStatus('idle'), 2200);
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      onClick={() => void handleCopy()}
      aria-label={`Copy ${label} as image`}
      title={
        status === 'copied'
          ? `Copied ${label}`
          : status === 'error'
            ? `Failed to copy ${label}`
            : `Copy ${label} as image`
      }
      className={`h-8 w-8 min-h-0 min-w-0 rounded-md p-0 ${COPY_CONTROL_CLASS}`}
    >
      {status === 'copied' ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className={`h-4 w-4 ${status === 'error' ? 'text-red-600' : 'text-gray-700'}`} />
      )}
    </Button>
  );
}
