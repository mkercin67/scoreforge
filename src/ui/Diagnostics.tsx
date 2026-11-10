/**
 * Hidden Diagnostics Overlay Panel (toggled via Ctrl+Alt+D).
 *
 * Displays:
 * - Last 20 keystrokes keydown-to-next-paint times (two rAFs)
 * - Event Timing breakdown (inputDelay / processingTime / presentationDelay)
 * - Long-animation-frame (LoAF) entries with forcedStyleAndLayoutDuration
 * - SVG element count and <text> element count
 * - Plaintext report copy button
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
  const [domCounts, setDomCounts] = useState<{ svg: number; text: number; total: number }>({
    svg: 0,
    text: 0,
    total: 0,
  });
  const [loafEntries, setLoafEntries] = useState<
    Array<{ duration: number; forcedStyleAndLayoutDuration: number }>
  >([]);

  // Long-animation-frame (LoAF) performance observer
  useEffect(() => {
    try {
      if (
        typeof PerformanceObserver !== 'undefined' &&
        PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')
      ) {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const e = entry as PerformanceEntry & { forcedStyleAndLayoutDuration?: number };
            setLoafEntries((prev) => [
              ...prev.slice(-19),
              {
                duration: Number(e.duration.toFixed(1)),
                forcedStyleAndLayoutDuration: Number(
                  (e.forcedStyleAndLayoutDuration ?? 0).toFixed(1)
                ),
              },
            ]);
          }
        });
        observer.observe({ type: 'long-animation-frame', buffered: true });
        return () => observer.disconnect();
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const updateDomCounts = () => {
      const svgEls = document.querySelectorAll('svg *').length;
      const textEls = document.querySelectorAll('svg text').length;
      const totalEls = document.querySelectorAll('*').length;
      setDomCounts({ svg: svgEls, text: textEls, total: totalEls });
    };

    updateDomCounts();
    const interval = setInterval(updateDomCounts, 500);
    return () => clearInterval(interval);
  }, [isOpen, samples.length]);

  if (!isOpen) return null;

  const isTextFallback =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('text');

  const last20 = samples.slice(-20);
  const totals = last20.map((s) => s.totalDuration);
  const inputDelays = last20.map((s) => s.inputDelay);
  const handlerDurations = last20.map((s) => s.handlerDuration);
  const paintDurations = last20.map((s) => s.paintDuration);

  const latest = last20[last20.length - 1];
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

  const latestLoaf = loafEntries[loafEntries.length - 1];

  const handleCopy = () => {
    const report = [
      '=== ScoreForge Diagnostics Report ===',
      `Tarih: ${new Date().toISOString()}`,
      `Render Modu: ${isTextFallback ? 'TEXT (?text fallback)' : 'PATH (<use> vector glyphs)'}`,
      `Son 20 Tuş Örneği:`,
      last20.map((s) => `  ${s.key}: total=${s.totalDuration}ms (input=${s.inputDelay}ms, handler=${s.handlerDuration}ms, paint=${s.paintDuration}ms)`).join('\n'),
      '',
      '[Keydown-to-Paint (Son 20 Tuş)]',
      `Son: ${latest ? `${latest.totalDuration} ms (${latest.key})` : 'N/A'}`,
      `Ortalama: ${meanTotal} ms`,
      `p50: ${p50} ms`,
      `p95: ${p95} ms`,
      '',
      '[Event Timing Dağılımı (Ortalama)]',
      `Girdi Gecikmesi (inputDelay): ${avgInput} ms`,
      `İşlem Süresi (processingTime): ${avgHandler} ms`,
      `Çizim Süresi (presentationDelay / RAF2): ${avgPaint} ms`,
      '',
      '[Long Animation Frame (LoAF)]',
      `Son LoAF Süresi: ${latestLoaf ? `${latestLoaf.duration} ms` : 'Yok (temiz)'}`,
      `Forced Style & Layout: ${latestLoaf ? `${latestLoaf.forcedStyleAndLayoutDuration} ms` : '0 ms'}`,
      '',
      '[DOM Eleman Sayısı]',
      `SVG Elemanları: ${domCounts.svg}`,
      `<text> Elemanları: ${domCounts.text} (${domCounts.text === 0 ? 'Mükemmel (Sıfır text)' : 'Text modu etkin'})`,
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
        width: '360px',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: isTextFallback ? '#ca8a04' : '#16a34a',
              color: '#ffffff',
            }}
          >
            {isTextFallback ? '?text' : 'paths'}
          </span>
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
      </div>

      <div style={{ marginBottom: '8px' }}>
        <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>
          Keydown-to-Paint (Son 20 Tuş)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px' }}>
          <div>Son: <span style={{ color: '#4ade80' }}>{latest ? `${latest.totalDuration} ms` : '-'}</span></div>
          <div>Örnek: <span>{last20.length}</span></div>
          <div>p50: <span style={{ color: '#38bdf8' }}>{p50} ms</span></div>
          <div>p95: <span style={{ color: p95 <= 50 ? '#4ade80' : '#f87171' }}>{p95} ms</span></div>
        </div>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>
          Event Timing Dağılımı (Ort.)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2px', marginTop: '4px' }}>
          <div>inputDelay: <span>{avgInput} ms</span></div>
          <div>processingTime: <span>{avgHandler} ms</span></div>
          <div>presentationDelay: <span>{avgPaint} ms</span></div>
        </div>
      </div>

      <div style={{ marginBottom: '8px' }}>
        <div style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase' }}>
          DOM & Long Animation Frames (LoAF)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px' }}>
          <div>SVG Eleman: <span>{domCounts.svg}</span></div>
          <div>
            &lt;text&gt; Sayısı:{' '}
            <span style={{ color: domCounts.text === 0 ? '#4ade80' : '#facc15' }}>
              {domCounts.text}
            </span>
          </div>
          <div>LoAF Süresi: <span>{latestLoaf ? `${latestLoaf.duration} ms` : 'Temiz'}</span></div>
          <div>
            Forced Layout:{' '}
            <span style={{ color: (latestLoaf?.forcedStyleAndLayoutDuration ?? 0) === 0 ? '#4ade80' : '#f87171' }}>
              {latestLoaf ? `${latestLoaf.forcedStyleAndLayoutDuration} ms` : '0 ms'}
            </span>
          </div>
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
