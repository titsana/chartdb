import React, { useCallback, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/popover/popover';
import { useStorage } from '@/hooks/use-storage';
import { useTranslation } from 'react-i18next';

/**
 * Phase 7 (folder-style diagram grouping, docs/design/
 * realtime-collaboration.md §10): the "+ New group" entry point in the
 * diagram list. Deliberately a plain name-only popover, not a full
 * dialog — creating a group is a one-field action, and this list is
 * already inside a dialog (open-diagram-dialog.tsx) that a nested dialog
 * would stack awkwardly on top of.
 */
export const CreateGroupPopover: React.FC<{
    onCreated: () => void;
}> = ({ onCreated }) => {
    const { createDiagramGroup } = useStorage();
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [creating, setCreating] = useState(false);

    const handleCreate = useCallback(async () => {
        const trimmed = name.trim();
        if (!trimmed || creating) return;
        setCreating(true);
        try {
            await createDiagramGroup({ name: trimmed });
            setName('');
            setOpen(false);
            onCreated();
        } finally {
            setCreating(false);
        }
    }, [name, creating, createDiagramGroup, onCreated]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button type="button" variant="ghost" size="sm">
                    <FolderPlus className="mr-1.5 size-4" />
                    {t('open_diagram_dialog.new_group')}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="start">
                <div className="flex flex-col gap-2">
                    <Input
                        autoFocus
                        placeholder={t(
                            'open_diagram_dialog.new_group_name_placeholder'
                        )}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleCreate();
                            }
                        }}
                    />
                    <Button
                        type="button"
                        size="sm"
                        disabled={!name.trim() || creating}
                        onClick={handleCreate}
                    >
                        {t('open_diagram_dialog.create_group')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
};
