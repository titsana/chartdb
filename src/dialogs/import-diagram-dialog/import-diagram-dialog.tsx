import React, { useCallback, useEffect, useState } from 'react';
import { useDialog } from '@/hooks/use-dialog';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogInternalContent,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import type { BaseDialogProps } from '../common/base-dialog-props';
import { useTranslation } from 'react-i18next';
import { FileUploader } from '@/components/file-uploader/file-uploader';
import { useStorage } from '@/hooks/use-storage';
import { useNavigate } from 'react-router-dom';
import {
    mergeDiagrams,
    mergeDiagramsIntoExisting,
    parseDiagramJSON,
} from '@/lib/export-import-utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/alert/alert';
import { AlertCircle } from 'lucide-react';
import { ZodError } from 'zod';
import { useChartDB } from '@/hooks/use-chartdb';

export interface ImportDiagramDialogProps extends BaseDialogProps {
    // 'new' (default) creates a new diagram from the file(s), like Restore.
    // 'current' merges the file(s) into the diagram currently open in the editor.
    mode?: 'new' | 'current';
}

const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result;
            if (typeof result === 'string') {
                resolve(result);
            } else {
                reject(new Error('Could not read file'));
            }
        };
        reader.onerror = () =>
            reject(reader.error ?? new Error('Could not read file'));
        reader.readAsText(file);
    });

export const ImportDiagramDialog: React.FC<ImportDiagramDialogProps> = ({
    dialog,
    mode = 'new',
}) => {
    const { t } = useTranslation();
    const [files, setFiles] = useState<File[]>([]);
    const { addDiagram } = useStorage();
    const {
        currentDiagram,
        addTables,
        addRelationships,
        addDependencies,
        addAreas,
        addNotes,
        addCustomTypes,
    } = useChartDB();
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    const onFileChange = useCallback((files: File[]) => {
        setFiles(files);
    }, []);

    useEffect(() => {
        if (!dialog.open) return;
        setError(null);
        setFiles([]);
    }, [dialog.open]);
    const { closeImportDiagramDialog, closeCreateDiagramDialog } = useDialog();

    const handleImport = useCallback(async () => {
        if (files.length === 0) return;

        setError(null);

        // Read and validate each file individually, fail-fast, so a parse
        // error can be reported against the specific file that caused it.
        const parsedDiagrams = [];
        for (const file of files) {
            try {
                const json = await readFileAsText(file);
                parsedDiagrams.push(parseDiagramJSON(json));
            } catch (e) {
                const message =
                    e instanceof ZodError
                        ? e.issues
                              .map((issue) =>
                                  issue.path.length
                                      ? `${issue.path.join('.')}: ${issue.message}`
                                      : issue.message
                              )
                              .join(', ')
                        : e instanceof Error
                          ? e.message
                          : String(e);

                setError(
                    t('import_diagram_dialog.error.file_description', {
                        fileName: file.name,
                        message,
                    })
                );
                return;
            }
        }

        if (mode === 'current') {
            let merged;
            try {
                merged = mergeDiagramsIntoExisting(
                    currentDiagram,
                    parsedDiagrams
                );
            } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
                return;
            }

            await Promise.all([
                addTables(merged.tables),
                addRelationships(merged.relationships),
                addDependencies(merged.dependencies),
                addAreas(merged.areas),
                addNotes(merged.notes),
                addCustomTypes(merged.customTypes),
            ]);

            closeImportDiagramDialog();
            return;
        }

        let diagram;
        try {
            diagram = mergeDiagrams(parsedDiagrams);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            return;
        }

        await addDiagram({ diagram });

        closeImportDiagramDialog();
        closeCreateDiagramDialog();

        navigate(`/diagrams/${diagram.id}`);
    }, [
        files,
        mode,
        currentDiagram,
        addTables,
        addRelationships,
        addDependencies,
        addAreas,
        addNotes,
        addCustomTypes,
        addDiagram,
        navigate,
        closeImportDiagramDialog,
        closeCreateDiagramDialog,
        t,
    ]);

    return (
        <Dialog
            {...dialog}
            onOpenChange={(open) => {
                if (!open) {
                    closeImportDiagramDialog();
                }
            }}
        >
            <DialogContent className="flex max-h-screen flex-col" showClose>
                <DialogHeader>
                    <DialogTitle>
                        {mode === 'current'
                            ? t('import_diagram_dialog.title_current')
                            : t('import_diagram_dialog.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {mode === 'current'
                            ? t('import_diagram_dialog.description_current')
                            : t('import_diagram_dialog.description')}
                    </DialogDescription>
                </DialogHeader>
                <DialogInternalContent>
                    <div className="flex flex-col p-1">
                        <FileUploader
                            supportedExtensions={['.json']}
                            onFilesChange={onFileChange}
                            multiple
                        />
                        {error ? (
                            <Alert variant="destructive" className="mt-2">
                                <AlertCircle className="size-4" />
                                <AlertTitle>
                                    {t('import_diagram_dialog.error.title')}
                                </AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        ) : null}
                    </div>
                </DialogInternalContent>
                <DialogFooter className="flex gap-1 md:justify-between">
                    <DialogClose asChild>
                        <Button variant="secondary">
                            {t('import_diagram_dialog.cancel')}
                        </Button>
                    </DialogClose>
                    <Button
                        onClick={handleImport}
                        disabled={files.length === 0}
                    >
                        {t('import_diagram_dialog.import')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
