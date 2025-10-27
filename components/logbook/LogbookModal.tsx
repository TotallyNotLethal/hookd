'use client';

import { X } from 'lucide-react';

import Modal from '@/components/ui/Modal';

import LogbookContent from './LogbookContent';

type LogbookModalProps = {
  open: boolean;
  onClose: () => void;
};

export default function LogbookModal({ open, onClose }: LogbookModalProps) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="logbook-modal-title" contentClassName="max-w-3xl">
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="logbook-modal-title" className="text-xl font-semibold text-white">
              Personal Logbook
            </h2>
            <p className="text-sm text-white/60">Record catches without leaving your profile.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            aria-label="Close logbook"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <LogbookContent showIntroduction={false} />
        </div>
      </div>
    </Modal>
  );
}
