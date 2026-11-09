/**
 * Main application toolbar containing undo/redo and localization controls.
 */

import React from 'react';
import { Language, NoteNameStyle, useI18n } from './i18n';

export interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  const { t, language, setLanguage, noteNameStyle, setNoteNameStyle } = useI18n();

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1.5rem',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            margin: 0,
            color: '#1e293b',
            letterSpacing: '-0.025em',
          }}
        >
          ScoreForge
        </h1>
        <div style={{ width: '1px', height: '24px', backgroundColor: '#e2e8f0', margin: '0 0.5rem' }} />
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.4rem 0.8rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: canUndo ? '#1e293b' : '#94a3b8',
            backgroundColor: canUndo ? '#f1f5f9' : '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            cursor: canUndo ? 'pointer' : 'not-allowed',
          }}
        >
          ↶ {t('toolbar.undo')}
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.4rem 0.8rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: canRedo ? '#1e293b' : '#94a3b8',
            backgroundColor: canRedo ? '#f1f5f9' : '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            cursor: canRedo ? 'pointer' : 'not-allowed',
          }}
        >
          ↷ {t('toolbar.redo')}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="language-select" style={{ fontSize: '0.875rem', color: '#64748b' }}>
            {t('toolbar.language')}:
          </label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
            style={{
              padding: '0.4rem 0.6rem',
              fontSize: '0.875rem',
              color: '#1e293b',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <option value="tr">{t('toolbar.langTr')}</option>
            <option value="en">{t('toolbar.langEn')}</option>
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label htmlFor="notename-select" style={{ fontSize: '0.875rem', color: '#64748b' }}>
            {t('toolbar.noteNameStyle')}:
          </label>
          <select
            id="notename-select"
            value={noteNameStyle}
            onChange={(e) => setNoteNameStyle(e.target.value as NoteNameStyle)}
            style={{
              padding: '0.4rem 0.6rem',
              fontSize: '0.875rem',
              color: '#1e293b',
              backgroundColor: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <option value="solfege">{t('toolbar.styleSolfege')}</option>
            <option value="letter">{t('toolbar.styleLetter')}</option>
          </select>
        </div>
      </div>
    </header>
  );
};
