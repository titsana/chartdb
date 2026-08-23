import { useChartDB } from '@/hooks/use-chartdb';
import { useConfig } from '@/hooks/use-config';
import { useDialog } from '@/hooks/use-dialog';
import { useFullScreenLoader } from '@/hooks/use-full-screen-spinner';
import { useStorage } from '@/hooks/use-storage';
import { useToast } from '@/components/toast/use-toast';
import type { Diagram } from '@/lib/domain/diagram';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export const useDiagramLoader = () => {
    const [initialDiagram, setInitialDiagram] = useState<Diagram | undefined>();
    const { diagramId } = useParams<{ diagramId: string }>();
    const { config } = useConfig();
    const { loadDiagram, currentDiagram } = useChartDB();
    const { showLoader, hideLoader } = useFullScreenLoader();
    const { openCreateDiagramDialog, openOpenDiagramDialog } = useDialog();
    const navigate = useNavigate();
    const { listDiagrams } = useStorage();
    const { toast } = useToast();

    const currentDiagramLoadingRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (!config) {
            return;
        }

        if (currentDiagram?.id === diagramId) {
            return;
        }

        const loadDefaultDiagram = async () => {
            // Bug found via manual disconnect testing: the REST calls below
            // (loadDiagram/listDiagrams) hit the collab server; a killed/
            // unreachable server used to leave `showLoader()`'s full-screen
            // dialog stuck open forever, since nothing here caught the
            // rejection or guaranteed `hideLoader()` ran. try/finally
            // instead of the previous "hideLoader() on every return path"
            // — a thrown error skipped all of those. apiFetch itself also
            // now has a timeout (storage-provider.tsx) so a hung socket
            // can't stall this indefinitely either.
            try {
                if (diagramId) {
                    setInitialDiagram(undefined);
                    showLoader();
                    // No resetRedoStack()/resetUndoStack() needed —
                    // loadDiagram below ends up in loadDiagramFromData,
                    // which builds a fresh Y.UndoManager with empty
                    // stacks for every diagram it loads.
                    const diagram = await loadDiagram(diagramId);
                    if (!diagram) {
                        openOpenDiagramDialog({ canClose: false });
                        return;
                    }

                    setInitialDiagram(diagram);

                    return;
                } else if (!diagramId && config.defaultDiagramId) {
                    const diagram = await loadDiagram(config.defaultDiagramId);
                    if (diagram) {
                        navigate(`/diagrams/${config.defaultDiagramId}`);

                        return;
                    }
                }
                const diagrams = await listDiagrams();

                if (diagrams.length > 0) {
                    openOpenDiagramDialog({ canClose: false });
                } else {
                    openCreateDiagramDialog();
                }
            } catch {
                toast({
                    title: 'Could not load diagram',
                    description:
                        "Couldn't reach the server. Check your connection and try again.",
                    variant: 'destructive',
                });
            } finally {
                hideLoader();
            }
        };

        if (
            currentDiagramLoadingRef.current === (diagramId ?? '') &&
            currentDiagramLoadingRef.current !== undefined
        ) {
            return;
        }
        currentDiagramLoadingRef.current = diagramId ?? '';

        loadDefaultDiagram();
    }, [
        diagramId,
        openCreateDiagramDialog,
        config,
        navigate,
        listDiagrams,
        loadDiagram,
        hideLoader,
        showLoader,
        currentDiagram?.id,
        openOpenDiagramDialog,
        toast,
    ]);

    return { initialDiagram };
};
