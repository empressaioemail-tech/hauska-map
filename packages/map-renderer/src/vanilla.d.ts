/**
 * Ambient declarations for the ported vanilla JS map modules.
 * These carry the runtime contract as consumed by FloatingMap.tsx.
 */

declare module "./map-renderer.js" {
  export interface MapRenderer {
    mount(slot: HTMLElement): void;
    resize(width?: number, height?: number): void;
    setLayerVisibility(visible: Set<string> | string[]): void;
    setOverlays(specs: import("./postMessage").OverlaySpec[]): void;
    bindContext(ctx: {
      center?: { latitude: number; longitude: number };
      address?: string;
      useFixture?: boolean;
      onParcelSelect?: (selection: any) => void;
    }): void;
    getViewState(): {
      center: [number, number];
      zoom: number;
      pitch: number;
      bearing: number;
    };
    setViewState(vs: Partial<{
      center: [number, number];
      zoom: number;
      pitch: number;
      bearing: number;
    }>): void;
    destroy(): void;
    getMap(): any;
    getSlots(): any[];
  }
  export function createMapRenderer(): MapRenderer;
  export const RENDERER_CONTRACT: {
    signals: string[];
    contextFields: string[];
    preserves: string[];
  };
}

declare module "./map/overlay-render.js" {
  import type { OverlaySpec } from "./postMessage";
  export const OVERLAY_PREFIX: string;
  export function overlaySourceId(layerKey: string): string;
  export function reconcileOverlays(
    map: any,
    specs: OverlaySpec[],
    currentKeys: Set<string>,
  ): Set<string>;
}

declare module "./window-manager/floating-window.js" {
  export interface FloatingWindow {
    getState(): string;
    transition(next: string): void;
    snap(edge?: "left" | "right"): void;
    float(): void;
    minimize(): void;
    dockToHeader(): void;
    restoreFromHeader(): void;
    maximize(): void;
    close(): void;
    open(): void;
  }
  export function createFloatingWindow(opts: {
    host: HTMLElement;
    titleBar: HTMLElement;
    content: HTMLElement;
    headerDockHost?: HTMLElement;
    onStateChange?: (state: string, prev: string) => void;
    captureViewState?: () => any;
    restoreViewState?: (vs: any) => void;
    onResize?: () => void;
  }): FloatingWindow;
  export const WINDOW_STATES: string[];
}

declare module "./input-gates.js" {
  export function probeInputGates(config: any, liveSignals?: any): any;
  export function reasoningLayerLive(layerKey: string, gates: any): boolean;
  export function reasoningLayerAwaitingReason(
    layerKey: string,
    gates: any,
  ): boolean;
}

declare module "./report-layer-manifest.js" {
  export const REPORT_LAYER_MANIFEST_VERSION: string;
  export const REPORT_LAYER_MANIFESTS: Record<string, any>;
  export function resolveReportLayerManifest(input: any): any;
  export function visibleLayersFromManifest(
    manifest: any,
    existing?: Set<string>,
  ): Set<string>;
  export function parseReportLayerManifest(value: any): any;
}

declare module "./positioning.js" {
  export const POSITIONING_FOOTER: string;
  export const POSITIONING_TAGLINE: string;
  export const POSITIONING_MAP_NOTE: string;
}

declare module "./read-contract/index.js" {
  export function isReadContract(value: any): boolean;
  export function isLegacyScalarConfidence(value: any): boolean;
  export function isWidthedConfidence(value: any): boolean;
  export function extractEnvelopeReadContract(envelope: any): any;
  export function isRenderableEnvelope(envelope: any): boolean;
  export function envelopeIntervalWidth(envelope: any): number | null;
  export function saturationFromIntervalWidth(intervalWidth: any): number;
  export function envelopeSaturation(envelope: any): number;
  export function formatWidthedConfidence(conf: any): string;
  export function formatReadContractSummary(contract: any): string;
  export function createReadContract(...args: any[]): any;
  export function createThreeAxisConfidence(...args: any[]): any;
  export function createWidthedConfidence(...args: any[]): any;
  export function createConsequenceAxis(...args: any[]): any;
  export const READ_CONTRACT_SCHEMA: any;
  export const WIDTHED_CONFIDENCE_SCHEMA: any;
}

declare module "./layer-registry.js" {
  export const LAYER_REGISTRY: any[];
  export const DEFAULT_VISIBLE_LAYERS: Set<string>;
  export function registryEntry(key: string): any;
  export function setLayerDisabled(key: string, disabled: boolean): void;
  export function isLayerDisabled(key: string): boolean;
  export function visibleLayersForAllocation(
    appId: string,
    reportType: string,
    tier?: string,
  ): Set<string>;
  export function legendEntriesForRegistry(
    visibleKeys?: any,
    gates?: any,
  ): any[];
  export function layerStatusForGates(gates: any, key: string): string;
  export function stylingForLayer(key: string): any;
  export function resolveLayerAllocation(input: any): any;
  export function listAllocationKeys(): string[];
}
