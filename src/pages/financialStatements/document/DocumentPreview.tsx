import { useEffect, useMemo, useState } from 'react';
import type { DocumentModel } from '../../../lib/financialStatements/document/documentModel';
import type { DocOverrides } from '../../../lib/financialStatements/document/documentStore';
import {
  generateWorkspaceAfsPdf,
  workspacePdfToBytes,
} from '../../../lib/financialStatements/publication/afsWorkspacePdf';
import { corporateFilenameSlug } from '../../../lib/financialStatements/corporateInformation/accessors';
import { Button } from '../../../components/ui/button';
import { showError, showSuccess } from '../../../utils/toast';
import { Download } from 'lucide-react';
import { useEnterpriseMateriality } from '../../../hooks/useEnterpriseMateriality';

/**
 * Live preview + on-demand PDF. Both are produced by the SAME builder
 * (`generateWorkspaceAfsPdf`), so what is previewed is byte-identical to what is
 * downloaded, and a PDF can be generated at any point in the engagement.
 */
export default function DocumentPreview({
  model,
  overrides,
}: {
  model: DocumentModel;
  overrides: DocOverrides;
}) {
  const { options: materialityOptions } = useEnterpriseMateriality(model.companyId);
  const pdfString = useMemo(() => {
    try {
      return generateWorkspaceAfsPdf(model, overrides, materialityOptions);
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error('[efs] workspace preview build failed', e);
      }
      return null;
    }
  }, [model, overrides, materialityOptions]);

  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfString) {
      setUrl(null);
      return;
    }
    const blob = new Blob([workspacePdfToBytes(pdfString)], { type: 'application/pdf' });
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pdfString]);

  const download = () => {
    if (!pdfString) {
      showError('The document could not be generated.');
      return;
    }
    const blob = new Blob([workspacePdfToBytes(pdfString)], { type: 'application/pdf' });
    const objectUrl = URL.createObjectURL(blob);
    const name = corporateFilenameSlug(model);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${name}.pdf`;
    a.click();
    URL.revokeObjectURL(objectUrl);
    showSuccess('PDF generated');
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Live preview — identical to the generated PDF.
        </p>
        <Button size="sm" onClick={download} disabled={!pdfString}>
          <Download className="mr-2 h-4 w-4" />
          Generate PDF
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border bg-muted/20">
        {url ? (
          <iframe title="Financial statement preview" src={url} className="h-[75vh] w-full" />
        ) : (
          <div className="flex h-[75vh] items-center justify-center text-sm text-muted-foreground">
            The document could not be rendered.
          </div>
        )}
      </div>
    </div>
  );
}
