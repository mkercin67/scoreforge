/**
 * Status bar presenting details of the currently selected event, note input mode status,
 * temporary error messages, and editor hints.
 */

import React from 'react';
import { BaseDurationType, Pitch } from '../core/model';
import { formatPitchName, useI18n } from './i18n';
import { SelectedEventInfo } from './useEditor';

export interface StatusBarProps {
  selection: SelectedEventInfo | null;
  isInputMode?: boolean;
  activeDuration?: BaseDurationType;
  currentMeasureNumber?: number;
  rejectedMessage?: string | null;
  hasOverride?: boolean;
  hoverPitch?: Pitch | null;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  selection,
  isInputMode = false,
  activeDuration = 'quarter',
  currentMeasureNumber = 1,
  rejectedMessage = null,
  hasOverride = false,
  hoverPitch = null,
}) => {
  const { t, language, noteNameStyle } = useI18n();

  const renderStatusContent = () => {
    // 1. Priority: Temporary rejected entry error message (shown in red for 2 seconds)
    if (rejectedMessage) {
      return (
        <span style={{ color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span>⚠</span>
          <span>{rejectedMessage}</span>
        </span>
      );
    }

    // 2. Note Input Mode info: "Nota girişi · Dörtlük nota · Ölçü 2"
    if (isInputMode) {
      const durationText = t(`duration.${activeDuration}.note`);
      const hoverText = hoverPitch
        ? ` · ${formatPitchName(hoverPitch, noteNameStyle, language)}`
        : '';
      return (
        <span style={{ color: '#1d4ed8', fontWeight: 600 }}>
          {t('status.inputMode', {
            duration: durationText,
            measure: currentMeasureNumber,
          })}
          {hoverText}
        </span>
      );
    }

    // 3. Normal selection inspection
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
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          <span>
            {t('status.chordInfo', {
              measure: measureNumber,
              pitches: pitchesText,
              duration: durationText,
            })}
          </span>
          {hasOverride && (
            <span
              style={{
                marginLeft: '0.6rem',
                padding: '0.1rem 0.45rem',
                fontSize: '0.75rem',
                backgroundColor: '#e0e7ff',
                color: '#3730a3',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              {t('status.manuallyPositioned')}
            </span>
          )}
        </span>
      );
    }

    if (isNote && pitches.length > 0) {
      const pitchText = formatPitchName(pitches[0], noteNameStyle, language);
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          <span>
            {t('status.noteInfo', {
              measure: measureNumber,
              pitch: pitchText,
              duration: durationText,
            })}
          </span>
          {hasOverride && (
            <span
              style={{
                marginLeft: '0.6rem',
                padding: '0.1rem 0.45rem',
                fontSize: '0.75rem',
                backgroundColor: '#e0e7ff',
                color: '#3730a3',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              {t('status.manuallyPositioned')}
            </span>
          )}
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
            backgroundColor: rejectedMessage
              ? '#dc2626'
              : isInputMode
              ? '#2563eb'
              : selection
              ? '#2563eb'
              : '#94a3b8',
          }}
        />
        {renderStatusContent()}
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
