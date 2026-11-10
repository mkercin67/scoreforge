/**
 * Main application toolbar containing score management, note input mode controls,
 * duration palette, zoom selector, and localization controls.
 */

import React from 'react';
import { BaseDurationType } from '../core/model';
import { Language, NoteNameStyle, useI18n } from './i18n';

export interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  canResetOverride?: boolean;
  onResetOverride?: () => void;
  onOpenNewScore: () => void;
  isInputMode: boolean;
  onToggleInputMode: () => void;
  activeDuration: BaseDurationType;
  onChangeDuration: (d: BaseDurationType) => void;
  activeDots: number;
  onToggleDot: () => void;
  isRestSelected: boolean;
  onToggleRest: () => void;
}

const DURATIONS: { type: BaseDurationType; label: string; shortcut: string; icon: string }[] = [
  { type: 'whole', label: 'palette.duration.whole', shortcut: '7', icon: '𝅝' },
  { type: 'half', label: 'palette.duration.half', shortcut: '6', icon: '𝅗𝅥' },
  { type: 'quarter', label: 'palette.duration.quarter', shortcut: '5', icon: '𝅘𝅥' },
  { type: 'eighth', label: 'palette.duration.eighth', shortcut: '4', icon: '𝅘𝅥𝅮' },
  { type: '16th', label: 'palette.duration.16th', shortcut: '3', icon: '𝅘𝅥𝅯' },
  { type: '32nd', label: 'palette.duration.32nd', shortcut: '2', icon: '𝅘𝅥𝅰' },
];

export const Toolbar: React.FC<ToolbarProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  canResetOverride = false,
  onResetOverride,
  onOpenNewScore,
  isInputMode,
  onToggleInputMode,
  activeDuration,
  onChangeDuration,
  activeDots,
  onToggleDot,
  isRestSelected,
  onToggleRest,
}) => {
  const { t, language, setLanguage, noteNameStyle, setNoteNameStyle, zoom, setZoom } = useI18n();

  const handleButtonClick = (cb: () => void) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.blur();
    cb();
  };

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.6rem 1.25rem',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}
    >
      {/* Left section: App Title, New, Undo, Redo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <h1
          style={{
            fontSize: '1.2rem',
            fontWeight: 700,
            margin: 0,
            color: '#0f172a',
            letterSpacing: '-0.025em',
            marginRight: '0.25rem',
          }}
        >
          ScoreForge
        </h1>

        <button
          type="button"
          onClick={handleButtonClick(onOpenNewScore)}
          onMouseDown={(e) => e.preventDefault()}
          title={t('dialog.newScore.title')}
          style={{
            padding: '0.4rem 0.75rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#ffffff',
            backgroundColor: '#0284c7',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          + {t('toolbar.new')}
        </button>

        <div style={{ width: '1px', height: '22px', backgroundColor: '#e2e8f0', margin: '0 0.25rem' }} />

        <button
          type="button"
          onClick={handleButtonClick(onUndo)}
          onMouseDown={(e) => e.preventDefault()}
          disabled={!canUndo}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.4rem 0.65rem',
            fontSize: '0.85rem',
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
          onClick={handleButtonClick(onRedo)}
          onMouseDown={(e) => e.preventDefault()}
          disabled={!canRedo}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.4rem 0.65rem',
            fontSize: '0.85rem',
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
        <button
          type="button"
          onClick={handleButtonClick(onResetOverride ?? (() => {}))}
          onMouseDown={(e) => e.preventDefault()}
          disabled={!canResetOverride}
          title={`${t('toolbar.resetPosition')} (Ctrl+0)`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.4rem 0.65rem',
            fontSize: '0.85rem',
            fontWeight: 500,
            color: canResetOverride ? '#1e293b' : '#94a3b8',
            backgroundColor: canResetOverride ? '#f1f5f9' : '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            cursor: canResetOverride ? 'pointer' : 'not-allowed',
          }}
        >
          ⟲ {t('toolbar.resetPosition')}
        </button>
      </div>

      {/* Middle section: Note Input Mode & Duration Palette */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={handleButtonClick(onToggleInputMode)}
          onMouseDown={(e) => e.preventDefault()}
          title={`${t('toolbar.noteInput')} (N)`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.8rem',
            fontSize: '0.85rem',
            fontWeight: 600,
            color: isInputMode ? '#ffffff' : '#1e293b',
            backgroundColor: isInputMode ? '#2563eb' : '#f1f5f9',
            border: `1px solid ${isInputMode ? '#1d4ed8' : '#cbd5e1'}`,
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: isInputMode ? '0 1px 3px rgba(37,99,235,0.3)' : 'none',
          }}
        >
          <span>🎵</span>
          <span>{t('toolbar.noteInput')} (N)</span>
        </button>

        {/* Palette buttons */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            backgroundColor: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '2px',
            gap: '2px',
          }}
        >
          {DURATIONS.map((dur) => {
            const isActive = activeDuration === dur.type && !isRestSelected;
            return (
              <button
                key={dur.type}
                type="button"
                onClick={handleButtonClick(() => onChangeDuration(dur.type))}
                onMouseDown={(e) => e.preventDefault()}
                title={t(dur.label)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '30px',
                  fontSize: '1.2rem',
                  lineHeight: 1,
                  backgroundColor: isActive ? '#dbeafe' : 'transparent',
                  color: isActive ? '#1d4ed8' : '#334155',
                  border: isActive ? '1px solid #93c5fd' : '1px solid transparent',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: isActive ? 700 : 400,
                }}
              >
                {dur.icon}
              </button>
            );
          })}

          <div style={{ width: '1px', height: '20px', backgroundColor: '#e2e8f0', margin: '0 2px' }} />

          {/* Dot button */}
          <button
            type="button"
            onClick={handleButtonClick(onToggleDot)}
            onMouseDown={(e) => e.preventDefault()}
            title={t('palette.dot')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '30px',
              height: '30px',
              fontSize: '1.3rem',
              lineHeight: 1,
              backgroundColor: activeDots > 0 ? '#dbeafe' : 'transparent',
              color: activeDots > 0 ? '#1d4ed8' : '#334155',
              border: activeDots > 0 ? '1px solid #93c5fd' : '1px solid transparent',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 800,
            }}
          >
            •
          </button>

          {/* Rest toggle button */}
          <button
            type="button"
            onClick={handleButtonClick(onToggleRest)}
            onMouseDown={(e) => e.preventDefault()}
            title={t('palette.rest')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 6px',
              height: '30px',
              fontSize: '1rem',
              lineHeight: 1,
              backgroundColor: isRestSelected ? '#dbeafe' : 'transparent',
              color: isRestSelected ? '#1d4ed8' : '#334155',
              border: isRestSelected ? '1px solid #93c5fd' : '1px solid transparent',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            𝄽
          </button>
        </div>
      </div>

      {/* Right section: Zoom, NoteNameStyle, Language */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        {/* Zoom selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <label htmlFor="zoom-select" style={{ fontSize: '0.825rem', color: '#64748b' }}>
            {t('toolbar.zoom')}:
          </label>
          <select
            id="zoom-select"
            value={zoom}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              e.target.blur();
              setZoom(val);
            }}
            style={{
              padding: '0.35rem 0.6rem',
              fontSize: '0.825rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            <option value={0.75}>75%</option>
            <option value={1.0}>100%</option>
            <option value={1.5}>150%</option>
            <option value={2.0}>200%</option>
          </select>
        </div>

        {/* Note name style */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <label htmlFor="notename-select" style={{ fontSize: '0.825rem', color: '#64748b' }}>
            {t('toolbar.noteNameStyle')}:
          </label>
          <select
            id="notename-select"
            value={noteNameStyle}
            onChange={(e) => {
              const val = e.target.value as NoteNameStyle;
              e.target.blur();
              setNoteNameStyle(val);
            }}
            style={{
              padding: '0.35rem 0.6rem',
              fontSize: '0.825rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            <option value="solfege">{t('toolbar.styleSolfege')}</option>
            <option value="letter">{t('toolbar.styleLetter')}</option>
          </select>
        </div>

        {/* Language select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <label htmlFor="language-select" style={{ fontSize: '0.825rem', color: '#64748b' }}>
            {t('toolbar.language')}:
          </label>
          <select
            id="language-select"
            value={language}
            onChange={(e) => {
              const val = e.target.value as Language;
              e.target.blur();
              setLanguage(val);
            }}
            style={{
              padding: '0.35rem 0.6rem',
              fontSize: '0.825rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#334155',
              cursor: 'pointer',
            }}
          >
            <option value="tr">{t('toolbar.langTr')}</option>
            <option value="en">{t('toolbar.langEn')}</option>
          </select>
        </div>
      </div>
    </header>
  );
};
