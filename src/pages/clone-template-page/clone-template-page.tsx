import { Spinner } from '@/components/spinner/spinner';
import React, { useCallback, useEffect, useRef } from 'react';
import { useLoaderData, useNavigate } from 'react-router-dom';
import type { TemplatePageLoaderData } from '../template-page/template-page';
import { convertTemplateToNewDiagram } from '@/templates-data/template-utils';
import type { Diagram } from '@/lib/domain/diagram';
import { useStorage } from '@/hooks/use-storage';
import { seedDiagramRoom } from '@/lib/collab/seed-diagram-room';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { StorageProvider } from '@/context/storage-context/storage-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';

export const CloneTemplateComponent: React.FC = () => {
    const navigate = useNavigate();
    const { addDiagram, deleteDiagram } = useStorage();
    const clonedBefore = useRef<boolean>(false);
    const data = useLoaderData() as TemplatePageLoaderData;

    const template = data.template;

    const cloneTemplate = useCallback(async () => {
        if (!template) {
            return;
        }

        if (clonedBefore.current) {
            return;
        }

        clonedBefore.current = true;
        const diagram = convertTemplateToNewDiagram(template);

        // Templates clone to a fixed id (see convertTemplateToNewDiagram) —
        // deleteDiagram clears out whatever an earlier clone of this same
        // template left behind (metadata row + its collab room, via the
        // server's FK cascade) so this clone starts from a clean room, not
        // a merge with stale content. storage-provider's deleteDiagram
        // treats "already gone" as success (see its own comment) — this is
        // expected to 404 on this template's very first clone.
        await deleteDiagram(diagram.id);

        const now = new Date();
        const diagramToAdd: Diagram = {
            ...diagram,
            createdAt: now,
            updatedAt: now,
        };

        // No ChartDBProvider in this page's tree (see CloneTemplatePage
        // below) — seedDiagramRoom pushes the template's content into the
        // collab room directly, independent of any provider, so the
        // EditorPage this navigates to can adopt it normally.
        await addDiagram({ diagram: diagramToAdd });
        await seedDiagramRoom(diagramToAdd);
        navigate(`/diagrams/${diagramToAdd.id}`);
    }, [addDiagram, deleteDiagram, navigate, template]);

    useEffect(() => {
        if (!template) {
            navigate('/templates');
        } else {
            cloneTemplate();
        }
    }, [template, navigate, cloneTemplate]);

    return (
        <section className="flex w-screen flex-col bg-background">
            <Spinner size={'large'} className="mt-20 text-pink-600" />
        </section>
    );
};

export const CloneTemplatePage: React.FC = () => (
    <LocalConfigProvider>
        <StorageProvider>
            <ThemeProvider>
                <CloneTemplateComponent />
            </ThemeProvider>
        </StorageProvider>
    </LocalConfigProvider>
);
