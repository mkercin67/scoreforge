/**
 * Hidden Diagnostics Overlay Panel (toggled via Ctrl+Alt+D).
 *
 * Displays real-time keydown-to-paint timing, Event Timing breakdown,
 * layout cache hit rates, and live DOM element counts.
 */

import React, { useEffect, useState } from 'react';
import { measureLayoutCacheStats } from '../layout/layoutScore';
import { useI18n } from './i18n';

export interface PerfSample {
  timestamp: number;
  key: string;
  inputDelay: number;
  handlerDuration: number;
  paintDuration: number;
  totalDuration: number;
}

export interface DiagnosticsProps {
  isOpen: boolean;
  onClose: () => void;
  samples: PerfSample[];
}

function calcPercentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * (p / 100)));
  return Number(sorted[idx].toFixed(2));
}

function calcMean(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((acc, v) => acc + v, 0);
  return Number((sum / arr.length).toFixed(2));
}

export const Diagnostics: React.FC<DiagnosticsProps> = ({ isOpen, onClose, samples }) => {
  const { t } = useI18n();
  const [copied, setCopied] = useState<boolean>(false);
  const [domCounts, setDomCounts] = useState<{ svg: number; total: number }>({ svg: 0, total: 0 });

  useEffect(() => {
    if (!isOpen) return;
    const updateDomCounts = () => {
      const svgEls = document.querySelectorAll('svg *').length;
      const totalEls = document.querySelectorAll('*').length;
      setDomCounts({ svg: svgEls, total: totalEls });
    };

    updateDomCounts();
    const interval = setInterval(updateDomCounts, 500);
    return () => clearInterval(interval);
  }, [isOpen, samples.length]);

  if (!isOpen) return null;

  const totals = samples.map((s) => s.totalDuration);
  const inputDelays = samples.map((s) => s.inputDelay);
  const handlerDurations = samples.map((s) => s.handlerDuration);
  const paintDurations = samples.map((s) => s.paintDuration);

  const latest = samples[samples.length - 1];
  const p50 = calcPercentile(totals, 50);
  const p95 = calcPercentile(totals, 95);
  const meanTotal = calcMean(totals);
  const avgInput = calcMean(inputDelays);
  const avgHandler = calcMean(handlerDurations);
  const avgPaint = calcMean(paintDurations);

  const cacheCalls = measureLayoutCacheStats.calls;
  const cacheHits = measureLayoutCacheStats.hits;
  const cacheMisses = measureLayoutCacheStats.misses;
  const hitRate = cacheCalls > 0 ? ((cacheHits / cacheCalls) * 100).toFixed(1) : '0';

  const handleCopy = () => {
    const report = [
      '=== ScoreForge Diagnostics Report ===',
      `Tarih: ${new Date().toISOString()}`,
      `Örneklem Sayısı: ${samples.length}`,
      '',
      '[Keydown-to-Paint]',
      `Son: ${latest ? `${latest.totalDuration} ms (${latest.key})` : 'N/A'}`,
      `Ortalama: ${meanTotal} ms`,
      `p50: ${p50} ms`,
      `p95: ${p95} ms`,
      '',
      '[Event Timing Dağılımı (Ortalama)]',
      `Girdi Gecikmesi (Input Delay): ${avgInput} ms`,
      `İşlem Süresi (Handler): ${avgHandler} ms`,
      `Çizim Süresi (Paint / RAF2): ${avgPaint} ms`,
      '',
      '[DOM Eleman Sayısı]',
      `SVG Elemanları: ${domCounts.svg}`,
      `Toplam DOM Elemanları: ${domCounts.total}`,
      '',
      '[Ölçü Önbelleği (Layout Cache)]',
      `Çağrılar: ${cacheCalls}`,
      `İsabet (Hits): ${cacheHits}`,
      `Iska (Misses): ${cacheMisses}`,
      `İsabet Oranı: %${hitRate}`,
      '=====================================',
    ].join('\n');

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(report).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '340px',
        backgroundColor: 'rgba(15, 23, 42, 0.94)',
        backdropFilter: 'blur(8px)',
        color: '#f8fafc',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
        padding: '14px',
        fontFamily: 'ui-monospace, monospace',
        fontSize: '12px',
        zIndex: 99999,
        lineHeight: 1.4,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.15)',
          paddingBottom: '8px',
          marginBottom: '10px',
        }}
      >
        <span style={{ fontWeight: 600, color: '#38bdf8' }}>{t('diagnostics.title')}</span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '2px 6px',
          }}
          title={t('diagnostics.close')}
        >
          ✕
        </button>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>
          Keydown-to-Paint (ms)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px' }}>
          <div>Son: <span style={{ color: '#4ade80' }}>{latest ? `${latest.totalDuration} ms` : '-'}</span></div>
          <div>Örnek: <span>{samples.length}</span></div>
          <div>p50: <span style={{ color: '#38bdf8' }}>{p50} ms</span></div>
          <div>p95: <span style={{ color: p95 <= 50 ? '#4ade80' : '#f87171' }}>{p95} ms</span></div>
        </div>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>
          Event Timing Dağılımı (Ort.)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2px', marginTop: '4px' }}>
          <div>Girdi Gecikmesi: <span>{avgInput} ms</span></div>
          <div>İşlem (Handler): <span>{avgHandler} ms</span></div>
          <div>Çizim (Paint): <span>{avgPaint} ms</span></div>
        </div>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>
          DOM & Önbellek
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px' }}>
          <div>SVG Eleman: <span>{domCounts.svg}</span></div>
          <div>Toplam DOM: <span>{domCounts.total}</span></div>
          <div>Önbellek İsabet: <span>{cacheHits}/{cacheCalls}</span></div>
          <div>Oran: <span style={{ color: '#4ade80' }}>%{hitRate}</span></div>
        </div>
      </div>

      <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
        <button
          onClick={handleCopy}
          style={{
            flex: 1,
            backgroundColor: copied ? '#16a34a' : '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 12px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 500,
            transition: 'background-color 0.15s ease',
          }}
        >
          {copied ? t('diagnostics.copied') : t('diagnostics.copy')}
        </button>
      </div>
    </div>
  );
};
