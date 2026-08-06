import React, { useEffect, useState } from 'react';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/dialog/dialog';
import { Button } from '@/components/button/button';
import { Input } from '@/components/input/input';
import { useTranslation } from 'react-i18next';

export interface GroupNameDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    initialName?: string;
    onSubmit: (name: string) => Promise<void>;
}

export const GroupNameDialog: React.FC<GroupNameDialogProps> = ({
    open,
    onOpenChange,
    title,
    initialName = '',
    onSubmit,
}) => {
    const { t } = useTranslation();
    const [name, setName] = useState(initialName);
    const [error, setError] = useState<string>();
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setName(initialName);
            setError(undefined);
        }
    }, [open, initialName]);

    const handleSubmit = async () => {
        const trimmed = name.trim();
        if (!trimmed) return;

        setSubmitting(true);
        try {
            await onSubmit(trimmed);
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="flex flex-col" showClose>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <Input
                    autoFocus
                    value={name}
                    onChange={(e) => {
                        setName(e.target.value);
                        setError(undefined);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSubmit();
                    }}
                    placeholder={t(
                        'open_diagram_dialog.group_name_dialog.placeholder'
                    )}
                />
                {error ? (
                    <div className="text-sm text-red-700">{error}</div>
                ) : null}
                <DialogFooter className="flex !justify-between gap-2">
                    <DialogClose asChild>
                        <Button type="button" variant="secondary">
                            {t('open_diagram_dialog.group_name_dialog.cancel')}
                        </Button>
                    </DialogClose>
                    <Button
                        type="button"
                        disabled={!name.trim() || submitting}
                        onClick={handleSubmit}
                    >
                        {t('open_diagram_dialog.group_name_dialog.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
