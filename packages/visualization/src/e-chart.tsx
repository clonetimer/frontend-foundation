import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { useEffect, useRef } from 'react';
import { useTheme } from '@foundation/theme';

export interface EChartProps {
  option: EChartsOption;
  height?: number | string;
  loading?: boolean;
  renderer?: 'canvas' | 'svg';
  notMerge?: boolean;
  lazyUpdate?: boolean;
  ariaLabel?: string;
  onReady?: (chart: ReturnType<typeof echarts.init>) => void;
}

export function EChart({
  option,
  height = 320,
  loading = false,
  renderer = 'canvas',
  notMerge = false,
  lazyUpdate = false,
  ariaLabel = '数据图表',
  onReady
}: EChartProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);
  const onReadyRef = useRef(onReady);
  const { resolvedMode } = useTheme();

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const chart = echarts.init(element, resolvedMode === 'dark' ? 'dark' : undefined, { renderer });
    chartRef.current = chart;
    onReadyRef.current?.(chart);

    let resizeObserver: ResizeObserver | undefined;
    const resize = () => chart.resize();
    if (typeof globalThis.ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(element);
    } else {
      globalThis.addEventListener?.('resize', resize);
    }

    return () => {
      resizeObserver?.disconnect();
      globalThis.removeEventListener?.('resize', resize);
      chart.dispose();
      chartRef.current = null;
    };
  }, [renderer, resolvedMode]);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge, lazyUpdate });
  }, [lazyUpdate, notMerge, option, renderer, resolvedMode]);

  useEffect(() => {
    if (loading) chartRef.current?.showLoading('default');
    else chartRef.current?.hideLoading();
  }, [loading, renderer, resolvedMode]);

  return <div ref={ref} role="img" aria-label={ariaLabel} style={{ width: '100%', height }} />;
}
