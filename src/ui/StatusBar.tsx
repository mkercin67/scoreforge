/**
 * Status bar presenting details of the currently selected event and editor hints.
 */

import React from 'react';
import { formatPitchName, useI18n } from './i18n';
import { SelectedEventInfo } from './useEditor';

export interface StatusBarProps {
  selection: SelectedEventInfo | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({ selection }) => {
  const { t, language, noteNameStyle } = useI18n();

  const renderSelectionText = () => {
    if (!selection) {
      return (
        <span style={{ color: '#64748b', fontStyle: 'italic' }}>
          {t('status.noSelection')}
        </span>
      );
    }

    const { measureNumber, isChord, isNote, isRest, pitches, baseType } = selection;
    const durationKey = isRest ? `duration.${baseType}.rest` : `duration.${baseType}.note`;
    const durationText = t(durationKey);

    if (isChord) {
      const pitchesText = pitches
        .map((p) => formatPitchName(p, noteNameStyle, language))
        .join(', ');
      return (
        <span>
          {t('status.chordInfo', {
            measure: measureNumber,
            pitches: pitchesText,
            duration: durationText,
          })}
        </span>
      );
    }

    if (isNote && pitches.length > 0) {
      const pitchText = formatPitchName(pitches[0], noteNameStyle, language);
      return (
        <span>
          {t('status.noteInfo', {
            measure: measureNumber,
            pitch: pitchText,
            duration: durationText,
          })}
        </span>
      );
    }

    if (isRest) {
      return (
        <span>
          {t('status.restInfo', {
            measure: measureNumber,
            duration: durationText,
          })}
        </span>
      );
    }

    return null;
  };

  return (
    <footer
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.6rem 1.5rem',
        backgroundColor: '#f8fafc',
        borderTop: '1px solid #e2e8f0',
        fontSize: '0.875rem',
        color: '#334155',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 500 }}>
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: selection ? '#2563eb' : '#94a3b8',
          }}
        />
        {renderSelectionText()}
      </div>

      <div style={{ display: 'flex', gap: '1rem', color: '#64748b', fontSize: '0.8rem' }}>
        <span>{t('shortcut.transpose')}</span>
        <span>•</span>
        <span>{t('shortcut.delete')}</span>
        <span>•</span>
        <span>{t('shortcut.navigate')}</span>
      </div>
    </footer>
  );
};
