/**
 * Dialog for creating a new empty musical score.
 *
 * Configures clef, key signature (-7..+7), time signature, and measure count,
 * with confirmation if the current score has unsaved changes.
 */

import React, { useState } from 'react';
import { Clef } from '../core/model';
import { useI18n } from './i18n';

export interface NewScoreConfig {
  clef: Clef;
  keySig: number;
  timeSig: { num: number; den: number };
  measures: number;
}

export interface NewScoreModalProps {
  isOpen: boolean;
  canUndo: boolean;
  onClose: () => void;
  onCreate: (config: NewScoreConfig) => void;
}

const KEY_SIGNATURE_OPTIONS: { value: number; labelTr: string; labelEn: string }[] = [
  { value: -7, labelTr: 'Dob majör (7♭)', labelEn: 'Cb major (7♭)' },
  { value: -6, labelTr: 'Solb majör (6♭)', labelEn: 'Gb major (6♭)' },
  { value: -5, labelTr: 'Reb majör (5♭)', labelEn: 'Db major (5♭)' },
  { value: -4, labelTr: 'Lab majör (4♭)', labelEn: 'Ab major (4♭)' },
  { value: -3, labelTr: 'Mib majör (3♭)', labelEn: 'Eb major (3♭)' },
  { value: -2, labelTr: 'Sib majör (2♭)', labelEn: 'Bb major (2♭)' },
  { value: -1, labelTr: 'Fa majör (1♭)', labelEn: 'F major (1♭)' },
  { value: 0, labelTr: 'Do majör (0)', labelEn: 'C major (0)' },
  { value: 1, labelTr: 'Sol majör (1♯)', labelEn: 'G major (1♯)' },
  { value: 2, labelTr: 'Re majör (2♯)', labelEn: 'D major (2♯)' },
  { value: 3, labelTr: 'La majör (3♯)', labelEn: 'A major (3♯)' },
  { value: 4, labelTr: 'Mi majör (4♯)', labelEn: 'E major (4♯)' },
  { value: 5, labelTr: 'Si majör (5♯)', labelEn: 'B major (5♯)' },
  { value: 6, labelTr: 'Fa# majör (6♯)', labelEn: 'F# major (6♯)' },
  { value: 7, labelTr: 'Do# majör (7♯)', labelEn: 'C# major (7♯)' },
];

export const NewScoreModal: React.FC<NewScoreModalProps> = ({
  isOpen,
  canUndo,
  onClose,
  onCreate,
}) => {
  const { t, language } = useI18n();

  const [clefSign, setClefSign] = useState<'G' | 'F'>('G');
  const [keySig, setKeySig] = useState<number>(0);
  const [timeSigStr, setTimeSigStr] = useState<string>('4/4');
  const [measureCount, setMeasureCount] = useState<number>(8);
  const [confirmDiscarding, setConfirmDiscarding] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleConfirmSubmit = () => {
    if (canUndo && !confirmDiscarding) {
      setConfirmDiscarding(true);
      return;
    }

    const [num, den] = timeSigStr.split('/').map((s) => parseInt(s, 10));
    const clef: Clef =
      clefSign === 'F' ? { sign: 'F', line: 4 } : { sign: 'G', line: 2 };

    onCreate({
      clef,
      keySig,
      timeSig: { num, den },
      measures: Math.max(1, Math.min(64, measureCount || 8)),
    });
    setConfirmDiscarding(false);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setConfirmDiscarding(false);
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '440px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#0f172a' }}>
            {t('dialog.newScore.title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.25rem',
              color: '#64748b',
              cursor: 'pointer',
              padding: '0.25rem',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {confirmDiscarding && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#991b1b',
              fontSize: '0.875rem',
              lineHeight: 1.4,
            }}
          >
            {t('dialog.newScore.confirmDiscard')}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Clef selection */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 500, color: '#334155' }}>
              {t('dialog.newScore.clef')}
            </label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <label
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  border: `1px solid ${clefSign === 'G' ? '#2563eb' : '#cbd5e1'}`,
                  borderRadius: '6px',
                  backgroundColor: clefSign === 'G' ? '#eff6ff' : '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: clefSign === 'G' ? 600 : 400,
                  color: clefSign === 'G' ? '#1d4ed8' : '#334155',
                }}
              >
                <input
                  type="radio"
                  name="clef"
                  checked={clefSign === 'G'}
                  onChange={() => setClefSign('G')}
                  style={{ accentColor: '#2563eb' }}
                />
                𝄞 {t('notation.trebleClef')}
              </label>
              <label
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  border: `1px solid ${clefSign === 'F' ? '#2563eb' : '#cbd5e1'}`,
                  borderRadius: '6px',
                  backgroundColor: clefSign === 'F' ? '#eff6ff' : '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: clefSign === 'F' ? 600 : 400,
                  color: clefSign === 'F' ? '#1d4ed8' : '#334155',
                }}
              >
                <input
                  type="radio"
                  name="clef"
                  checked={clefSign === 'F'}
                  onChange={() => setClefSign('F')}
                  style={{ accentColor: '#2563eb' }}
                />
                𝄢 {t('notation.bassClef')}
              </label>
            </div>
          </div>

          {/* Key Signature */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label
              htmlFor="keysig-select"
              style={{ fontSize: '0.875rem', fontWeight: 500, color: '#334155' }}
            >
              {t('dialog.newScore.keySignature')}
            </label>
            <select
              id="keysig-select"
              value={keySig}
              onChange={(e) => setKeySig(parseInt(e.target.value, 10))}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#1e293b',
              }}
            >
              {KEY_SIGNATURE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {language === 'tr' ? opt.labelTr : opt.labelEn}
                </option>
              ))}
            </select>
          </div>

          {/* Time Signature */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label
              htmlFor="timesig-select"
              style={{ fontSize: '0.875rem', fontWeight: 500, color: '#334155' }}
            >
              {t('dialog.newScore.timeSignature')}
            </label>
            <select
              id="timesig-select"
              value={timeSigStr}
              onChange={(e) => setTimeSigStr(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#1e293b',
              }}
            >
              <option value="4/4">4/4</option>
              <option value="3/4">3/4</option>
              <option value="2/4">2/4</option>
              <option value="6/8">6/8</option>
            </select>
          </div>

          {/* Number of measures */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label
              htmlFor="measures-input"
              style={{ fontSize: '0.875rem', fontWeight: 500, color: '#334155' }}
            >
              {t('dialog.newScore.measures')} (1..64)
            </label>
            <input
              id="measures-input"
              type="number"
              min={1}
              max={64}
              value={measureCount}
              onChange={(e) => setMeasureCount(parseInt(e.target.value, 10) || 1)}
              style={{
                padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#1e293b',
              }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={() => {
              setConfirmDiscarding(false);
              onClose();
            }}
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#475569',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {t('dialog.cancel')}
          </button>
          <button
            type="button"
            onClick={handleConfirmSubmit}
            style={{
              padding: '0.5rem 1.25rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#ffffff',
              backgroundColor: confirmDiscarding ? '#dc2626' : '#2563eb',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {confirmDiscarding ? t('dialog.confirm') : t('dialog.newScore.create')}
          </button>
        </div>
      </div>
    </div>
  );
};
