import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { cn } from '../../lib/utils';
import type { EmployeeNumberingPolicy } from '../../lib/employeeIdentity';

type Props = {
  employeeNumber: string;
  qrStyle?: EmployeeNumberingPolicy['qr_style'];
  barcodeStyle?: EmployeeNumberingPolicy['barcode_style'];
  className?: string;
  showLabels?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

const qrSizes = { sm: 80, md: 120, lg: 160 };

/**
 * Platform QR + Code128 barcode for employee numbers.
 * Used on profiles, ID cards, asset assignment, attendance, etc.
 */
export function EmployeeCodes({
  employeeNumber,
  qrStyle = 'standard',
  barcodeStyle = 'code128',
  className,
  showLabels = true,
  size = 'md',
}: Props) {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const barcodeRef = useRef<SVGSVGElement>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    if (!qrCanvasRef.current || !employeeNumber) return;
    const dim = qrSizes[size];
    const options =
      qrStyle === 'minimal'
        ? { width: dim, margin: 1, color: { dark: '#000', light: '#fff' } }
        : qrStyle === 'branded'
          ? { width: dim, margin: 2, color: { dark: '#1e3a5f', light: '#fff' } }
          : { width: dim, margin: 2 };

    QRCode.toCanvas(qrCanvasRef.current, employeeNumber, options).catch((err) =>
      setQrError(String(err))
    );
  }, [employeeNumber, qrStyle, size]);

  useEffect(() => {
    if (!barcodeRef.current || !employeeNumber) return;
    try {
      JsBarcode(barcodeRef.current, employeeNumber, {
        format: barcodeStyle === 'code39' ? 'CODE39' : 'CODE128',
        displayValue: true,
        fontSize: size === 'sm' ? 10 : 12,
        height: size === 'sm' ? 40 : size === 'lg' ? 70 : 55,
        margin: 8,
      });
    } catch {
      /* invalid chars for symbology */
    }
  }, [employeeNumber, barcodeStyle, size]);

  if (!employeeNumber) return null;

  return (
    <div className={cn('flex flex-col items-center gap-4', className)}>
      <div className="flex flex-col items-center gap-1">
        {showLabels && <span className="text-xs font-medium text-muted-foreground">QR Code</span>}
        {qrError ? (
          <span className="text-xs text-destructive">QR unavailable</span>
        ) : (
          <canvas ref={qrCanvasRef} className="rounded border bg-white" />
        )}
      </div>
      <div className="flex flex-col items-center gap-1 w-full max-w-xs">
        {showLabels && <span className="text-xs font-medium text-muted-foreground">Barcode</span>}
        <svg ref={barcodeRef} className="w-full" />
      </div>
      <p className="font-mono text-sm font-medium">{employeeNumber}</p>
    </div>
  );
}

export async function generateEmployeeQrDataUrl(
  employeeNumber: string,
  width = 120
): Promise<string> {
  return QRCode.toDataURL(employeeNumber, { width, margin: 2 });
}
